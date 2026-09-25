import { ChevronDown, ChevronRight } from "lucide-react"
import { useState } from "react"

// Collapsible JSON tree. When onPick is given, every key is clickable and
// reports its GTM data layer path (used by the Variable Builder).

type Props = { data: unknown; onPick?: (path: string, value: unknown) => void; defaultOpenDepth?: number }

export default function JsonView({ data, onPick, defaultOpenDepth = 2 }: Props) {
  return (
    <div className="font-mono text-xs leading-relaxed">
      <Node value={data} path="" depth={0} onPick={onPick} openDepth={defaultOpenDepth} />
    </div>
  )
}

function Primitive({ value }: { value: unknown }) {
  if (value === null) return <span className="text-slate-400">null</span>
  if (typeof value === "string") return <span className="break-all text-emerald-700">"{value}"</span>
  if (typeof value === "number") return <span className="text-blue-700">{value}</span>
  if (typeof value === "boolean") return <span className="text-purple-700">{String(value)}</span>
  return <span className="text-slate-500">{String(value)}</span>
}

function Node({ value, path, depth, onPick, openDepth, label }: { value: unknown; path: string; depth: number; onPick?: Props["onPick"]; openDepth: number; label?: string }) {
  const [open, setOpen] = useState(depth < openDepth)
  const isObj = value !== null && typeof value === "object"
  const keyEl =
    label !== undefined ? (
      onPick ? (
        <button type="button" className="rounded px-0.5 text-brand-700 hover:bg-brand-100" title={`Use ${path} as a variable`} onClick={() => onPick(path, value)}>
          {label}
        </button>
      ) : (
        <span className="text-brand-700">{label}</span>
      )
    ) : null

  if (!isObj) {
    return (
      <div className="pl-4">
        {keyEl}
        {keyEl && <span className="text-slate-400">: </span>}
        <Primitive value={value} />
      </div>
    )
  }

  const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v] as const) : Object.entries(value as object)
  const brackets = Array.isArray(value) ? ["[", "]"] : ["{", "}"]
  return (
    <div className={depth ? "pl-4" : ""}>
      <span className="inline-flex items-center">
        <button type="button" className="-ml-4 w-4 text-slate-400 hover:text-slate-700" onClick={() => setOpen(!open)}>
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        {keyEl}
        {keyEl && <span className="text-slate-400">:&nbsp;</span>}
        <span className="text-slate-400">
          {brackets[0]}
          {!open && ` ${entries.length} ${Array.isArray(value) ? "items" : "keys"} ${brackets[1]}`}
        </span>
      </span>
      {open && (
        <>
          {entries.map(([k, v]) => (
            <Node key={k} value={v} label={k} path={path ? `${path}.${k}` : k} depth={depth + 1} onPick={onPick} openDepth={openDepth} />
          ))}
          <div className="text-slate-400">{brackets[1]}</div>
        </>
      )}
    </div>
  )
}
