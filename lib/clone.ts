/**
 * Makes a JSON-safe copy of anything pushed to the data layer: functions,
 * DOM elements (gtm.element), circular references and gtag() `arguments`
 * objects all become readable values instead of breaking serialization.
 */
export function safeClone(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
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
    const cls =
      typeof obj.className === "string" && obj.className.trim() ? "." + obj.className.trim().split(/\s+/).join(".") : ""
    return `<${obj.tagName.toLowerCase()}${id}${cls}>`
  }
  if (Object.prototype.toString.call(obj) === "[object Arguments]") {
    return { __gtagArgs: Array.from(obj as ArrayLike<unknown>).map((v) => safeClone(v, depth + 1, seen)) }
  }
  if (Array.isArray(obj)) return obj.map((v) => safeClone(v, depth + 1, seen))
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(obj)) {
    try {
      out[key] = safeClone(obj[key], depth + 1, seen)
    } catch {
      out[key] = "[unreadable]"
    }
  }
  return out
}
