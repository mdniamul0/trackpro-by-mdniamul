import { ShieldCheck } from "lucide-react"

import { Badge, Card, Empty, KeyValueTable } from "~components/ui"
import { formatTime } from "~lib/hooks"
import type { DataLayerEntry, PageSnapshot } from "~lib/types"

const CONSENT_V2 = ["ad_storage", "analytics_storage", "ad_user_data", "ad_personalization"]

function State({ value }: { value?: boolean }) {
  if (value === undefined) return <span className="text-slate-400">—</span>
  return value ? <Badge color="#16a34a">granted</Badge> : <Badge color="#dc2626">denied</Badge>
}

export default function ConsentView({ snapshot, entries }: { snapshot: PageSnapshot | null; entries: DataLayerEntry[] }) {
  // gtag('consent', 'default' | 'update', {...}) calls, in order.
  const consentCommands = entries.filter((e) => {
    const args = (e.data as any)?.__gtagArgs
    return Array.isArray(args) && args[0] === "consent"
  })

  const consent = snapshot?.consent ?? null
  const types = consent ? [...new Set([...CONSENT_V2, ...Object.keys(consent)])] : []

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Google Consent Mode" className="lg:col-span-2">
        {consent && Object.keys(consent).length ? (
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="py-1">Consent type</th>
                <th>Default</th>
                <th>Update</th>
                <th>Effective now</th>
              </tr>
            </thead>
            <tbody>
              {types.map((t) => {
                const e = consent[t]
                const effective = e?.update ?? e?.default
                return (
                  <tr key={t} className="border-t border-slate-100">
                    <td className="py-1.5 font-mono">
                      {t} {CONSENT_V2.slice(2).includes(t) && <Badge className="ml-1">v2</Badge>}
                    </td>
                    <td>
                      <State value={e?.default} />
                    </td>
                    <td>
                      <State value={e?.update} />
                    </td>
                    <td>{e ? <State value={effective} /> : <span className="text-amber-600">not set</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <Empty icon={<ShieldCheck size={28} />} title="No Consent Mode detected" hint="The page hasn't set gtag('consent', 'default', …). Required for EEA/UK traffic on Google Ads & GA4." />
        )}
      </Card>

      <Card title={`Consent commands (${consentCommands.length})`}>
        {consentCommands.length ? (
          <ul className="space-y-1.5 text-xs">
            {consentCommands.map((e) => {
              const [, mode, values] = (e.data as any).__gtagArgs
              return (
                <li key={e.id} className="rounded-lg bg-white/60 p-2">
                  <div className="mb-1 flex items-center justify-between">
                    <Badge>{String(mode)}</Badge>
                    <span className="font-mono text-[10px] text-slate-400">{formatTime(e.ts)}</span>
                  </div>
                  <pre className="whitespace-pre-wrap break-all font-mono text-[11px] text-slate-700">{JSON.stringify(values, null, 1)}</pre>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-xs text-slate-500">No gtag('consent', …) calls captured.</p>
        )}
      </Card>

      <div className="space-y-4">
        <Card title="Click IDs in URL">
          <KeyValueTable rows={Object.entries(snapshot?.clickIds ?? {})} emptyText="No click IDs (gclid, fbclid, ttclid…) in this page's URL." />
        </Card>
        <Card title="UTM parameters">
          <KeyValueTable rows={Object.entries(snapshot?.utm ?? {})} emptyText="No UTM parameters in this page's URL." />
        </Card>
      </div>

      <Card title="First-party marketing cookies" className="lg:col-span-2">
        <p className="mb-2 text-[11px] text-slate-500">
          Read from the page itself (document.cookie) — the cookies GA4, Google Ads, Meta, TikTok & others use for attribution. HttpOnly server cookies (e.g. FPID set by server-side GTM) aren't visible to the page and won't appear.
        </p>
        <KeyValueTable rows={Object.entries(snapshot?.cookies ?? {})} emptyText="No marketing cookies set yet (often because consent is denied)." />
      </Card>
    </div>
  )
}
