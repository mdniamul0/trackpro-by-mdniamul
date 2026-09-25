// Ad-pixel / analytics request recognition.
//
// Each platform definition recognizes its collection endpoint and pulls the
// event name, account/pixel ID and parameters out of the request. Only what
// the page SENT is read (URL + request body) — responses are never read.

export type ParsedHit = {
  platformId: string
  platformName: string
  eventName: string
  accountId: string
  params: Record<string, string>
  serverSide?: boolean
}

type RequestInfo = { url: URL; body: string; formData?: Record<string, string> }

type PixelDef = {
  id: string
  name: string
  color: string
  match: (u: URL) => boolean
  parse: (req: RequestInfo) => Omit<ParsedHit, "platformId" | "platformName">[]
}

const host = (u: URL, ...suffixes: string[]) =>
  suffixes.some((s) => u.hostname === s || u.hostname.endsWith("." + s))

function queryParams(u: URL): Record<string, string> {
  const out: Record<string, string> = {}
  u.searchParams.forEach((v, k) => (out[k] = v))
  return out
}

function urlEncodedParams(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (!text || /^\s*[[{]/.test(text)) return out
  try {
    new URLSearchParams(text).forEach((v, k) => (out[k] = v))
  } catch {
    // not url-encoded
  }
  return out
}

function tryJson(text: string): any {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** Flattens nested JSON into dotted keys so it fits the params table. */
export function flattenForTable(value: unknown, prefix = "", out: Record<string, string> = {}, depth = 0) {
  if (value === null || typeof value !== "object" || depth > 6) {
    if (prefix) out[prefix] = typeof value === "string" ? value : JSON.stringify(value)
    return out
  }
  const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v] as const) : Object.entries(value)
  if (!entries.length && prefix) out[prefix] = Array.isArray(value) ? "[]" : "{}"
  for (const [k, v] of entries) flattenForTable(v, prefix ? `${prefix}.${k}` : k, out, depth + 1)
  return out
}

const allParams = (req: RequestInfo) => ({ ...queryParams(req.url), ...urlEncodedParams(req.body), ...req.formData })

export const PIXELS: PixelDef[] = [
  {
    id: "ga4",
    name: "Google Analytics 4",
    color: "#f59e0b",
    // /g/collect on any host: Google's own, or a server-side GTM endpoint.
    match: (u) => /\/g\/collect$/.test(u.pathname) && (u.searchParams.has("tid") || u.searchParams.has("v")),
    parse: (req) => {
      const base = queryParams(req.url)
      const serverSide = !host(req.url, "google-analytics.com", "analytics.google.com")
      // GA4 batches several events in the body, one url-encoded line each.
      const lines = req.body.split(/\r?\n/).filter((l) => l.trim() && !/^\s*[[{]/.test(l))
      const events = lines.length ? lines.map((l) => ({ ...base, ...urlEncodedParams(l) })) : [base]
      return events.map((p) => ({ eventName: p.en || "(no event name)", accountId: p.tid || "", params: p, serverSide }))
    }
  },
  {
    id: "google-ads",
    name: "Google Ads",
    color: "#22c55e",
    match: (u) =>
      (host(u, "googleadservices.com") && u.pathname.startsWith("/pagead/conversion")) ||
      (host(u, "google.com") && /^\/pagead\/(1p-conversion|1p-user-list)\//.test(u.pathname)) ||
      (host(u, "googleads.g.doubleclick.net") && u.pathname.startsWith("/pagead/viewthroughconversion")),
    parse: (req) => {
      const p = allParams(req)
      const id = req.url.pathname.match(/\/(\d{6,})\/?/)?.[1]
      const dataEvent = (p.data || "").match(/(?:^|;)event=([^;]+)/)?.[1]
      const kind = req.url.pathname.includes("user-list") ? "remarketing" : "conversion"
      const eventName = dataEvent || (p.label ? `${kind} (${p.label})` : kind)
      return [{ eventName, accountId: id ? `AW-${id}` : "", params: p }]
    }
  },
  {
    id: "floodlight",
    name: "Floodlight (CM360)",
    color: "#10b981",
    match: (u) => host(u, "fls.doubleclick.net", "ad.doubleclick.net") && u.pathname.includes("/activity"),
    parse: (req) => {
      const p: Record<string, string> = { ...allParams(req) }
      for (const pair of req.url.pathname.split(";").slice(1)) {
        const [k, ...v] = pair.split("=")
        if (k) p[k] = decodeURIComponent(v.join("="))
      }
      return [{ eventName: [p.type, p.cat].filter(Boolean).join(" / ") || "activity", accountId: p.src ? `DC-${p.src}` : "", params: p }]
    }
  },
  {
    id: "meta",
    name: "Meta Pixel",
    color: "#3b82f6",
    match: (u) => host(u, "facebook.com") && /^\/tr\/?$/.test(u.pathname),
    parse: (req) => {
      const p = allParams(req)
      return [{ eventName: p.ev || "(no event)", accountId: p.id || "", params: p }]
    }
  },
  {
    id: "tiktok",
    name: "TikTok Pixel",
    color: "#111827",
    match: (u) => host(u, "analytics.tiktok.com") && u.pathname.startsWith("/api/v2/pixel"),
    parse: (req) => {
      const json = tryJson(req.body)
      const batch: any[] = Array.isArray(json?.batch) ? json.batch : json ? [json] : [{}]
      return batch.map((e) => ({
        eventName: e.event || (req.url.pathname.endsWith("/act") ? "(interaction)" : "(no event)"),
        accountId: e.context?.pixel?.code || queryParams(req.url).sdkid || "",
        params: { ...queryParams(req.url), ...flattenForTable(e) }
      }))
    }
  },
  {
    id: "pinterest",
    name: "Pinterest Tag",
    color: "#e11d48",
    match: (u) => host(u, "ct.pinterest.com") && /^\/(v3|user)\/?/.test(u.pathname),
    parse: (req) => {
      const p = allParams(req)
      return [{ eventName: p.event || "(no event)", accountId: p.tid || "", params: p }]
    }
  },
  {
    id: "snapchat",
    name: "Snap Pixel",
    color: "#eab308",
    match: (u) => host(u, "tr.snapchat.com", "tr-shadow.snapchat.com") && /^\/(p|cm\/i|gateway\/p)/.test(u.pathname),
    parse: (req) => {
      const p = allParams(req)
      return [{ eventName: p.ev || p.e || "(no event)", accountId: p.pid || "", params: p }]
    }
  },
  {
    id: "linkedin",
    name: "LinkedIn Insight",
    color: "#0a66c2",
    match: (u) => host(u, "px.ads.linkedin.com") && /^\/(collect|wa|attribution_trigger)/.test(u.pathname),
    parse: (req) => {
      const p = allParams(req)
      const eventName = p.conversionId ? `conversion ${p.conversionId}` : "page view"
      return [{ eventName, accountId: p.pid || "", params: p }]
    }
  },
  {
    id: "microsoft",
    name: "Microsoft Ads (UET)",
    color: "#06b6d4",
    match: (u) => host(u, "bat.bing.com") && u.pathname.startsWith("/action"),
    parse: (req) => {
      const p = allParams(req)
      return [{ eventName: p.ea || (p.evt === "pageLoad" ? "page_view" : p.evt) || "(no event)", accountId: p.ti || "", params: p }]
    }
  },
  {
    id: "x",
    name: "X (Twitter) Pixel",
    color: "#374151",
    match: (u) => host(u, "analytics.twitter.com", "t.co", "ads-twitter.com") && u.pathname.includes("/adsct"),
    parse: (req) => {
      const p = allParams(req)
      const events = tryJson(p.events || "")
      const eventName = Array.isArray(events) && Array.isArray(events[0]) ? String(events[0][0]) : p.event_id || "(no event)"
      return [{ eventName, accountId: p.txn_id || p.bci || "", params: p }]
    }
  },
  {
    id: "reddit",
    name: "Reddit Pixel",
    color: "#f97316",
    match: (u) => host(u, "alb.reddit.com") && u.pathname.startsWith("/rp.gif"),
    parse: (req) => {
      const p = allParams(req)
      return [{ eventName: p.event || "(no event)", accountId: p.id || "", params: p }]
    }
  },
  {
    id: "klaviyo",
    name: "Klaviyo",
    color: "#16a34a",
    match: (u) => host(u, "a.klaviyo.com") && /^\/(client\/events|api\/track|client\/profiles)/.test(u.pathname),
    parse: (req) => {
      const json = tryJson(req.body)
      const attrs = json?.data?.attributes
      const eventName = attrs?.metric?.data?.attributes?.name || (req.url.pathname.includes("profiles") ? "identify" : "(event)")
      return [{ eventName, accountId: queryParams(req.url).company_id || "", params: { ...queryParams(req.url), ...flattenForTable(attrs ?? json ?? {}) } }]
    }
  },
  {
    id: "shopify",
    name: "Shopify Customer Events",
    color: "#65a30d",
    match: (u) => host(u, "monorail-edge.shopifysvc.com", "monorail.shopifysvc.com"),
    parse: (req) => {
      const json = tryJson(req.body)
      const events: any[] = Array.isArray(json?.events) ? json.events : json ? [json] : [{}]
      return events.map((e) => ({
        eventName: e.payload?.event_name || e.payload?.eventName || e.schema_id || "(event)",
        accountId: String(e.payload?.shop_id ?? e.payload?.shopId ?? ""),
        params: flattenForTable(e)
      }))
    }
  }
]

export const PIXEL_BY_ID = Object.fromEntries(PIXELS.map((p) => [p.id, p]))

export function parsePixelRequest(url: string, body: string, formData?: Record<string, string>): ParsedHit[] {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return []
  }
  const def = PIXELS.find((p) => p.match(u))
  if (!def) return []
  try {
    return def.parse({ url: u, body, formData }).map((h) => ({ ...h, platformId: def.id, platformName: def.name }))
  } catch {
    return [{ platformId: def.id, platformName: def.name, eventName: "(unparsed)", accountId: "", params: queryParams(u) }]
  }
}
