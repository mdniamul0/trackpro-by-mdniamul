// Variable Builder: turns captured data layer pushes into GTM variables and
// triggers, exported as a GTM container JSON the user imports in
// GTM → Admin → Import Container (choose "Merge").

export type PathInfo = { path: string; value: unknown; type: string }

/** Every leaf/branch path in a push, in GTM Data Layer Variable (v2) dot notation. */
export function listPaths(data: unknown, prefix = "", out: PathInfo[] = [], depth = 0): PathInfo[] {
  if (data === null || typeof data !== "object" || depth > 8) return out
  const entries = Array.isArray(data) ? data.map((v, i) => [String(i), v] as const) : Object.entries(data)
  for (const [key, value] of entries) {
    if (!prefix && (key === "gtm.uniqueEventId" || key === "__gtagArgs")) continue
    const path = prefix ? `${prefix}.${key}` : key
    const type = value === null ? "null" : Array.isArray(value) ? "array" : typeof value
    out.push({ path, value, type })
    listPaths(value, path, out, depth + 1)
  }
  return out
}

export type VariableSpec =
  | { kind: "dlv"; name: string; path: string; defaultValue?: string }
  | { kind: "cjs"; name: string; code: string }

export type TriggerSpec = { name: string; eventName: string }

// ---------------------------------------------------------------------------
// Custom JavaScript templates for common ad-platform mappings. {{DLV}} is
// replaced with the chosen data layer variable name.
// ---------------------------------------------------------------------------

export type CjsTemplate = {
  id: string
  label: string
  description: string
  /** Which kind of source path it expects. */
  source: "array" | "any"
  build: (dlvName: string) => string
}

export const CJS_TEMPLATES: CjsTemplate[] = [
  {
    id: "meta-content-ids",
    label: "Items → content_ids (Meta)",
    description: "Array of item IDs for Meta Pixel / CAPI content_ids.",
    source: "array",
    build: (v) => `function() {
  var items = {{${v}}} || [];
  return items.map(function(item) {
    return String(item.item_id || item.id || item.sku || "");
  }).filter(Boolean);
}`
  },
  {
    id: "meta-contents",
    label: "Items → contents (Meta)",
    description: "[{id, quantity, item_price}] for Meta Pixel / CAPI contents.",
    source: "array",
    build: (v) => `function() {
  var items = {{${v}}} || [];
  return items.map(function(item) {
    return {
      id: String(item.item_id || item.id || item.sku || ""),
      quantity: Number(item.quantity || 1),
      item_price: Number(item.price || 0)
    };
  });
}`
  },
  {
    id: "tiktok-contents",
    label: "Items → contents (TikTok)",
    description: "[{content_id, content_name, quantity, price}] for TikTok Pixel / Events API.",
    source: "array",
    build: (v) => `function() {
  var items = {{${v}}} || [];
  return items.map(function(item) {
    return {
      content_id: String(item.item_id || item.id || item.sku || ""),
      content_type: "product",
      content_name: item.item_name || item.name || "",
      quantity: Number(item.quantity || 1),
      price: Number(item.price || 0)
    };
  });
}`
  },
  {
    id: "google-ads-items",
    label: "Items → Google Ads cart data",
    description: "[{id, quantity, price}] for Google Ads conversions with cart data.",
    source: "array",
    build: (v) => `function() {
  var items = {{${v}}} || [];
  return items.map(function(item) {
    return {
      id: String(item.item_id || item.id || item.sku || ""),
      quantity: Number(item.quantity || 1),
      price: Number(item.price || 0)
    };
  });
}`
  },
  {
    id: "items-quantity",
    label: "Items → total quantity",
    description: "Sum of item quantities (num_items).",
    source: "array",
    build: (v) => `function() {
  var items = {{${v}}} || [];
  return items.reduce(function(sum, item) {
    return sum + Number(item.quantity || 1);
  }, 0);
}`
  },
  {
    id: "items-value",
    label: "Items → calculated value",
    description: "Sum of price × quantity — a fallback when value is missing.",
    source: "array",
    build: (v) => `function() {
  var items = {{${v}}} || [];
  var total = items.reduce(function(sum, item) {
    return sum + Number(item.price || 0) * Number(item.quantity || 1);
  }, 0);
  return Math.round(total * 100) / 100;
}`
  },
  {
    id: "to-number",
    label: "Clean number",
    description: "Turns \"$1,299.00\" or \"1299\" into 1299 for value fields.",
    source: "any",
    build: (v) => `function() {
  var raw = {{${v}}};
  if (typeof raw === "number") return raw;
  var num = parseFloat(String(raw || "").replace(/[^0-9.-]/g, ""));
  return isNaN(num) ? undefined : num;
}`
  },
  {
    id: "normalize-email",
    label: "Normalize email",
    description: "Lower-case, trimmed email — ready for Enhanced Conversions / CAPI hashing.",
    source: "any",
    build: (v) => `function() {
  var email = {{${v}}};
  return email ? String(email).trim().toLowerCase() : undefined;
}`
  },
  {
    id: "normalize-phone",
    label: "Normalize phone (E.164)",
    description: "Keeps digits and a leading + for Enhanced Conversions / CAPI.",
    source: "any",
    build: (v) => `function() {
  var phone = {{${v}}};
  if (!phone) return undefined;
  var cleaned = String(phone).replace(/[^0-9+]/g, "");
  return cleaned.charAt(0) === "+" ? cleaned : "+" + cleaned;
}`
  }
]

export function defaultDlvName(path: string) {
  return `DLV - ${path}`
}

// ---------------------------------------------------------------------------
// GTM container export
// ---------------------------------------------------------------------------

function pad(n: number) {
  return String(n).padStart(2, "0")
}

export function buildGtmImport(variables: VariableSpec[], triggers: TriggerSpec[]) {
  const now = new Date()
  const exportTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  const ids = { accountId: "0", containerId: "0" }

  const variable = variables.map((v, i) => {
    const base = { ...ids, variableId: String(i + 1), name: v.name, fingerprint: String(Date.now() + i) }
    if (v.kind === "dlv") {
      const parameter: { type: string; key: string; value: string }[] = [
        { type: "INTEGER", key: "dataLayerVersion", value: "2" },
        { type: "BOOLEAN", key: "setDefaultValue", value: v.defaultValue !== undefined && v.defaultValue !== "" ? "true" : "false" },
        { type: "TEMPLATE", key: "name", value: v.path }
      ]
      if (v.defaultValue) parameter.push({ type: "TEMPLATE", key: "defaultValue", value: v.defaultValue })
      return { ...base, type: "v", parameter }
    }
    return { ...base, type: "jsm", parameter: [{ type: "TEMPLATE", key: "javascript", value: v.code }] }
  })

  const trigger = triggers.map((t, i) => ({
    ...ids,
    triggerId: String(i + 1),
    name: t.name,
    type: "CUSTOM_EVENT",
    customEventFilter: [
      {
        type: "EQUALS",
        parameter: [
          { type: "TEMPLATE", key: "arg0", value: "{{_event}}" },
          { type: "TEMPLATE", key: "arg1", value: t.eventName }
        ]
      }
    ],
    fingerprint: String(Date.now() + 1000 + i)
  }))

  return {
    exportFormatVersion: 2,
    exportTime,
    containerVersion: {
      path: "accounts/0/containers/0/versions/0",
      ...ids,
      containerVersionId: "0",
      container: {
        path: "accounts/0/containers/0",
        ...ids,
        name: "TrackPro by MD Niamul export",
        publicId: "GTM-XXXXXXX",
        usageContext: ["WEB"],
        fingerprint: "0",
        tagManagerUrl: ""
      },
      ...(trigger.length ? { trigger } : {}),
      ...(variable.length ? { variable } : {}),
      fingerprint: "0",
      tagManagerUrl: ""
    }
  }
}

/** Reads a dotted path from a push, the way GTM's Data Layer Variable (v2) does. */
export function readPath(data: unknown, path: string): unknown {
  let current: any = data
  for (const key of path.split(".")) {
    if (current === null || current === undefined) return undefined
    current = current[key]
  }
  return current
}
