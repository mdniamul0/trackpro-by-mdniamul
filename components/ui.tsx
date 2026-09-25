import { Check, Copy, Search } from "lucide-react"
import { useState, type ReactNode } from "react"

import { copyText } from "~lib/hooks"

export function Card({ title, actions, children, className = "" }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`tp-glass-edge rounded-2xl border border-glass-border bg-glass-lighter p-4 shadow-glass backdrop-blur-xl ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h3 className="text-sm font-semibold text-slate-800">{title}</h3>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

export function Badge({ children, color, className = "" }: { children: ReactNode; color?: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${color ? "text-white" : "bg-brand-100 text-brand-700"} ${className}`}
      style={color ? { backgroundColor: color } : undefined}>
      {children}
    </span>
  )
}

export function Empty({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-slate-500">
      {icon && <div className="text-brand-400">{icon}</div>}
      <p className="font-medium text-slate-600">{title}</p>
      {hint && <p className="max-w-md text-xs">{hint}</p>}
    </div>
  )
}

export function Button({
  children,
  onClick,
  variant = "secondary",
  disabled,
  title
}: {
  children: ReactNode
  onClick?: () => void
  variant?: "primary" | "secondary" | "danger"
  disabled?: boolean
  title?: string
}) {
  const styles = {
    primary: "bg-brand-500 text-white hover:bg-brand-600 shadow-sm",
    secondary: "bg-white/70 text-slate-700 hover:bg-white border border-slate-200",
    danger: "bg-white/70 text-red-600 hover:bg-red-50 border border-red-200"
  }[variant]
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles}`}>
      {children}
    </button>
  )
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <Button
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true)
          setTimeout(() => setDone(false), 1200)
        }
      }}>
      {done ? <Check size={13} /> : <Copy size={13} />} {done ? "Copied" : label}
    </Button>
  )
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="flex min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white/70 px-2.5 py-1.5 text-xs focus-within:border-brand-400">
      <Search size={13} className="text-slate-400" />
      <input className="w-full bg-transparent outline-none" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

export function KeyValueTable({ rows, emptyText = "No parameters." }: { rows: [string, string][]; emptyText?: string }) {
  if (!rows.length) return <p className="text-xs text-slate-500">{emptyText}</p>
  return (
    <div className="tp-scroll max-h-[420px] overflow-auto rounded-lg border border-slate-200 bg-white/60">
      <table className="w-full text-left text-xs">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-b border-slate-100 last:border-0 align-top">
              <td className="w-1/3 break-all px-2 py-1 font-mono text-brand-700">{k}</td>
              <td className="break-all px-2 py-1 font-mono text-slate-700">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
