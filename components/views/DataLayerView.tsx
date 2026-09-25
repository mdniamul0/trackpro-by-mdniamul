import { Layers } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import JsonView from "~components/JsonView"
import { Badge, Card, CopyButton, Empty, SearchBox } from "~components/ui"
import { formatTime } from "~lib/hooks"
import type { DataLayerEntry } from "~lib/types"

/** Short label for a push: the event name, or the gtag() call. */
export function describePush(data: unknown): { label: string; isGtag: boolean; isInternal: boolean } {
  if (data && typeof data === "object") {
    const d = data as any
    if (Array.isArray(d.__gtagArgs)) {
      const [cmd, a1] = d.__gtagArgs
      return { label: `gtag("${cmd}"${a1 !== undefined ? `, "${typeof a1 === "string" ? a1 : "…"}"` : ""})`, isGtag: true, isInternal: false }
    }
    if (typeof d.event === "string") return { label: d.event, isGtag: false, isInternal: /^gtm\./.test(d.event) }
    if ("ecommerce" in d && d.ecommerce === null) return { label: "ecommerce: null", isGtag: false, isInternal: false }
    return { label: "(push without event)", isGtag: false, isInternal: false }
  }
  return { label: String(data), isGtag: false, isInternal: false }
}

export default function DataLayerView({ entries }: { entries: DataLayerEntry[] }) {
  const [query, setQuery] = useState("")
  const [hideInternal, setHideInternal] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return entries.filter((e) => {
      if (e.kind === "page") return !q
      const info = describePush(e.data)
      if (hideInternal && info.isInternal) return false
      return !q || JSON.stringify(e.data).toLowerCase().includes(q)
    })
  }, [entries, query, hideInternal])

  // Follow the newest push until the user picks one.
  const pushes = visible.filter((e) => e.kind === "push")
  const selected = entries.find((e) => e.id === selectedId) ?? pushes[pushes.length - 1]
  useEffect(() => {
    if (selectedId && !entries.some((e) => e.id === selectedId)) setSelectedId(null)
  }, [entries, selectedId])

  if (!entries.length) {
    return (
      <Card>
        <Empty
          icon={<Layers size={28} />}
          title="No data layer activity yet"
          hint="Reload the website tab. TrackPro records every dataLayer.push and gtag() call from the moment the page starts loading."
        />
      </Card>
    )
  }

  let n = 0
  return (
    <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[minmax(280px,380px)_1fr]">
      <Card className="flex min-h-0 flex-col">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <SearchBox value={query} onChange={setQuery} placeholder="Search events & values…" />
          <label className="flex items-center gap-1 text-xs text-slate-600">
            <input type="checkbox" checked={hideInternal} onChange={(e) => setHideInternal(e.target.checked)} /> Hide gtm.*
          </label>
        </div>
        <ol className="tp-scroll -mx-1 min-h-0 flex-1 overflow-auto px-1">
          {visible.map((e) => {
            if (e.kind === "page") {
              return (
                <li key={e.id} className="my-2 truncate rounded-md bg-brand-50 px-2 py-1 text-[11px] font-medium text-brand-700" title={e.pageUrl}>
                  ▸ {e.pageUrl}
                </li>
              )
            }
            n++
            const info = describePush(e.data)
            const active = selected?.id === e.id
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(e.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition ${active ? "bg-brand-500 text-white" : "hover:bg-white/80"}`}>
                  <span className={`w-6 shrink-0 text-right font-mono ${active ? "text-brand-100" : "text-slate-400"}`}>{n}</span>
                  <span className={`flex-1 truncate font-medium ${info.isInternal && !active ? "text-slate-400" : ""}`}>{info.label}</span>
                  {e.dlName !== "dataLayer" && <Badge>{e.dlName}</Badge>}
                  <span className={`shrink-0 font-mono text-[10px] ${active ? "text-brand-100" : "text-slate-400"}`}>{formatTime(e.ts)}</span>
                </button>
              </li>
            )
          })}
        </ol>
      </Card>

      <Card
        className="min-h-0 overflow-hidden"
        title={selected ? describePush(selected.data).label : "Select a push"}
        actions={selected && <CopyButton text={JSON.stringify(selected.data, null, 2)} label="Copy JSON" />}>
        {selected && (
          <div className="tp-scroll max-h-[calc(100vh-220px)] overflow-auto">
            <p className="mb-2 break-all text-[11px] text-slate-500">
              {formatTime(selected.ts)} · {selected.dlName} · {selected.pageUrl}
            </p>
            <JsonView data={selected.data} defaultOpenDepth={4} />
          </div>
        )}
      </Card>
    </div>
  )
}
