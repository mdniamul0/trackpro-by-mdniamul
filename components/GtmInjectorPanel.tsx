import { ExternalLink, Syringe, Unplug } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import { Badge, Button, Card } from "~components/ui"
import {
  getGtmSessions,
  getUserScriptsStatus,
  openUserScriptsToggle,
  parseGtmSnippet,
  startGtmInjection,
  stopGtmInjection,
  userScriptsToggleHelp,
  type GtmInjectionSession,
  type UserScriptsStatus
} from "~lib/gtm-injector"
import type { TargetTab } from "~lib/types"

export default function GtmInjectorPanel({ target }: { target: TargetTab | null }) {
  const [status, setStatus] = useState<UserScriptsStatus | null>(null)
  const [sessions, setSessions] = useState<Record<string, GtmInjectionSession>>({})
  const [snippet, setSnippet] = useState("")
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    setStatus(await getUserScriptsStatus())
    setSessions(await getGtmSessions())
  }, [])

  useEffect(() => {
    refresh()
    // The user flips the toggle on chrome://extensions and comes back.
    window.addEventListener("focus", refresh)
    return () => window.removeEventListener("focus", refresh)
  }, [refresh])

  const active = target ? sessions[target.origin] : undefined
  const preview = snippet.trim() ? parseGtmSnippet(snippet) : null
  const isWebPage = !!target && /^https?:/.test(target.origin)

  async function inject() {
    if (!target) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await startGtmInjection(target.origin, snippet)
      if (!result.ok) {
        setMessage({ kind: "error", text: result.error })
      } else {
        await chrome.tabs.reload(target.tabId).catch(() => {})
        setMessage({ kind: "ok", text: `${result.containerId} now loads on every page of ${target.origin} until you disconnect. The tab was reloaded.` })
        setSnippet("")
      }
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
      refresh()
    }
  }

  async function disconnect(origin: string) {
    setBusy(true)
    await stopGtmInjection(origin)
    if (target?.origin === origin) await chrome.tabs.reload(target.tabId).catch(() => {})
    setMessage({ kind: "ok", text: `Disconnected ${origin}. The tab was reloaded without the injected container.` })
    setBusy(false)
    refresh()
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_minmax(280px,380px)]">
      <Card
        title={
          <span className="flex items-center gap-2">
            <Syringe size={15} className="text-brand-500" /> GTM Injector
          </span>
        }>
        <div className="space-y-3 text-xs">
          <p className="text-slate-600">
            Load any GTM container on a website without installing it — test a new container on a client's live site, then open GTM <b>Preview</b> / Tag Assistant as usual. It keeps loading on every page of that site until you disconnect.
          </p>

          {status === "unsupported" && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">GTM Injector needs Chrome 120 or newer. Please update Chrome.</div>
          )}

          {status === "needs-toggle" && (
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
              <p className="font-semibold">One-time setup: allow user scripts</p>
              <p>{userScriptsToggleHelp()}</p>
              <p className="text-[11px] text-amber-800">
                Chrome requires this for any extension that runs code you provide. TrackPro only runs the GTM snippet you paste here, only on the site you choose.
              </p>
              <Button variant="primary" onClick={openUserScriptsToggle}>
                <ExternalLink size={13} /> Open extension settings
              </Button>
            </div>
          )}

          {status === "ready" && !isWebPage && <p className="text-slate-500">Open a website, then click the TrackPro icon on that tab (or pick it at the top).</p>}

          {status === "ready" && isWebPage && target && (
            <div className="space-y-2">
              <p className="flex flex-wrap items-center gap-2">
                Site: <span className="font-mono">{target.origin}</span>
                {active && <Badge color="#16a34a">{active.containerId} active</Badge>}
              </p>
              <label className="block font-medium text-slate-700" htmlFor="gtm-snippet">
                Paste the GTM install snippet (GTM → Admin → Install Google Tag Manager → the &lt;head&gt; code)
              </label>
              <textarea
                id="gtm-snippet"
                className="h-44 w-full rounded-lg border border-slate-200 bg-white/80 p-2 font-mono text-[11px] outline-none focus:border-brand-400"
                placeholder={"<!-- Google Tag Manager -->\n<script>(function(w,d,s,l,i){ … })(window,document,'script','dataLayer','GTM-XXXXXXX');</script>\n<!-- End Google Tag Manager -->"}
                value={snippet}
                onChange={(e) => setSnippet(e.target.value)}
              />
              {preview && <p className={preview.ok ? "text-emerald-700" : "text-red-700"}>{preview.ok ? `✓ Container found: ${preview.containerId}` : preview.error}</p>}
              <p className="text-[11px] text-slate-500">Server-side GTM / custom loader snippets (first-party domain, Stape) work too — paste them as they are.</p>
              <Button variant="primary" disabled={busy || !preview?.ok} onClick={inject}>
                <Syringe size={13} /> {active ? "Replace container & reload" : "Inject & reload"}
              </Button>
            </div>
          )}

          {message && <p className={`rounded-lg p-2 ${message.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{message.text}</p>}
        </div>
      </Card>

      <Card title={`Active injections (${Object.keys(sessions).length})`}>
        {Object.keys(sessions).length ? (
          <ul className="space-y-2 text-xs">
            {Object.entries(sessions).map(([origin, s]) => (
              <li key={origin} className="flex items-center justify-between gap-2 rounded-lg bg-white/60 p-2">
                <span className="min-w-0">
                  <span className="block font-mono font-medium">{s.containerId}</span>
                  <span className="block truncate text-slate-500">{origin}</span>
                </span>
                <Button variant="danger" disabled={busy} onClick={() => disconnect(origin)}>
                  <Unplug size={13} /> Disconnect
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-500">No containers injected.</p>
        )}
      </Card>
    </div>
  )
}
