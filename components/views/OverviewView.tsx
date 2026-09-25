import { AlertTriangle, CheckCircle2, Globe, Info } from "lucide-react"

import { Badge, Card, Empty } from "~components/ui"
import { runHealthChecks } from "~lib/health"
import { PIXEL_BY_ID } from "~lib/pixels"
import type { DataLayerEntry, FormEvent, NetworkHit, PageSnapshot } from "~lib/types"

type Props = { snapshot: PageSnapshot | null; entries: DataLayerEntry[]; hits: NetworkHit[]; forms: FormEvent[] }

export default function OverviewView({ snapshot, entries, hits, forms }: Props) {
  const findings = runHealthChecks(snapshot, entries, hits)
  const pushes = entries.filter((e) => e.kind === "push")

  // Platform → { ids, events }
  const byPlatform = new Map<string, { ids: Set<string>; events: Map<string, number>; blocked: number; serverSide: boolean }>()
  for (const h of hits) {
    const p = byPlatform.get(h.platformId) ?? { ids: new Set(), events: new Map(), blocked: 0, serverSide: false }
    if (h.accountId) p.ids.add(h.accountId)
    p.events.set(h.eventName, (p.events.get(h.eventName) ?? 0) + 1)
    if (h.error) p.blocked++
    if (h.serverSide) p.serverSide = true
    byPlatform.set(h.platformId, p)
  }

  const detectedLibraries = snapshot ? Object.entries(snapshot.globals).filter(([, on]) => on).map(([name]) => name) : []

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="Page" className="lg:col-span-2">
        {snapshot ? (
          <div className="space-y-2 text-xs">
            <p className="truncate text-sm font-medium text-slate-800">{snapshot.title || "(untitled)"}</p>
            <p className="break-all text-slate-500">{snapshot.url}</p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {snapshot.platform && <Badge>{snapshot.platform.name}{snapshot.platform.detail ? ` · ${snapshot.platform.detail}` : ""}</Badge>}
              {snapshot.gtmContainers.map((id) => (
                <Badge key={id} color="#2f5bd1">{id}</Badge>
              ))}
              {snapshot.googleTagIds.map((id) => (
                <Badge key={id} color="#f59e0b">{id}</Badge>
              ))}
            </div>
            {detectedLibraries.length > 0 && (
              <p className="pt-1 text-slate-600">
                <span className="font-medium">Tracking libraries: </span>
                {detectedLibraries.join(" · ")}
              </p>
            )}
          </div>
        ) : (
          <Empty icon={<Globe size={28} />} title="Waiting for the page" hint="Reload the website tab (or press Rescan) so TrackPro can read it." />
        )}
      </Card>

      <Card title="At a glance">
        <div className="grid grid-cols-2 gap-3 text-center">
          <Stat label="Data layer pushes" value={pushes.length} />
          <Stat label="Pixel hits" value={hits.length} />
          <Stat label="Platforms" value={byPlatform.size} />
          <Stat label="Form events" value={forms.length} />
        </div>
      </Card>

      <Card title="Tracking health" className="lg:col-span-3">
        {findings.length ? (
          <ul className="space-y-2">
            {findings.map((f, i) => (
              <li key={i} className="flex gap-2 rounded-lg bg-white/60 p-2 text-xs">
                {f.level === "error" ? (
                  <AlertTriangle size={15} className="mt-0.5 shrink-0 text-red-500" />
                ) : f.level === "warning" ? (
                  <Info size={15} className="mt-0.5 shrink-0 text-amber-500" />
                ) : (
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-500" />
                )}
                <span>
                  <span className="font-medium text-slate-800">{f.title}</span>
                  <span className="text-slate-600"> — {f.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-500">No findings yet. Browse the site to collect events.</p>
        )}
      </Card>

      <Card title="Pixels & tags firing" className="lg:col-span-3">
        {byPlatform.size ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[...byPlatform.entries()].map(([id, p]) => (
              <div key={id} className="rounded-xl border border-slate-200 bg-white/60 p-3 text-xs">
                <div className="mb-1 flex items-center justify-between">
                  <Badge color={PIXEL_BY_ID[id]?.color}>{PIXEL_BY_ID[id]?.name ?? id}</Badge>
                  <span className="flex gap-1">
                    {p.serverSide && <Badge>server-side</Badge>}
                    {p.blocked > 0 && <Badge color="#dc2626">{p.blocked} blocked</Badge>}
                  </span>
                </div>
                {p.ids.size > 0 && <p className="break-all font-mono text-slate-500">{[...p.ids].join(", ")}</p>}
                <p className="mt-1 text-slate-700">
                  {[...p.events.entries()].map(([ev, n]) => `${ev}${n > 1 ? ` ×${n}` : ""}`).join(" · ")}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500">No pixel requests seen on this tab yet.</p>
        )}
      </Card>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white/60 p-2">
      <div className="text-xl font-semibold text-brand-600">{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  )
}
