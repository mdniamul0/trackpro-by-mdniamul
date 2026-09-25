// GTM Injector — Chrome Web Store compliant (Manifest V3).
//
// Why it works this way:
// The Web Store rejects extensions whose own code loads scripts from a remote
// server ("remotely hosted code", violation Blue Argon). A GTM container is
// always loaded from a server, so the extension itself can't ship a GTM
// loader. Instead, the USER pastes their own GTM install snippet (GTM →
// Admin → Install Google Tag Manager, the <head> part), and we register it
// with chrome.userScripts — the MV3 API built for running code the user
// supplies. This package contains no remote URL; the only code that runs on
// the page is the snippet the user gave us.
//
// Bonus of taking the real snippet: custom loaders (server-side GTM on a
// first-party domain, Stape custom loader, renamed dataLayer) work as-is.
//
// Scripts are registered at document_start, so the container loads as early
// as a real installation and survives reloads, navigations, and the Tag
// Assistant "Connect" flow until the user disconnects.

export const GTM_SESSIONS_KEY = "trackos-gtm-injection-sessions"
const SCRIPT_ID_PREFIX = "trackpro-gtm-"

export type GtmInjectionSession = {
  containerId: string
  /** The inline JS from the user's pasted snippet. */
  code: string
  createdAt: number
}

export type UserScriptsStatus =
  /** Ready to inject. */
  | "ready"
  /** Chrome supports it, but the user must switch on "Allow User Scripts" (Chrome 138+) or Developer mode (older). */
  | "needs-toggle"
  /** Chrome older than 120 — no userScripts API. */
  | "unsupported"

export type ParsedSnippet = { ok: true; containerId: string; code: string } | { ok: false; error: string }

const CONTAINER_ID_PATTERN = /\bGTM-[A-Z0-9]{4,}\b/i

// ---------------------------------------------------------------------------
// Snippet parsing
// ---------------------------------------------------------------------------

export function parseGtmSnippet(input: string): ParsedSnippet {
  const text = input.trim()
  if (!text) return { ok: false, error: "Paste your GTM install snippet first." }

  // Drop the <noscript> iframe part if the user pasted both halves.
  const withoutNoscript = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, "")

  let code: string
  const scriptTags = [...withoutNoscript.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  if (scriptTags.length) {
    const inline = scriptTags.find(([, attrs, body]) => !/\bsrc\s*=/i.test(attrs) && body.trim())
    if (!inline) {
      return {
        ok: false,
        error:
          "That snippet only has an external <script src=…>. Paste the GTM <head> snippet that starts with (function(w,d,s,l,i){…"
      }
    }
    code = inline[2].trim()
  } else {
    // User pasted just the JS without the <script> wrapper — fine.
    code = withoutNoscript
  }

  if (!/gtm\.start|gtm\.js/.test(code)) {
    return {
      ok: false,
      error: "This doesn't look like a Google Tag Manager snippet. Copy it from GTM → Admin → Install Google Tag Manager."
    }
  }

  const idMatch = code.match(CONTAINER_ID_PATTERN)
  if (!idMatch) return { ok: false, error: "No GTM container ID (GTM-XXXXXXX) found in the snippet." }

  return { ok: true, containerId: idMatch[0].toUpperCase(), code }
}

// ---------------------------------------------------------------------------
// userScripts availability
// ---------------------------------------------------------------------------

export function chromeMajorVersion(): number {
  const m = navigator.userAgent.match(/Chrom(?:e|ium)\/(\d+)/)
  return m ? Number(m[1]) : 0
}

export async function getUserScriptsStatus(): Promise<UserScriptsStatus> {
  const version = chromeMajorVersion()
  if (version && version < 120) return "unsupported"
  if (!chrome.userScripts) return "needs-toggle"
  try {
    // Throws when the API is present but the user hasn't allowed user scripts.
    await chrome.userScripts.getScripts()
    return "ready"
  } catch {
    return "needs-toggle"
  }
}

/** Plain-English instructions for the toggle, matched to the user's Chrome version. */
export function userScriptsToggleHelp(): string {
  return chromeMajorVersion() >= 138
    ? 'Open the extension details page and switch on "Allow User Scripts", then come back here.'
    : 'Open chrome://extensions and switch on "Developer mode" (top-right), then come back here.'
}

/** Opens this extension's details page, where the toggle lives. */
export function openUserScriptsToggle() {
  chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` })
}

// ---------------------------------------------------------------------------
// Sessions (origin -> injected container)
// ---------------------------------------------------------------------------

function scriptIdFor(origin: string) {
  return SCRIPT_ID_PREFIX + origin.replace(/[^a-z0-9]/gi, "_")
}

function buildUserScript(origin: string, session: GtmInjectionSession): chrome.userScripts.RegisteredUserScript {
  const url = new URL(origin)
  // Match patterns can't reliably carry a port, so match on host and re-check
  // the exact origin inside the script.
  const wrapped =
    `if (location.origin === ${JSON.stringify(origin)} && ` +
    `!(window.google_tag_manager && window.google_tag_manager[${JSON.stringify(session.containerId)}])) {\n` +
    `window.__trackproInjectedGtm = ${JSON.stringify(session.containerId)};\n` +
    // GTM's snippet inserts gtm.js before the page's first <script>. At
    // document_start there may be none yet, so give it an empty anchor.
    `if (!document.getElementsByTagName("script")[0]) (document.head || document.documentElement).appendChild(document.createElement("script"));\n` +
    `${session.code}\n}`
  return {
    id: scriptIdFor(origin),
    matches: [`${url.protocol}//${url.hostname}/*`],
    js: [{ code: wrapped }],
    runAt: "document_start",
    world: "MAIN",
    allFrames: false
  }
}

export async function getGtmSessions(): Promise<Record<string, GtmInjectionSession>> {
  const res = await chrome.storage.local.get(GTM_SESSIONS_KEY)
  const raw = (res[GTM_SESSIONS_KEY] ?? {}) as Record<string, unknown>
  const sessions: Record<string, GtmInjectionSession> = {}
  for (const [origin, value] of Object.entries(raw)) {
    // Older versions stored just the GTM ID string — those can't be replayed
    // without the user's snippet, so they're dropped.
    if (value && typeof value === "object" && "code" in value) sessions[origin] = value as GtmInjectionSession
  }
  return sessions
}

/**
 * Injects the user's GTM snippet on every page load of `origin` until
 * stopGtmInjection() is called. Reload the tab afterwards to see it load.
 */
export async function startGtmInjection(origin: string, snippet: string): Promise<ParsedSnippet> {
  const parsed = parseGtmSnippet(snippet)
  if (!parsed.ok) return parsed

  if ((await getUserScriptsStatus()) !== "ready") {
    return { ok: false, error: userScriptsToggleHelp() }
  }

  const session: GtmInjectionSession = { containerId: parsed.containerId, code: parsed.code, createdAt: Date.now() }
  const id = scriptIdFor(origin)
  await chrome.userScripts.unregister({ ids: [id] }).catch(() => {})
  await chrome.userScripts.register([buildUserScript(origin, session)])

  const sessions = await getGtmSessions()
  sessions[origin] = session
  await chrome.storage.local.set({ [GTM_SESSIONS_KEY]: sessions })
  return parsed
}

export async function stopGtmInjection(origin: string) {
  await chrome.userScripts?.unregister({ ids: [scriptIdFor(origin)] }).catch(() => {})
  const sessions = await getGtmSessions()
  delete sessions[origin]
  await chrome.storage.local.set({ [GTM_SESSIONS_KEY]: sessions })
}

/**
 * Makes the registered user scripts match storage. User scripts normally
 * persist on their own; this covers the user turning the toggle off and on
 * again, or an extension update.
 */
export async function syncGtmUserScripts() {
  if ((await getUserScriptsStatus()) !== "ready") return
  const sessions = await getGtmSessions()
  const registered = await chrome.userScripts.getScripts()
  const ours = registered.filter((s) => s.id.startsWith(SCRIPT_ID_PREFIX)).map((s) => s.id)
  if (ours.length) await chrome.userScripts.unregister({ ids: ours })
  const scripts = Object.entries(sessions).map(([origin, session]) => buildUserScript(origin, session))
  if (scripts.length) await chrome.userScripts.register(scripts)
}
