import type { PageSnapshot } from "~lib/types"

// IMPORTANT: inspectPage() runs inside the web page (MAIN world). It's also
// passed to chrome.scripting.executeScript, which serializes the function,
// so it must be fully self-contained — no imports or outer variables.

export type ProviderPattern = { id: string; name: string; source: string; flags: string }

export type InspectResult = {
  snapshot: PageSnapshot
  /** Current contents of each data layer array, when requested. */
  dataLayers?: { name: string; entries: unknown[] }[]
}

export function inspectPage(providers: ProviderPattern[], includeDataLayers: boolean): InspectResult {
  const w = window as any

  const clone = (value: unknown, depth = 0, seen = new WeakSet<object>()): unknown => {
    if (value === null || value === undefined) return value ?? null
    const t = typeof value
    if (t === "string" || t === "number" || t === "boolean") return value
    if (t === "bigint") return String(value)
    if (t === "function") return "[function]"
    if (t === "symbol") return String(value)
    if (depth > 12) return "[…]"
    const obj = value as any
    if (seen.has(obj)) return "[circular]"
    seen.add(obj)
    if (obj instanceof Date) return obj.toISOString()
    if (typeof Element !== "undefined" && obj instanceof Element) {
      const id = obj.id ? "#" + obj.id : ""
      const cls = typeof obj.className === "string" && obj.className.trim() ? "." + obj.className.trim().split(/\s+/).join(".") : ""
      return `<${obj.tagName.toLowerCase()}${id}${cls}>`
    }
    if (Object.prototype.toString.call(obj) === "[object Arguments]") {
      return { __gtagArgs: Array.from(obj as ArrayLike<unknown>).map((v) => clone(v, depth + 1, seen)) }
    }
    if (Array.isArray(obj)) return obj.map((v) => clone(v, depth + 1, seen))
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(obj)) {
      try {
        out[key] = clone(obj[key], depth + 1, seen)
      } catch {
        out[key] = "[unreadable]"
      }
    }
    return out
  }

  // --- Google tags --------------------------------------------------------
  const gtmObj = w.google_tag_manager && typeof w.google_tag_manager === "object" ? w.google_tag_manager : {}
  const tagKeys = Object.keys(gtmObj)
  const gtmContainers = tagKeys.filter((k) => /^GTM-[A-Z0-9]+$/.test(k))
  const googleTagIds = tagKeys.filter((k) => /^(G|AW|DC|GT|UA)-[A-Z0-9-]+$/.test(k))

  const dataLayerNames = new Set<string>(["dataLayer"])
  for (const id of gtmContainers) {
    const name = gtmObj[id]?.dataLayer?.name
    if (typeof name === "string" && name) dataLayerNames.add(name)
  }

  // --- Consent Mode (Google's internal consent state) ---------------------
  let consent: PageSnapshot["consent"] = null
  const ics = w.google_tag_data?.ics?.entries
  if (ics && typeof ics === "object") {
    consent = {}
    for (const [type, entry] of Object.entries<any>(ics)) {
      consent[type] = {
        default: typeof entry?.default === "boolean" ? entry.default : undefined,
        update: typeof entry?.update === "boolean" ? entry.update : undefined
      }
    }
  }

  // --- Tracking libraries present on the page -----------------------------
  const globals: Record<string, boolean> = {
    "Google Tag Manager": gtmContainers.length > 0,
    "gtag.js": typeof w.gtag === "function",
    "Meta Pixel (fbq)": typeof w.fbq === "function",
    "TikTok Pixel (ttq)": !!w.ttq,
    "Pinterest Tag (pintrk)": typeof w.pintrk === "function",
    "Snap Pixel (snaptr)": typeof w.snaptr === "function",
    "LinkedIn Insight (lintrk)": typeof w.lintrk === "function",
    "Microsoft UET (uetq)": !!w.uetq,
    "X Pixel (twq)": typeof w.twq === "function",
    "Reddit Pixel (rdt)": typeof w.rdt === "function",
    "Klaviyo": !!(w.klaviyo || w._learnq),
    "Microsoft Clarity": typeof w.clarity === "function",
    "Hotjar": typeof w.hj === "function"
  }

  // --- First-party marketing cookies --------------------------------------
  const cookieNames = /^(_ga(_.*)?|_gid|_gcl_(aw|au|dc|gb|gf|ha)|_fbp|_fbc|_ttp|ttclid|_pin_unauth|_epik|_scid|_sctr|_uetsid|_uetvid|_uetmsclkid|li_fat_id|_rdt_uuid|_rdt_cid|_twclid|_clck|_clsk|__kla_id|FPID|FPLC|_shopify_y|_shopify_s|cart)$/
  const cookies: Record<string, string> = {}
  for (const part of document.cookie ? document.cookie.split(";") : []) {
    const i = part.indexOf("=")
    const name = part.slice(0, i).trim()
    if (cookieNames.test(name)) {
      try {
        cookies[name] = decodeURIComponent(part.slice(i + 1).trim())
      } catch {
        cookies[name] = part.slice(i + 1).trim()
      }
    }
  }

  // --- Click IDs and UTMs in the current URL ------------------------------
  const params = new URLSearchParams(location.search)
  const clickIds: Record<string, string> = {}
  const utm: Record<string, string> = {}
  const clickIdNames = ["gclid", "gbraid", "wbraid", "dclid", "fbclid", "ttclid", "msclkid", "li_fat_id", "epik", "ScCid", "twclid", "rdt_cid", "irclickid", "_kx"]
  params.forEach((v, k) => {
    if (clickIdNames.includes(k)) clickIds[k] = v
    if (k.startsWith("utm_")) utm[k] = v
  })

  // --- Platform -----------------------------------------------------------
  let platform: PageSnapshot["platform"] = null
  let shopify: PageSnapshot["shopify"] = null
  const generator = document.querySelector('meta[name="generator"]')?.getAttribute("content") || ""
  if (w.Shopify) {
    platform = { name: "Shopify", detail: w.Shopify.shop }
    shopify = {
      shop: w.Shopify.shop,
      webPixelSandboxes: document.querySelectorAll('iframe[id^="web-pixel-sandbox"], iframe[name^="web-pixel-sandbox"]').length,
      hasCustomerEvents: !!(w.webPixelsManager || document.querySelector('script[id*="web-pixels-manager"]'))
    }
  } else if (document.body?.classList.contains("woocommerce") || document.querySelector('link[href*="woocommerce"]')) {
    platform = { name: "WooCommerce" }
  } else if (/wordpress/i.test(generator) || document.querySelector('link[href*="/wp-content/"]')) {
    platform = { name: "WordPress" }
  } else if (w.Webflow || document.documentElement.hasAttribute("data-wf-site")) {
    platform = { name: "Webflow" }
  } else if (w.wixBiSession || /wix\.com/i.test(generator)) {
    platform = { name: "Wix" }
  } else if (w.Squarespace || /squarespace/i.test(generator)) {
    platform = { name: "Squarespace" }
  } else if (w.BCData || document.querySelector('script[src*="bigcommerce"]')) {
    platform = { name: "BigCommerce" }
  } else if (w.Magento || document.querySelector('script[type="text/x-magento-init"]')) {
    platform = { name: "Magento / Adobe Commerce" }
  } else if (document.querySelector('meta[name="generator"][content*="HighLevel"], script[src*="leadconnectorhq"]')) {
    platform = { name: "GoHighLevel" }
  } else if (generator) {
    platform = { name: generator.split(/\s+/)[0] }
  }

  // --- Embedded forms / booking widgets -----------------------------------
  const embeddedForms: PageSnapshot["embeddedForms"] = []
  const patterns = providers.map((p) => ({ ...p, re: new RegExp(p.source, p.flags) }))
  document.querySelectorAll("iframe[src]").forEach((frame) => {
    const src = (frame as HTMLIFrameElement).src
    const p = patterns.find((x) => x.re.test(src))
    if (p) embeddedForms.push({ providerId: p.id, providerName: p.name, src })
  })

  const snapshot: PageSnapshot = {
    url: location.href,
    title: document.title,
    capturedAt: Date.now(),
    gtmContainers,
    googleTagIds,
    dataLayerNames: [...dataLayerNames],
    consent,
    globals,
    cookies,
    clickIds,
    utm,
    platform,
    shopify,
    embeddedForms
  }

  const result: InspectResult = { snapshot }
  if (includeDataLayers) {
    result.dataLayers = [...dataLayerNames]
      .filter((name) => Array.isArray(w[name]))
      .map((name) => ({ name, entries: (w[name] as unknown[]).map((e) => clone(e)) }))
  }
  return result
}
