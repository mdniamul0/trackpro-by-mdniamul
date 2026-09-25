import "~style.css"

import { Cookie, FileJson, Layers, LayoutDashboard, Radar, RefreshCw, ShoppingBag, Syringe, Trash2, Wrench } from "lucide-react"
import { useEffect, useState } from "react"

import GtmInjectorPanel from "~components/GtmInjectorPanel"
import { Button } from "~components/ui"
import ConsentView from "~components/views/ConsentView"
import DataLayerView from "~components/views/DataLayerView"
import FormsShopifyView from "~components/views/FormsShopifyView"
import OverviewView from "~components/views/OverviewView"
import PixelsView from "~components/views/PixelsView"
import VariableBuilderView from "~components/views/VariableBuilderView"
import { EMBEDDED_FORM_PROVIDERS } from "~lib/embedded-forms"
import { useStorageValue, useTargetTab } from "~lib/hooks"
import { inspectPage, type InspectResult } from "~lib/page-inspector"
import {
  dataLayerKey,
  formsKey,
  networkKey,
  snapshotKey,
  uid,
  type DataLayerEntry,
  type FormEvent,
  type NetworkHit,
  type PageSnapshot
} from "~lib/types"

const VIEWS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "datalayer", label: "Data Layer", icon: Layers },
  { id: "pixels", label: "Pixel Events", icon: Radar },
  { id: "variables", label: "Variable Builder", icon: Wrench },
  { id: "gtm", label: "GTM Injector", icon: Syringe },
  { id: "consent", label: "Consent & Cookies", icon: Cookie },
  { id: "forms", label: "Shopify & Forms", icon: ShoppingBag }
] as const

type ViewId = (typeof VIEWS)[number]["id"]
const VIEW_KEY = "trackpro:last-view"

function Dashboard() {
  const { target, setTarget } = useTargetTab()
  const tabId = target?.tabId ?? null
  const entries = useStorageValue<DataLayerEntry[]>("session", tabId !== null ? dataLayerKey(tabId) : null, [])
  const hits = useStorageValue<NetworkHit[]>("session", tabId !== null ? networkKey(tabId) : null, [])
  const forms = useStorageValue<FormEvent[]>("session", tabId !== null ? formsKey(tabId) : null, [])
  const snapshot = useStorageValue<PageSnapshot | null>("session", tabId !== null ? snapshotKey(tabId) : null, null)

  const [view, setView] = useState<ViewId>(() => {
    try {
      return (localStorage.getItem(VIEW_KEY) as ViewId) || "overview"
    } catch {
      return "overview"
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view)
    } catch {
      // storage unavailable — not important
    }
  }, [view])

  useEffect(() => {
    document.title = "TrackPro by MD Niamul"
  }, [])

  const [tabs, setTabs] = useState<chrome.tabs.Tab[]>([])
  const [scanState, setScanState] = useState<string | null>(null)

  const loadTabs = () =>
    chrome.tabs.query({}).then((all) => setTabs(all.filter((t) => t.id !== undefined && /^https?:/.test(t.url ?? ""))))
  useEffect(() => {
    loadTabs()
  }, [target?.tabId])

  // Reads the page directly: catches tabs that were open before TrackPro was
  // installed/updated (their content scripts never ran) and refreshes state.
  async function rescan() {
    if (tabId === null) return
    setScanState("Scanning…")
    try {
      const providers = EMBEDDED_FORM_PROVIDERS.map((p) => ({ id: p.id, name: p.name, source: p.srcPattern.source, flags: p.srcPattern.flags }))
      const [res] = await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func: inspectPage, args: [providers, true] })
      const result = res?.result as InspectResult | undefined
      if (!result) throw new Error("No result")
      await chrome.storage.session.set({ [snapshotKey(tabId)]: result.snapshot })
      let imported = 0
      if (!entries.some((e) => e.kind === "push") && result.dataLayers?.length) {
        const now = Date.now()
        const recovered: DataLayerEntry[] = [{ id: uid(), kind: "page", ts: now, pageUrl: result.snapshot.url, dlName: "" }]
        for (const dl of result.dataLayers) {
          for (const data of dl.entries) recovered.push({ id: uid(), kind: "push", ts: now, pageUrl: result.snapshot.url, dlName: dl.name, data })
        }
        imported = recovered.length - 1
        await chrome.storage.session.set({ [dataLayerKey(tabId)]: recovered })
      }
      setScanState(imported ? `Loaded ${imported} existing pushes. Reload the tab to capture exact timing.` : "Page rescanned.")
    } catch {
      setScanState("Can't read this tab (Chrome pages, the Web Store and PDFs are off-limits to extensions).")
    }
    setTimeout(() => setScanState(null), 5000)
  }

  async function clearCaptures() {
    if (tabId === null) return
    await chrome.storage.session.remove([dataLayerKey(tabId), networkKey(tabId), formsKey(tabId)])
  }

  const counts: Partial<Record<ViewId, number>> = {
    datalayer: entries.filter((e) => e.kind === "push").length,
    pixels: hits.length,
    forms: forms.length + hits.filter((h) => h.platformId === "shopify").length
  }

  return (
    <div className="tp-ambient-bg flex h-screen min-h-0 flex-col text-slate-800">
      <header className="tp-glass-edge flex flex-wrap items-center gap-3 border-b border-glass-border bg-glass-light px-4 py-2.5 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 text-sm font-bold text-white shadow">TP</div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">TrackPro</div>
            <div className="text-[10px] text-slate-500">by MD Niamul</div>
          </div>
        </div>

        <select
          className="min-w-0 max-w-[480px] flex-1 truncate rounded-lg border border-slate-200 bg-white/80 px-2 py-1.5 text-xs"
          value={tabId ?? ""}
          onFocus={loadTabs}
          onChange={(e) => {
            const tab = tabs.find((t) => t.id === Number(e.target.value))
            if (tab) setTarget(tab)
          }}>
          {tabId === null && <option value="">Choose a website tab…</option>}
          {tabId !== null && !tabs.some((t) => t.id === tabId) && <option value={tabId}>{target?.url}</option>}
          {tabs.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title ? `${t.title} — ` : ""}
              {t.url}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-[11px] text-emerald-700">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> Live
          </span>
          <Button onClick={rescan} disabled={tabId === null} title="Read the page again">
            <RefreshCw size={13} /> Rescan
          </Button>
          <Button onClick={clearCaptures} disabled={tabId === null} title="Clear captured events for this tab">
            <Trash2 size={13} /> Clear
          </Button>
        </div>
        {scanState && <p className="w-full text-[11px] text-slate-600">{scanState}</p>}
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="tp-glass-edge flex w-52 shrink-0 flex-col gap-1 border-r border-glass-border bg-glass-light p-3 backdrop-blur-xl">
          {VIEWS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              className={`flex items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium transition ${view === id ? "bg-brand-500 text-white shadow" : "text-slate-700 hover:bg-white/70"}`}>
              <Icon size={15} />
              <span className="flex-1">{label}</span>
              {!!counts[id] && <span className={`rounded-full px-1.5 text-[10px] ${view === id ? "bg-white/25" : "bg-brand-100 text-brand-700"}`}>{counts[id]}</span>}
            </button>
          ))}
          <div className="mt-auto space-y-1 pt-4 text-[10px] leading-snug text-slate-500">
            <p className="flex items-center gap-1">
              <FileJson size={11} /> Data stays in your browser.
            </p>
            <a className="text-brand-600 hover:underline" href="https://mdniamul.com" target="_blank" rel="noreferrer">
              mdniamul.com
            </a>
          </div>
        </nav>

        <main className="tp-scroll min-h-0 flex-1 overflow-auto p-4">
          {view === "overview" && <OverviewView snapshot={snapshot} entries={entries} hits={hits} forms={forms} />}
          {view === "datalayer" && <DataLayerView entries={entries} />}
          {view === "pixels" && <PixelsView hits={hits} />}
          {view === "variables" && <VariableBuilderView entries={entries} />}
          {view === "gtm" && <GtmInjectorPanel target={target} />}
          {view === "consent" && <ConsentView snapshot={snapshot} entries={entries} />}
          {view === "forms" && <FormsShopifyView snapshot={snapshot} hits={hits} forms={forms} />}
        </main>
      </div>
    </div>
  )
}

export default Dashboard
