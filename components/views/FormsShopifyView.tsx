import { ShoppingBag } from "lucide-react"

import { Badge, Card, Empty } from "~components/ui"
import { formatTime } from "~lib/hooks"
import type { FormEvent, NetworkHit, PageSnapshot } from "~lib/types"

export default function FormsShopifyView({ snapshot, hits, forms }: { snapshot: PageSnapshot | null; hits: NetworkHit[]; forms: FormEvent[] }) {
  const shopifyEvents = hits.filter((h) => h.platformId === "shopify").slice().reverse()
  const shopify = snapshot?.shopify

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Shopify customer events">
        {shopify || shopifyEvents.length ? (
          <div className="space-y-3 text-xs">
            <div className="flex flex-wrap gap-1.5">
              {shopify?.shop && <Badge color="#65a30d">{shopify.shop}</Badge>}
              {shopify && <Badge>{shopify.webPixelSandboxes} web pixel sandbox(es)</Badge>}
              {shopify?.hasCustomerEvents && <Badge>Web Pixels Manager active</Badge>}
            </div>
            <p className="text-slate-600">
              Shopify runs custom pixels in sandboxed iframes that GTM on the page can't see. TrackPro reads the customer events those sandboxes send to Shopify at the network level.
            </p>
            {shopifyEvents.length ? (
              <ul className="tp-scroll max-h-[420px] space-y-1 overflow-auto">
                {shopifyEvents.map((h) => (
                  <li key={h.id} className="flex items-center justify-between rounded-lg bg-white/60 px-2 py-1">
                    <span className="font-medium">{h.eventName}</span>
                    <span className="font-mono text-[10px] text-slate-400">{formatTime(h.ts)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-slate-500">No customer events captured yet. Browse products / add to cart.</p>
            )}
          </div>
        ) : (
          <Empty icon={<ShoppingBag size={28} />} title="Not a Shopify store" hint="Shopify detection and customer events appear here on Shopify sites." />
        )}
      </Card>

      <Card title="Embedded forms & booking widgets">
        <div className="space-y-3 text-xs">
          {snapshot?.embeddedForms.length ? (
            <ul className="space-y-1">
              {snapshot.embeddedForms.map((f, i) => (
                <li key={i} className="rounded-lg bg-white/60 px-2 py-1">
                  <Badge>{f.providerName}</Badge> <span className="break-all text-slate-500">{f.src}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-500">No embedded form iframes (Calendly, Typeform, HubSpot, GoHighLevel, Jotform, Tally…) found on this page.</p>
          )}

          <p className="font-medium text-slate-700">Form events ({forms.length})</p>
          {forms.length ? (
            <ul className="tp-scroll max-h-[420px] space-y-1.5 overflow-auto">
              {forms
                .slice()
                .reverse()
                .map((f) => (
                  <li key={f.id} className="rounded-lg bg-white/60 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5">
                        <Badge>{f.providerName}</Badge>
                        <span className="font-medium">{f.eventName}</span>
                        <span className="text-[10px] text-slate-400">via {f.via}</span>
                      </span>
                      <span className="font-mono text-[10px] text-slate-400">{formatTime(f.ts)}</span>
                    </div>
                    <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] text-slate-600">{f.preview}</pre>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="text-slate-500">Submit or interact with an embedded form to see its events — useful for building GTM listeners for iframe forms.</p>
          )}
        </div>
      </Card>
    </div>
  )
}
