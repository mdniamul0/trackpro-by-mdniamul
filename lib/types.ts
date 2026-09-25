// Shared data shapes and storage keys used by the background worker, the
// content scripts and the dashboard.

/** Tab the dashboard is inspecting (set when the toolbar icon is clicked). */
export const TARGET_TAB_KEY = "trackos:target-tab"

export type TargetTab = { tabId: number; origin: string; url: string; title?: string }

// Per-tab captures live in chrome.storage.session: they're cleared when the
// browser closes and removed when the tab closes.
export const dataLayerKey = (tabId: number) => `trackpro-dl:${tabId}`
export const networkKey = (tabId: number) => `trackpro-net:${tabId}`
export const snapshotKey = (tabId: number) => `trackpro-snapshot:${tabId}`
export const formsKey = (tabId: number) => `trackpro-forms:${tabId}`

export const MAX_DATALAYER_ENTRIES = 1000
export const MAX_NETWORK_HITS = 1000
export const MAX_FORM_EVENTS = 200

export type DataLayerEntry = {
  id: string
  ts: number
  /** "page" marks a new page load; "push" is a dataLayer.push / gtag() call. */
  kind: "page" | "push"
  pageUrl: string
  dlName: string
  /** JSON-safe copy of what was pushed. gtag() calls arrive as { __gtagArgs: [...] }. */
  data?: unknown
}

export type NetworkHit = {
  id: string
  requestId: string
  ts: number
  platformId: string
  platformName: string
  eventName: string
  accountId: string
  url: string
  method: string
  params: Record<string, string>
  body?: string
  /** First-party / server-side endpoint (e.g. sGTM on a custom domain). */
  serverSide?: boolean
  pageUrl?: string
  status?: number
  error?: string
}

export type FormEvent = {
  id: string
  ts: number
  providerId: string
  providerName: string
  via: "postMessage" | "network"
  eventName: string
  preview: string
  pageUrl?: string
}

export type ConsentState = Record<string, { default?: boolean; update?: boolean }>

export type PageSnapshot = {
  url: string
  title: string
  capturedAt: number
  gtmContainers: string[]
  googleTagIds: string[]
  dataLayerNames: string[]
  consent: ConsentState | null
  globals: Record<string, boolean>
  cookies: Record<string, string>
  clickIds: Record<string, string>
  utm: Record<string, string>
  platform: { name: string; detail?: string } | null
  shopify: { shop?: string; webPixelSandboxes: number; hasCustomerEvents: boolean } | null
  embeddedForms: { providerId: string; providerName: string; src: string }[]
}

// Messages from content scripts to the background worker.
export type ContentMessage =
  | { type: "trackpro:dl"; entries: Omit<DataLayerEntry, "id">[] }
  | { type: "trackpro:snapshot"; snapshot: PageSnapshot }
  | { type: "trackpro:form"; event: Omit<FormEvent, "id"> }

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
