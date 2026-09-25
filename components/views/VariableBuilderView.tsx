import { Download, Plus, Trash2, Wrench } from "lucide-react"
import { useMemo, useState } from "react"

import JsonView from "~components/JsonView"
import { Badge, Button, Card, CopyButton, Empty } from "~components/ui"
import { describePush } from "~components/views/DataLayerView"
import { downloadJson } from "~lib/hooks"
import type { DataLayerEntry } from "~lib/types"
import {
  buildGtmImport,
  CJS_TEMPLATES,
  defaultDlvName,
  listPaths,
  readPath,
  type TriggerSpec,
  type VariableSpec
} from "~lib/variable-builder"

export default function VariableBuilderView({ entries }: { entries: DataLayerEntry[] }) {
  // Only real events are useful sources (skip gtm.* internals and gtag config).
  const pushes = useMemo(
    () => entries.filter((e) => e.kind === "push" && e.data && typeof e.data === "object" && !describePush(e.data).isInternal),
    [entries]
  )
  const [sourceId, setSourceId] = useState<string | null>(null)
  const source = pushes.find((p) => p.id === sourceId) ?? [...pushes].reverse().find((p: any) => p.data?.ecommerce) ?? pushes[pushes.length - 1]

  const [variables, setVariables] = useState<VariableSpec[]>([])
  const [triggers, setTriggers] = useState<TriggerSpec[]>([])
  const [templateId, setTemplateId] = useState(CJS_TEMPLATES[0].id)
  const [templateSource, setTemplateSource] = useState("")

  const eventNames = useMemo(() => {
    const names = new Set<string>()
    for (const p of pushes) {
      const ev = (p.data as any)?.event
      if (typeof ev === "string" && !ev.startsWith("gtm.")) names.add(ev)
    }
    return [...names]
  }, [pushes])

  const dlvVariables = variables.filter((v): v is Extract<VariableSpec, { kind: "dlv" }> => v.kind === "dlv")
  const template = CJS_TEMPLATES.find((t) => t.id === templateId)!
  const templateCandidates = dlvVariables.filter((v) => {
    if (template.source !== "array") return true
    return Array.isArray(readPath(source?.data, v.path))
  })

  function addDlv(path: string) {
    if (variables.some((v) => v.kind === "dlv" && v.path === path)) return
    setVariables((vs) => [...vs, { kind: "dlv", name: defaultDlvName(path), path }])
  }

  function addTemplate() {
    const dlv = dlvVariables.find((v) => v.name === templateSource) ?? templateCandidates[0]
    if (!dlv) return
    const name = `CJS - ${template.label.replace(/\s*\(.*\)$/, "")} (${dlv.path})`
    if (variables.some((v) => v.name === name)) return
    setVariables((vs) => [...vs, { kind: "cjs", name, code: template.build(dlv.name) }])
  }

  function toggleTrigger(eventName: string) {
    setTriggers((ts) => (ts.some((t) => t.eventName === eventName) ? ts.filter((t) => t.eventName !== eventName) : [...ts, { name: `CE - ${eventName}`, eventName }]))
  }

  const exportJson = buildGtmImport(variables, triggers)

  if (!pushes.length) {
    return (
      <Card>
        <Empty
          icon={<Wrench size={28} />}
          title="No data layer events to build from"
          hint="Trigger the event on the website (add to cart, purchase, form submit…). Then click any key in the push to turn it into a GTM variable."
        />
      </Card>
    )
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card
        title="1 · Pick values from a data layer push"
        actions={
          <select
            className="max-w-[260px] rounded-lg border border-slate-200 bg-white/80 px-2 py-1 text-xs"
            value={source?.id}
            onChange={(e) => setSourceId(e.target.value)}>
            {pushes.map((p, i) => (
              <option key={p.id} value={p.id}>
                {i + 1}. {describePush(p.data).label}
              </option>
            ))}
          </select>
        }>
        <p className="mb-2 text-xs text-slate-500">Click any key to add it as a Data Layer Variable.</p>
        <div className="tp-scroll max-h-[520px] overflow-auto rounded-lg bg-white/60 p-2">
          {source && <JsonView data={source.data} onPick={(path) => addDlv(path)} defaultOpenDepth={4} />}
        </div>
        {source && (
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-slate-600">All paths in this push</summary>
            <ul className="tp-scroll mt-1 max-h-48 overflow-auto">
              {listPaths(source.data).map((p) => (
                <li key={p.path} className="flex items-center justify-between gap-2 py-0.5">
                  <span className="truncate font-mono text-brand-700">{p.path}</span>
                  <span className="flex items-center gap-1">
                    <Badge>{p.type}</Badge>
                    <button type="button" className="text-brand-600 hover:underline" onClick={() => addDlv(p.path)}>
                      add
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>

      <div className="space-y-4">
        <Card title={`2 · Variables (${variables.length})`}>
          {variables.length ? (
            <ul className="space-y-2">
              {variables.map((v, i) => (
                <li key={i} className="rounded-lg border border-slate-200 bg-white/60 p-2 text-xs">
                  <div className="flex items-center gap-2">
                    <Badge color={v.kind === "dlv" ? "#3b6fed" : "#7c3aed"}>{v.kind === "dlv" ? "Data Layer" : "Custom JS"}</Badge>
                    <input
                      className="flex-1 rounded border border-transparent bg-transparent px-1 font-medium hover:border-slate-200 focus:border-brand-400 focus:outline-none"
                      value={v.name}
                      onChange={(e) => setVariables((vs) => vs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                    />
                    <button type="button" title="Remove" className="text-slate-400 hover:text-red-600" onClick={() => setVariables((vs) => vs.filter((_, j) => j !== i))}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {v.kind === "dlv" ? (
                    <div className="mt-1 grid gap-1 pl-1 text-[11px] text-slate-600">
                      <span>
                        Key: <span className="font-mono text-brand-700">{v.path}</span>
                      </span>
                      <span className="truncate">
                        Value now: <span className="font-mono">{JSON.stringify(readPath(source?.data, v.path)) ?? "undefined"}</span>
                      </span>
                      <label className="flex items-center gap-1">
                        Default value:
                        <input
                          className="w-32 rounded border border-slate-200 bg-white/80 px-1"
                          placeholder="(none)"
                          value={v.defaultValue ?? ""}
                          onChange={(e) => setVariables((vs) => vs.map((x, j) => (j === i ? { ...x, defaultValue: e.target.value } : x)))}
                        />
                      </label>
                    </div>
                  ) : (
                    <pre className="tp-scroll mt-1 max-h-32 overflow-auto rounded bg-white/70 p-1.5 font-mono text-[11px]">{v.code}</pre>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-500">Nothing added yet — click keys on the left.</p>
          )}

          <div className="mt-3 rounded-lg border border-dashed border-slate-300 p-2 text-xs">
            <p className="mb-1 font-medium text-slate-700">Add a ready-made Custom JavaScript variable</p>
            <div className="flex flex-wrap items-center gap-2">
              <select className="rounded border border-slate-200 bg-white/80 px-1 py-1" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                {CJS_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              <span className="text-slate-500">from</span>
              <select
                className="max-w-[200px] rounded border border-slate-200 bg-white/80 px-1 py-1"
                value={templateSource}
                onChange={(e) => setTemplateSource(e.target.value)}>
                {templateCandidates.length ? (
                  templateCandidates.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name}
                    </option>
                  ))
                ) : (
                  <option value="">{template.source === "array" ? "add an array variable (e.g. ecommerce.items) first" : "add a variable first"}</option>
                )}
              </select>
              <Button onClick={addTemplate} disabled={!templateCandidates.length}>
                <Plus size={13} /> Add
              </Button>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">{template.description}</p>
          </div>
        </Card>

        <Card title={`3 · Custom Event triggers (${triggers.length})`}>
          {eventNames.length ? (
            <div className="flex flex-wrap gap-2 text-xs">
              {eventNames.map((ev) => (
                <label key={ev} className="flex items-center gap-1 rounded-full border border-slate-200 bg-white/70 px-2 py-1">
                  <input type="checkbox" checked={triggers.some((t) => t.eventName === ev)} onChange={() => toggleTrigger(ev)} />
                  {ev}
                </label>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">No custom events captured yet.</p>
          )}
        </Card>

        <Card
          title="4 · Export to GTM"
          actions={
            <>
              <CopyButton text={JSON.stringify(exportJson, null, 2)} label="Copy JSON" />
              <Button variant="primary" disabled={!variables.length && !triggers.length} onClick={() => downloadJson("trackpro-gtm-import.json", exportJson)}>
                <Download size={13} /> Download
              </Button>
            </>
          }>
          <p className="text-xs text-slate-600">
            In GTM go to <b>Admin → Import Container</b>, choose this file, pick your workspace and select <b>Merge → Rename conflicting</b>. Your {variables.length} variable(s) and {triggers.length} trigger(s) are added without touching anything else.
          </p>
        </Card>
      </div>
    </div>
  )
}
