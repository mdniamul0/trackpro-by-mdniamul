import type { DataLayerEntry, NetworkHit, PageSnapshot } from "~lib/types"

// Automatic tracking health checks. Each finding is plain English so it can
// be read out to a client as-is.

export type Finding = { level: "error" | "warning" | "ok"; title: string; detail: string }

const PURCHASE_EVENTS = new Set(["purchase", "Purchase", "CompletePayment", "checkout_completed"])

function eventOf(data: any): string | undefined {
  if (data && typeof data === "object") {
    if (typeof data.event === "string") return data.event
    const args = data.__gtagArgs
    if (Array.isArray(args) && args[0] === "event" && typeof args[1] === "string") return args[1]
  }
  return undefined
}

export function runHealthChecks(snapshot: PageSnapshot | null, entries: DataLayerEntry[], hits: NetworkHit[]): Finding[] {
  const findings: Finding[] = []
  const pushes = entries.filter((e) => e.kind === "push")

  // --- GTM containers -----------------------------------------------------
  if (snapshot) {
    if (!snapshot.gtmContainers.length && !snapshot.googleTagIds.length) {
      findings.push({ level: "warning", title: "No Google tag found", detail: "No GTM container or gtag.js ID was detected on this page." })
    } else if (snapshot.gtmContainers.length > 1) {
      findings.push({
        level: "warning",
        title: "Multiple GTM containers",
        detail: `${snapshot.gtmContainers.join(", ")} are both loaded. Check that the same tags don't fire twice.`
      })
    } else if (snapshot.gtmContainers.length === 1) {
      findings.push({ level: "ok", title: "GTM container loaded", detail: snapshot.gtmContainers[0] })
    }
  }

  // --- Blocked requests (ad blockers, CSP, network) -----------------------
  const blocked = hits.filter((h) => h.error)
  if (blocked.length) {
    const platforms = [...new Set(blocked.map((h) => h.platformName))]
    findings.push({
      level: "error",
      title: `${blocked.length} tracking request(s) blocked`,
      detail: `${platforms.join(", ")} — ${blocked[0].error}. Browsers/ad blockers are dropping this data; server-side tracking recovers it.`
    })
  }
  const failed = hits.filter((h) => h.status && h.status >= 400)
  if (failed.length) {
    findings.push({
      level: "error",
      title: `${failed.length} tracking request(s) failed`,
      detail: `${[...new Set(failed.map((h) => `${h.platformName} (HTTP ${h.status})`))].join(", ")}`
    })
  }

  // --- Duplicate conversions ----------------------------------------------
  const conversionHits = hits.filter((h) => PURCHASE_EVENTS.has(h.eventName) || /^conversion/.test(h.eventName))
  const seen = new Map<string, number>()
  const dupes = new Set<string>()
  for (const h of conversionHits) {
    const key = `${h.platformId}|${h.accountId}|${h.eventName}`
    const last = seen.get(key)
    if (last !== undefined && h.ts - last < 5000) dupes.add(`${h.platformName} ${h.eventName}${h.accountId ? ` (${h.accountId})` : ""}`)
    seen.set(key, h.ts)
  }
  for (const d of dupes) {
    findings.push({ level: "error", title: "Duplicate conversion", detail: `${d} fired more than once within 5 seconds — this inflates reported revenue.` })
  }

  // --- GA4 ecommerce quality ----------------------------------------------
  let hadEcommerce = false
  let clearedSinceLast = false
  for (const entry of pushes) {
    const data: any = entry.data
    if (!data || typeof data !== "object" || !("ecommerce" in data)) continue
    if (data.ecommerce === null) {
      clearedSinceLast = true
      continue
    }
    const ev = eventOf(data) ?? "(no event)"
    if (hadEcommerce && !clearedSinceLast) {
      findings.push({
        level: "warning",
        title: `"${ev}" pushed without clearing ecommerce first`,
        detail: "Push { ecommerce: null } before each ecommerce event so values from the previous event don't leak into this one."
      })
    }
    hadEcommerce = true
    clearedSinceLast = false
    if (ev === "purchase" && data.ecommerce && typeof data.ecommerce === "object") {
      const missing = ["transaction_id", "value", "currency"].filter((k) => data.ecommerce[k] === undefined || data.ecommerce[k] === "")
      if (missing.length) {
        findings.push({ level: "error", title: "Purchase is missing required fields", detail: `ecommerce.${missing.join(", ecommerce.")} not set. Revenue and deduplication will be wrong.` })
      } else {
        findings.push({ level: "ok", title: "Purchase data layer complete", detail: `transaction_id ${data.ecommerce.transaction_id}, ${data.ecommerce.value} ${data.ecommerce.currency}` })
      }
      if (typeof data.ecommerce.value === "string") {
        findings.push({ level: "warning", title: "Purchase value is text, not a number", detail: `value is "${data.ecommerce.value}". Send a number (e.g. 49.99) so platforms don't drop it.` })
      }
    }
  }

  // --- Consent Mode v2 ----------------------------------------------------
  if (snapshot?.consent && Object.keys(snapshot.consent).length) {
    const missing = ["ad_storage", "analytics_storage", "ad_user_data", "ad_personalization"].filter((k) => !snapshot.consent![k])
    if (missing.length) {
      findings.push({
        level: "warning",
        title: "Consent Mode v2 incomplete",
        detail: `No state set for ${missing.join(", ")}. Google requires ad_user_data and ad_personalization for EEA/UK traffic.`
      })
    } else {
      findings.push({ level: "ok", title: "Consent Mode v2 signals present", detail: "All four consent types have a state." })
    }
  }

  // --- Click-ID persistence -----------------------------------------------
  if (snapshot?.clickIds.gclid && !snapshot.cookies._gcl_aw) {
    findings.push({ level: "warning", title: "gclid not stored", detail: "The URL has a gclid but no _gcl_aw cookie was set. Check the Conversion Linker tag and consent." })
  }
  if (snapshot?.clickIds.fbclid && !snapshot.cookies._fbc) {
    findings.push({ level: "warning", title: "fbclid not stored", detail: "The URL has an fbclid but no _fbc cookie was set. Meta match quality will be lower." })
  }

  // Same issue on several pages/events → show it once.
  const unique = new Map<string, Finding>()
  for (const f of findings) unique.set(`${f.level}|${f.title}|${f.detail}`, f)
  const order = { error: 0, warning: 1, ok: 2 }
  return [...unique.values()].sort((a, b) => order[a.level] - order[b.level])
}
