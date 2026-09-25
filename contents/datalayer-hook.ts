import type { PlasmoCSConfig } from "plasmo"

import { safeClone } from "~lib/clone"
import { EMBEDDED_FORM_PROVIDERS } from "~lib/embedded-forms"
import { inspectPage, type ProviderPattern } from "~lib/page-inspector"

// Runs in the page's own JS world at document_start so it sees every
// dataLayer.push / gtag() call from the very first one, the same way GTM
// Preview does. It only observes — nothing on the page is changed except
// that dataLayer.push is transparently wrapped.
//
// Captures go to the isolated relay script via DOM CustomEvents (strings
// only, since objects don't cross JS worlds).

export const config: PlasmoCSConfig = {
  matches: ["http://*/*", "https://*/*"],
  run_at: "document_start",
  world: "MAIN",
  all_frames: false
}

const TO_RELAY = "trackpro:main"
const FROM_RELAY = "trackpro:relay-ready"
const HELLO = "trackpro:main-hello"

type Outgoing = { type: "dl"; dlName: string; data: unknown; ts: number } | { type: "page"; ts: number } | { type: "snapshot"; payload: unknown }

;(() => {
  const w = window as any
  if (w.__trackproHooked) return
  Object.defineProperty(w, "__trackproHooked", { value: true })

  const queue: Outgoing[] = []
  let relayReady = false

  const send = (msg: Outgoing) => {
    if (!relayReady) {
      queue.push(msg)
      return
    }
    document.dispatchEvent(new CustomEvent(TO_RELAY, { detail: JSON.stringify(msg) }))
  }
  const flush = () => {
    relayReady = true
    while (queue.length) send(queue.shift()!)
  }
  document.addEventListener(FROM_RELAY, flush)
  document.dispatchEvent(new CustomEvent(HELLO))

  send({ type: "page", ts: Date.now() })

  const report = (dlName: string, value: unknown) => {
    let data: unknown
    try {
      data = safeClone(value)
    } catch {
      data = "[unreadable]"
    }
    send({ type: "dl", dlName, data, ts: Date.now() })
    // Consent updates, new containers etc. usually follow a push.
    clearTimeout(snapshotTimer)
    snapshotTimer = setTimeout(() => snapshot(), 600)
  }
  let snapshotTimer: ReturnType<typeof setTimeout> | undefined

  // Wraps arr.push with an accessor so that when GTM later replaces
  // dataLayer.push with its own function (it always does), we keep observing:
  // the replacement becomes the inner function we call through.
  const instrumentArray = (dlName: string, arr: any) => {
    if (!Array.isArray(arr) || (arr as any).__trackproWrapped) return
    Object.defineProperty(arr, "__trackproWrapped", { value: true })
    for (const existing of arr) report(dlName, existing)
    let inner: (...items: unknown[]) => unknown = arr.push
    const wrapper = function (this: unknown, ...items: unknown[]) {
      const result = inner.apply(this, items)
      for (const item of items) report(dlName, item)
      return result
    }
    Object.defineProperty(arr, "push", {
      configurable: true,
      enumerable: false,
      get: () => wrapper,
      set: (fn) => {
        if (typeof fn === "function" && fn !== wrapper) inner = fn
      }
    })
  }

  // Watches window[dlName] so arrays assigned later (window.dataLayer = [])
  // are instrumented too.
  const watchGlobal = (dlName: string) => {
    const existing = Object.getOwnPropertyDescriptor(w, dlName)
    if (existing && !existing.configurable) {
      instrumentArray(dlName, w[dlName])
      return
    }
    let current = w[dlName]
    instrumentArray(dlName, current)
    try {
      Object.defineProperty(w, dlName, {
        configurable: true,
        enumerable: true,
        get: () => current,
        set: (value) => {
          current = value
          instrumentArray(dlName, value)
        }
      })
    } catch {
      instrumentArray(dlName, w[dlName])
    }
  }

  const watched = new Set<string>()
  const watch = (name: string) => {
    if (watched.has(name)) return
    watched.add(name)
    watchGlobal(name)
  }
  watch("dataLayer")

  // Page snapshot (containers, consent, cookies, platform...) at a few points
  // during load, since tags arrive asynchronously. Also picks up renamed
  // data layers from GTM containers.
  const providers: ProviderPattern[] = EMBEDDED_FORM_PROVIDERS.map((p) => ({
    id: p.id,
    name: p.name,
    source: p.srcPattern.source,
    flags: p.srcPattern.flags
  }))
  function snapshot() {
    try {
      const { snapshot } = inspectPage(providers, false)
      snapshot.dataLayerNames.forEach(watch)
      send({ type: "snapshot", payload: snapshot })
    } catch {
      // page in an odd state (e.g. document replaced) — next tick will retry
    }
  }
  document.addEventListener("DOMContentLoaded", snapshot)
  window.addEventListener("load", () => {
    snapshot()
    setTimeout(snapshot, 2000)
    setTimeout(snapshot, 6000)
  })
  // Consent updates and SPA navigations change state after load.
  document.addEventListener("trackpro:request-snapshot", snapshot)
  let lastUrl = location.href
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href
      snapshot()
    }
  }, 1000)
})()
