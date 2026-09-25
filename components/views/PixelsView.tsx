import { Radar } from "lucide-react"
import { useMemo, useState } from "react"

import { Badge, Card, CopyButton, Empty, KeyValueTable, SearchBox } from "~components/ui"
import { formatTime } from "~lib/hooks"
import { PIXEL_BY_ID } from "~lib/pixels"
import type { NetworkHit } from "~lib/types"

function StatusBadge({ hit }: { hit: NetworkHit }) {
  if (hit.error) return <Badge color="#dc2626">{hit.error.includes("BLOCKED") ? "blocked" : "failed"}</Badge>
  if (hit.status && hit.status >= 400) return <Badge color="#dc2626">{hit.status}</Badge>
  if (hit.status) return <Badge color="#16a34a">{hit.status}</Badge>
  return <Badge>sent</Badge>
}

export default function PixelsView({ hits }: { hits: NetworkHit[] }) {
  const [platform, setPlatform] = useState<string>("all")
  const [query, setQuery] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const h of hits) m.set(h.platformId, (m.get(h.platformId) ?? 0) + 1)
    return m
  }, [hits])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return hits
      .filter((h) => platform === "all" || h.platformId === platform)
      .filter((h) => !q || `${h.eventName} ${h.accountId} ${JSON.stringify(h.params)}`.toLowerCase().includes(q))
      .slice()
      .reverse()
  }, [hits, platform, query])

  const selected = hits.find((h) => h.id === selectedId) ?? visible[0]

  if (!hits.length) {
    return (
      <Card>
        <Empty
          icon={<Radar size={28} />}
          title="No pixel requests yet"
          hint="GA4, Google Ads, Meta, TikTok, Pinterest, Snapchat, LinkedIn, Microsoft Ads, X, Reddit, Klaviyo and Shopify events show up here as the page sends them — including blocked ones."
        />
      </Card>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        <Chip active={platform === "all"} onClick={() => setPlatform("all")}>
          All <span className="opacity-70">{hits.length}</span>
        </Chip>
        {[...counts.entries()].map(([id, n]) => (
          <Chip key={id} active={platform === id} onClick={() => setPlatform(id)} color={PIXEL_BY_ID[id]?.color}>
            {PIXEL_BY_ID[id]?.name ?? id} <span className="opacity-70">{n}</span>
          </Chip>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(320px,440px)_1fr]">
        <Card className="flex min-h-0 flex-col">
          <div className="mb-2 flex">
            <SearchBox value={query} onChange={setQuery} placeholder="Search event, ID or parameter…" />
          </div>
          <ul className="tp-scroll -mx-1 min-h-0 flex-1 overflow-auto px-1">
            {visible.map((h) => {
              const active = selected?.id === h.id
              return (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(h.id)}
                    className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition ${active ? "bg-brand-500 text-white" : "hover:bg-white/80"}`}>
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: PIXEL_BY_ID[h.platformId]?.color }} />
                    <span className="flex-1 truncate">
                      <span className="font-medium">{h.eventName}</span>
                      <span className={active ? "text-brand-100" : "text-slate-400"}> · {PIXEL_BY_ID[h.platformId]?.name ?? h.platformName}</span>
                    </span>
                    <StatusBadge hit={h} />
                    <span className={`shrink-0 font-mono text-[10px] ${active ? "text-brand-100" : "text-slate-400"}`}>{formatTime(h.ts)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </Card>

        {selected && (
          <Card
            className="tp-scroll min-h-0 overflow-auto"
            title={
              <span className="flex items-center gap-2">
                <Badge color={PIXEL_BY_ID[selected.platformId]?.color}>{selected.platformName}</Badge>
                {selected.eventName}
              </span>
            }
            actions={<CopyButton text={JSON.stringify(selected.params, null, 2)} label="Copy params" />}>
            <div className="space-y-3 text-xs">
              <div className="flex flex-wrap gap-1.5">
                {selected.accountId && <Badge>ID: {selected.accountId}</Badge>}
                {selected.serverSide && <Badge>server-side endpoint</Badge>}
                <StatusBadge hit={selected} />
                <Badge>{selected.method}</Badge>
              </div>
              {selected.error && (
                <p className="rounded-lg bg-red-50 p-2 text-red-700">
                  This request never reached {selected.platformName} ({selected.error}). An ad blocker, browser privacy setting or CSP stopped it — server-side tracking recovers these.
                </p>
              )}
              <p className="break-all font-mono text-[11px] text-slate-500">{selected.url}</p>
              <KeyValueTable rows={Object.entries(selected.params)} />
              {selected.body && (
                <details>
                  <summary className="cursor-pointer text-slate-600">Raw request body</summary>
                  <pre className="tp-scroll mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-white/70 p-2 font-mono text-[11px]">{selected.body}</pre>
                </details>
              )}
              {selected.pageUrl && <p className="break-all text-[11px] text-slate-400">Page: {selected.pageUrl}</p>}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

function Chip({ children, active, onClick, color }: { children: React.ReactNode; active: boolean; onClick: () => void; color?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${active ? "border-brand-500 bg-brand-500 text-white" : "border-slate-200 bg-white/70 text-slate-700 hover:bg-white"}`}>
      {color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />}
      {children}
    </button>
  )
}
