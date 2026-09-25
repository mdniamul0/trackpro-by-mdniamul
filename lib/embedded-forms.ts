// Embedded form / booking providers that usually live in a cross-origin
// iframe, where GTM on the parent page can't see submissions.
//
// Two legitimate channels surface their activity without touching the
// iframe's DOM:
//  - postMessage events the provider itself sends to the parent page
//  - network requests the iframe makes (observed via chrome.webRequest)

export type EmbeddedFormProvider = {
  id: string
  name: string
  /** Matches the iframe src and the provider's network requests. */
  srcPattern: RegExp
  /** Matches the origin of postMessage events from the provider's iframe. */
  originPattern?: RegExp
  /** Turns a postMessage payload into an event name, or null to ignore it. */
  eventFromMessage?: (data: any) => string | null
}

const parseMaybeJson = (data: unknown): any => {
  if (typeof data !== "string") return data
  try {
    return JSON.parse(data)
  } catch {
    return data
  }
}

export const EMBEDDED_FORM_PROVIDERS: EmbeddedFormProvider[] = [
  {
    id: "calendly",
    name: "Calendly",
    srcPattern: /calendly\.com/i,
    originPattern: /^https:\/\/([a-z0-9-]+\.)?calendly\.com$/i,
    eventFromMessage: (d) => (typeof d?.event === "string" && d.event.startsWith("calendly.") ? d.event : null)
  },
  {
    id: "typeform",
    name: "Typeform",
    srcPattern: /typeform\.com/i,
    originPattern: /^https:\/\/([a-z0-9-]+\.)?typeform\.com$/i,
    eventFromMessage: (d) => (typeof d?.type === "string" ? d.type : null)
  },
  {
    id: "hubspot",
    name: "HubSpot Forms",
    srcPattern: /(forms\.hsforms\.com|forms\.hubspot\.com|share\.hsforms\.com|hsforms\.net\/submissions|meetings\.hubspot\.com)/i,
    originPattern: /^https:\/\/([a-z0-9-]+\.)?(hsforms\.com|hubspot\.com|hsforms\.net)$/i,
    eventFromMessage: (d) =>
      d?.type === "hsFormCallback" ? `hsForm:${d.eventName}` : d?.meetingBookSucceeded ? "meetingBookSucceeded" : null
  },
  {
    id: "leadconnector",
    name: "GoHighLevel / LeadConnector",
    srcPattern: /(leadconnectorhq\.com|msgsndr\.com|link\.msgsndr\.com|api\.leadconnectorhq\.com)/i,
    originPattern: /^https:\/\/([a-z0-9-]+\.)?(leadconnectorhq\.com|msgsndr\.com)$/i,
    eventFromMessage: (d) => {
      if (Array.isArray(d)) return typeof d[0] === "string" ? d[0] : null
      return typeof d?.type === "string" ? d.type : typeof d?.event === "string" ? d.event : null
    }
  },
  {
    id: "jotform",
    name: "Jotform",
    srcPattern: /(jotform\.com|jotform\.eu|jotform\.us)/i,
    originPattern: /^https:\/\/([a-z0-9-]+\.)?jotform\.(com|eu|us)$/i,
    eventFromMessage: (d) => (typeof d === "string" ? d.split(":")[0] : typeof d?.action === "string" ? d.action : null)
  },
  {
    id: "tally",
    name: "Tally",
    srcPattern: /tally\.so/i,
    originPattern: /^https:\/\/([a-z0-9-]+\.)?tally\.so$/i,
    eventFromMessage: (d) => (typeof d?.event === "string" && d.event.startsWith("Tally.") ? d.event : null)
  },
  {
    id: "google-forms",
    name: "Google Forms",
    srcPattern: /docs\.google\.com\/forms/i
  },
  {
    id: "acuity",
    name: "Acuity Scheduling",
    srcPattern: /(acuityscheduling\.com|as\.me)/i,
    originPattern: /^https:\/\/([a-z0-9-]+\.)?acuityscheduling\.com$/i,
    eventFromMessage: (d) => (typeof d === "string" && d.includes("acuity") ? d.split(":")[0] : null)
  },
  {
    id: "cognito",
    name: "Cognito Forms",
    srcPattern: /cognitoforms\.com/i,
    originPattern: /^https:\/\/([a-z0-9-]+\.)?cognitoforms\.com$/i,
    eventFromMessage: (d) => (typeof d?.event === "string" ? d.event : null)
  },
  {
    id: "paperform",
    name: "Paperform",
    srcPattern: /paperform\.co/i,
    originPattern: /^https:\/\/([a-z0-9-]+\.)?paperform\.co$/i,
    eventFromMessage: (d) => (typeof d?.type === "string" ? d.type : null)
  },
  {
    id: "zoho-forms",
    name: "Zoho Forms",
    srcPattern: /forms\.zoho(public)?\.(com|eu|in)/i
  },
  {
    id: "microsoft-forms",
    name: "Microsoft Forms",
    srcPattern: /forms\.(office|microsoft)\.com/i
  },
  {
    id: "wufoo",
    name: "Wufoo",
    srcPattern: /wufoo\.com/i
  },
  {
    id: "formstack",
    name: "Formstack",
    srcPattern: /formstack\.com/i
  }
]

/** Finds the provider for a postMessage event and the event name it represents. */
export function matchFormMessage(origin: string, rawData: unknown): { provider: EmbeddedFormProvider; eventName: string } | null {
  const data = parseMaybeJson(rawData)
  for (const provider of EMBEDDED_FORM_PROVIDERS) {
    if (!provider.originPattern?.test(origin) || !provider.eventFromMessage) continue
    const eventName = provider.eventFromMessage(data)
    if (eventName) return { provider, eventName }
  }
  // HubSpot forms rendered on the page itself post from the page's own origin.
  if (data?.type === "hsFormCallback") {
    const hubspot = EMBEDDED_FORM_PROVIDERS.find((p) => p.id === "hubspot")!
    return { provider: hubspot, eventName: `hsForm:${data.eventName}` }
  }
  return null
}

export function matchFormUrl(url: string): EmbeddedFormProvider | undefined {
  return EMBEDDED_FORM_PROVIDERS.find((p) => p.srcPattern.test(url))
}

export function previewOf(data: unknown): string {
  const parsed = parseMaybeJson(data)
  try {
    return (typeof parsed === "string" ? parsed : JSON.stringify(parsed)).slice(0, 1500)
  } catch {
    return String(parsed).slice(0, 1500)
  }
}
