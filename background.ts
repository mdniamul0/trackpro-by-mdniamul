export {}

import { matchFormUrl } from "~lib/embedded-forms"
import { syncGtmUserScripts } from "~lib/gtm-injector"
import { parsePixelRequest } from "~lib/pixels"
import {
  dataLayerKey,
  formsKey,
  MAX_DATALAYER_ENTRIES,
  MAX_FORM_EVENTS,
  MAX_NETWORK_HITS,
  networkKey,
  snapshotKey,
  TARGET_TAB_KEY,
  uid,
  type ContentMessage,
  type NetworkHit
} from "~lib/types"

// ---------------------------------------------------------------------------
// Dashboard window
//
// Clicking the toolbar icon opens the dashboard as its own app-style window
// (type "popup": no tab strip / address bar) instead of the small browser
// action popup. Because the dashboard lives in its own window, it can't ask
// for "the current tab" — so we remember the tab the icon was clicked on.
// ---------------------------------------------------------------------------

const DASHBOARD_PATH = "tabs/dashboard.html"

async function rememberTargetTab(tab: chrome.tabs.Tab) {
  if (!tab.id || !tab.url) return
  let origin: string
  try {
    origin = new URL(tab.url).origin
  } catch {
    return
  }
  await chrome.storage.local.set({ [TARGET_TAB_KEY]: { tabId: tab.id, origin, url: tab.url, title: tab.title } })
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
// Capture storage
//
// Per-tab captures go to chrome.storage.session. Writes to the same key are
// chained so two events arriving together can't overwrite each other.
// ---------------------------------------------------------------------------

const writeChains = new Map<string, Promise<void>>()

function updateList<T>(key: string, max: number, update: (list: T[]) => T[]) {
  const previous = writeChains.get(key) ?? Promise.resolve()
  const next = previous
    .then(async () => {
      const res = await chrome.storage.session.get(key)
      const list = (res[key] as T[] | undefined) ?? []
      const updated = update(list)
      await chrome.storage.session.set({ [key]: updated.length > max ? updated.slice(updated.length - max) : updated })
    })
    .catch(() => {})
  writeChains.set(key, next)
  next.then(() => {
    if (writeChains.get(key) === next) writeChains.delete(key)
  })
  return next
}

const appendToList = <T>(key: string, max: number, items: T[]) => updateList<T>(key, max, (list) => list.concat(items))

chrome.runtime.onMessage.addListener((message: ContentMessage, sender) => {
  const tabId = sender.tab?.id
  if (tabId === undefined || sender.frameId !== 0) return
  if (message?.type === "trackpro:dl") {
    appendToList(
      dataLayerKey(tabId),
      MAX_DATALAYER_ENTRIES,
      message.entries.map((e) => ({ ...e, id: uid() }))
    )
  } else if (message?.type === "trackpro:snapshot") {
    chrome.storage.session.set({ [snapshotKey(tabId)]: message.snapshot })
  } else if (message?.type === "trackpro:form") {
    appendToList(formsKey(tabId), MAX_FORM_EVENTS, [{ ...message.event, id: uid() }])
  }
})

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove([dataLayerKey(tabId), networkKey(tabId), snapshotKey(tabId), formsKey(tabId)])
})

// ---------------------------------------------------------------------------
// Network observation (read-only)
//
// chrome.webRequest sees requests from every frame in a tab — including
// cross-origin or sandboxed iframes (Shopify Web Pixels, embedded forms) and
// requests that happen after an ad blocker would hide them from the page.
// We only read what the page SENT (URL + request body); requests are never
// blocked or modified, and response bodies are never read.
// ---------------------------------------------------------------------------

function decodeRequestBody(body: chrome.webRequest.WebRequestBody | null | undefined): {
  text: string
  formData?: Record<string, string>
} {
  if (!body) return { text: "" }
  try {
    if (body.raw?.length) {
      const decoder = new TextDecoder("utf-8")
      const text = body.raw.map((part) => (part.bytes ? decoder.decode(part.bytes) : "")).join("")
      return { text: text.slice(0, 20000) }
    }
    if (body.formData) {
      const formData: Record<string, string> = {}
      for (const [k, v] of Object.entries(body.formData)) formData[k] = String(v?.[0] ?? "")
      return { text: "", formData }
    }
  } catch {
    // binary / opaque body — expected for some requests
  }
  return { text: "" }
}

// Page URL per tab, kept in memory so captures can be stored synchronously
// (in request order) without an async tab lookup.
const tabUrls = new Map<number, string>()
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo.url ?? tab.url
  if (url) tabUrls.set(tabId, url)
})
chrome.tabs.onRemoved.addListener((tabId) => tabUrls.delete(tabId))

/** requestId → tab, so the final status can be attached to the stored hits. */
const pendingRequests = new Map<string, number>()

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId < 0) return // not from a tab (e.g. the extension itself)

    const body = decodeRequestBody(details.requestBody)
    const hits = parsePixelRequest(details.url, body.text, body.formData)
    const formProvider = hits.length ? undefined : matchFormUrl(details.url)
    if (!hits.length && !formProvider) return

    const tabId = details.tabId
    const pageUrl = tabUrls.get(tabId)
    if (!pageUrl) chrome.tabs.get(tabId).then((t) => t.url && tabUrls.set(tabId, t.url)).catch(() => {})

    if (hits.length) {
      pendingRequests.set(details.requestId, tabId)
      const bodyPreview = body.text || (body.formData ? JSON.stringify(body.formData) : "")
      appendToList<NetworkHit>(
        networkKey(tabId),
        MAX_NETWORK_HITS,
        hits.map((h) => ({
          ...h,
          id: uid(),
          requestId: details.requestId,
          ts: Date.now(),
          url: details.url,
          method: details.method,
          body: bodyPreview ? bodyPreview.slice(0, 5000) : undefined,
          pageUrl
        }))
      )
    }

    // Form/booking providers: only requests that SEND something (a
    // submission or tracking beacon), not every asset the iframe loads.
    if (formProvider && details.method !== "GET" && details.type !== "main_frame" && details.type !== "sub_frame") {
      appendToList(formsKey(tabId), MAX_FORM_EVENTS, [
        {
          id: uid(),
          ts: Date.now(),
          providerId: formProvider.id,
          providerName: formProvider.name,
          via: "network" as const,
          eventName: `${details.method} ${new URL(details.url).pathname}`,
          preview: (body.text || JSON.stringify(body.formData ?? {})).slice(0, 1500) || details.url,
          pageUrl
        }
      ])
    }
  },
  { urls: ["<all_urls>"] },
  ["requestBody"]
)

function recordOutcome(requestId: string, outcome: { status?: number; error?: string }) {
  const tabId = pendingRequests.get(requestId)
  if (tabId === undefined) return
  pendingRequests.delete(requestId)
  updateList<NetworkHit>(networkKey(tabId), MAX_NETWORK_HITS, (list) =>
    list.map((h) => (h.requestId === requestId ? { ...h, ...outcome } : h))
  )
}

chrome.webRequest.onCompleted.addListener((d) => recordOutcome(d.requestId, { status: d.statusCode }), {
  urls: ["<all_urls>"]
})
chrome.webRequest.onErrorOccurred.addListener((d) => recordOutcome(d.requestId, { error: d.error }), {
  urls: ["<all_urls>"]
})

// ---------------------------------------------------------------------------
// GTM Injector — runs the user's own GTM snippet via chrome.userScripts.
// See lib/gtm-injector.ts for why (Chrome Web Store remote-code policy).
// Registered user scripts persist on their own; this re-syncs them with
// storage after a browser restart or extension update.
// ---------------------------------------------------------------------------

chrome.runtime.onStartup.addListener(() => {
  syncGtmUserScripts().catch(() => {})
})
chrome.runtime.onInstalled.addListener(() => {
  syncGtmUserScripts().catch(() => {})
})
