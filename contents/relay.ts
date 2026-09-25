import type { PlasmoCSConfig } from "plasmo"

import { matchFormMessage, previewOf } from "~lib/embedded-forms"
import type { ContentMessage, DataLayerEntry } from "~lib/types"

// Isolated-world partner of datalayer-hook.ts: receives its captures and
// forwards them to the background worker (the MAIN world has no extension
// APIs). Also listens for postMessage events that embedded form/booking
// iframes send to the page.

export const config: PlasmoCSConfig = {
  matches: ["http://*/*", "https://*/*"],
  run_at: "document_start",
  all_frames: false
}

const FROM_MAIN = "trackpro:main"
const TO_MAIN = "trackpro:relay-ready"
const MAIN_HELLO = "trackpro:main-hello"

let alive = true
function post(message: ContentMessage) {
  if (!alive) return
  try {
    chrome.runtime.sendMessage(message).catch(() => {})
  } catch {
    // Extension was reloaded/updated — this page's script is orphaned.
    alive = false
  }
}

// Batch data layer entries so a burst of pushes is one message.
let pending: Omit<DataLayerEntry, "id">[] = []
let flushTimer: ReturnType<typeof setTimeout> | undefined
function queueEntry(entry: Omit<DataLayerEntry, "id">) {
  pending.push(entry)
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = undefined
      const entries = pending
      pending = []
      post({ type: "trackpro:dl", entries })
    }, 100)
  }
}

document.addEventListener(FROM_MAIN, (event) => {
  const detail = (event as CustomEvent).detail
  if (typeof detail !== "string") return
  let msg: any
  try {
    msg = JSON.parse(detail)
  } catch {
    return
  }
  if (msg.type === "page") {
    queueEntry({ kind: "page", ts: msg.ts, pageUrl: location.href, dlName: "" })
  } else if (msg.type === "dl") {
    queueEntry({ kind: "push", ts: msg.ts, pageUrl: location.href, dlName: msg.dlName, data: msg.data })
  } else if (msg.type === "snapshot") {
    post({ type: "trackpro:snapshot", snapshot: msg.payload })
  }
})

// Handshake: whichever script loads second completes it.
const announce = () => document.dispatchEvent(new CustomEvent(TO_MAIN))
document.addEventListener(MAIN_HELLO, announce)
announce()

window.addEventListener("message", (event) => {
  if (event.source === window && event.origin === location.origin && typeof event.data === "object" && event.data?.type !== "hsFormCallback") return
  const match = matchFormMessage(event.origin, event.data)
  if (!match) return
  post({
    type: "trackpro:form",
    event: {
      ts: Date.now(),
      providerId: match.provider.id,
      providerName: match.provider.name,
      via: "postMessage",
      eventName: match.eventName,
      preview: previewOf(event.data),
      pageUrl: location.href
    }
  })
})
