export {}

import { EMBEDDED_FORM_PROVIDERS } from "~lib/embedded-forms"

// No popup.tsx exists anymore, so Chrome doesn't set a default_popup —
// clicking the toolbar icon fires this instead. We open the dashboard as a
// real standalone window (type "popup" = no tab strip/address bar, just our
// UI) sized like an app, not the ~800x600-capped browser action popup Chrome
// would otherwise force us into.
//
// Because the dashboard lives in its OWN window, `chrome.tabs.query({
// currentWindow: true })` from inside it would resolve to the dashboard
// window itself, not the website the user was looking at. So we capture the
// tab the icon was actually clicked on (action.onClicked hands it to us
// directly) and hand that reference to the dashboard via chrome.storage,
// instead of letting the dashboard guess its own "current" tab.
const DASHBOARD_PATH = "tabs/dashboard.html"
const TARGET_TAB_KEY = "trackos:target-tab"

async function rememberTargetTab(tab: chrome.tabs.Tab) {
  if (!tab.id || !tab.url) return
  let origin: string
  try {
    origin = new URL(tab.url).origin
  } catch {
    return
  }
  await chrome.storage.local.set({ [TARGET_TAB_KEY]: { tabId: tab.id, origin, url: tab.url } })
}

async function openOrFocusDashboard(clickedFromTab: chrome.tabs.Tab) {
  await rememberTargetTab(clickedFromTab)

  const dashboardUrl = chrome.runtime.getURL(DASHBOARD_PATH)

  // Reuse an already-open dashboard window instead of stacking duplicates.
  const existing = await chrome.windows.getAll({ populate: true })
  for (const win of existing) {
    const match = win.tabs?.find((t) => t.url?.startsWith(dashboardUrl))
    if (match && win.id !== undefined) {
      await chrome.windows.update(win.id, { focused: true })
      return
    }
  }

  const { width: screenWidth, height: screenHeight } = await getScreenSize()
  const width = Math.min(1360, Math.round(screenWidth * 0.85))
  const height = Math.min(900, Math.round(screenHeight * 0.85))

  chrome.windows.create({
    url: dashboardUrl,
    type: "popup",
    width,
    height,
    left: Math.round((screenWidth - width) / 2),
    top: Math.round((screenHeight - height) / 2)
  })
}

function getScreenSize(): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    chrome.system.display.getInfo((displays) => {
      const primary = displays.find((d) => d.isPrimary) ?? displays[0]
      if (primary) {
        resolve({ width: primary.workArea.width, height: primary.workArea.height })
      } else {
        resolve({ width: 1440, height: 900 })
      }
    })
  })
}

chrome.action.onClicked.addListener((tab) => {
  openOrFocusDashboard(tab)
})

// ---------------------------------------------------------------------------
// Network-request observation for sandboxed/cross-origin contexts.
//
// A content script can only read the DOM/JS state of frames the Same-Origin
// Policy allows it into — that's a real, non-negotiable browser boundary,
// and this extension does not attempt to cross it. But chrome.webRequest
// operates at the network layer, scoped to the whole TAB, not to a single
// document — so it can observe requests made by ANY frame in the tab,
// including a cross-origin or sandboxed iframe (e.g. Shopify's Web Pixels
// sandbox), without ever touching that frame's DOM. This is the same
// legitimate mechanism real Shopify pixel-debugging tools use: Shopify's
// own Web Pixels forward subscribed customer events to its internal
// "monorail" analytics collector as an ordinary network request — visible
// at the network layer even though the sandbox's JS state is not.
//
// Only requestBody is read here (what the page/frame SENT) — webRequest has
// never supported reading response bodies, so this can't and doesn't try to
// see what the server sent back.
// ---------------------------------------------------------------------------

const SHOPIFY_MONORAIL_PATTERN = /monorail-edge\.shopifysvc\.com|monorail\.shopifysvc\.com/i
const NETWORK_CAPTURE_MAX = 40

function decodeRequestBody(body: chrome.webRequest.WebRequestBody | undefined): string {
  if (!body) return ""
  try {
    if (body.raw?.[0]?.bytes) {
      return new TextDecoder("utf-8").decode(body.raw[0].bytes).slice(0, 1500)
    }
    if (body.formData) {
      return JSON.stringify(body.formData).slice(0, 1500)
    }
  } catch {
    // ignore decode failures — some bodies are binary/opaque, that's expected
  }
  return ""
}

async function appendCapture(storageKey: string, entry: Record<string, unknown>) {
  const result = await chrome.storage.local.get(storageKey)
  const existing = (result[storageKey] as Record<string, unknown>[]) ?? []
  const updated = [entry, ...existing].slice(0, NETWORK_CAPTURE_MAX)
  await chrome.storage.local.set({ [storageKey]: updated })
}

async function originForTab(tabId: number): Promise<string | null> {
  try {
    const tab = await chrome.tabs.get(tabId)
    if (!tab.url) return null
    return new URL(tab.url).origin
  } catch {
    return null
  }
}

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId < 0) return // tabId -1 means not associated with a tab (e.g. extension's own requests)

    const isShopifyMonorail = SHOPIFY_MONORAIL_PATTERN.test(details.url)
    const matchedProvider = EMBEDDED_FORM_PROVIDERS.find((p) => p.srcPattern.test(details.url))

    if (!isShopifyMonorail && !matchedProvider) return

    const payloadPreview = decodeRequestBody(details.requestBody ?? undefined)

    originForTab(details.tabId).then((origin) => {
      if (!origin) return

      if (isShopifyMonorail) {
        appendCapture(`trackos-shopify-network:${origin}`, {
          url: details.url,
          frameId: details.frameId,
          payloadPreview,
          timestamp: Date.now()
        })
      }

      if (matchedProvider) {
        // Merge into the SAME key the postMessage listener writes to, so the
        // dashboard shows one unified timeline regardless of which legitimate
        // channel actually surfaced the activity.
        appendCapture(`trackos-iframe-events:${origin}`, {
          origin: new URL(details.url).origin,
          provider: matchedProvider.name,
          providerId: matchedProvider.id,
          payloadPreview: payloadPreview || `(request observed, no readable body: ${details.method} ${details.url})`,
          timestamp: Date.now(),
          via: "network"
        })
      }
    })
  },
  { urls: ["<all_urls>"] },
  ["requestBody"]
)

// ---------------------------------------------------------------------------
// Shopify sandbox-frame status: resolves the real top-level tab origin
// (sender.tab always refers to the top tab regardless of which frame sent
// the message — the sandbox iframe's own URL is not something a user would
// recognize, so we key storage by the actual storefront origin instead).
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== "trackos:shopify-sandbox-report") return
  if (!sender.tab?.url) return
  let origin: string
  try {
    origin = new URL(sender.tab.url).origin
  } catch {
    return
  }
  chrome.storage.local.set({ [`trackos-shopify-sandbox:${origin}`]: { ...message.payload, updatedAt: Date.now() } })
})

// ---------------------------------------------------------------------------
// GTM Injector — persistent, origin-scoped auto-reinjection.
//
// A one-time chrome.scripting.executeScript() only lives in the single page
// load it ran on. Any real navigation — the user reloading, clicking a
// link, or critically, Google's own GTM Preview/Tag Assistant "Connect"
// flow performing its own navigation to establish its debug handshake —
// throws that injection away, because the browser loaded a genuinely fresh,
// un-injected page. That's why Tag Assistant reported the container "not
// found" even right after a successful injection: it had connected to a
// fresh load of the page in a different navigation than the one that was
// injected.
//
// The fix: keep a persistent origin -> GTM ID map in storage, and
// re-inject automatically on every single main-frame navigation to a
// matching origin, in any tab, until the user explicitly disconnects.
// This is what makes it behave like a real installation for as long as the
// session is active, rather than a single one-off injection.
// ---------------------------------------------------------------------------

const GTM_SESSIONS_KEY = "trackos-gtm-injection-sessions"

function injectGtmSnippetIntoPage(gtmId: string) {
  const w = window as any
  if (w.google_tag_manager && w.google_tag_manager[gtmId]) return
  ;(function (w2: any, d: Document, s: string, l: string, i: string) {
    w2[l] = w2[l] || []
    w2[l].push({ "gtm.start": new Date().getTime(), event: "gtm.js" })
    const f = d.getElementsByTagName(s)[0]
    const j = d.createElement(s) as HTMLScriptElement
    const dl = l !== "dataLayer" ? "&l=" + l : ""
    j.async = true
    j.src = "https://www.googletagmanager.com/gtm.js?id=" + i + dl
    f.parentNode?.insertBefore(j, f)
  })(w, document, "script", "dataLayer", gtmId)
}

if (chrome.webNavigation) {
  chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId !== 0) return // main frame only — no reason to inject into every iframe
    let origin: string
    try {
      origin = new URL(details.url).origin
    } catch {
      return
    }
    chrome.storage.local.get(GTM_SESSIONS_KEY, (res) => {
      const sessions: Record<string, string> = res[GTM_SESSIONS_KEY] ?? {}
      const gtmId = sessions[origin]
      if (!gtmId) return
      chrome.scripting
        .executeScript({
          target: { tabId: details.tabId },
          world: "MAIN",
          func: injectGtmSnippetIntoPage,
          args: [gtmId]
        })
        .catch(() => {
          // Tab may have closed or navigated again before this ran — fine,
          // the next onCommitted for that origin will just try again.
        })
    })
  })
}
