import { useCallback, useEffect, useState } from "react"

import { TARGET_TAB_KEY, type TargetTab } from "~lib/types"

/** Live value of a chrome.storage key (session or local). */
export function useStorageValue<T>(area: "session" | "local", key: string | null, fallback: T): T {
  const [value, setValue] = useState<T>(fallback)
  useEffect(() => {
    if (!key) {
      setValue(fallback)
      return
    }
    let cancelled = false
    chrome.storage[area].get(key).then((res) => {
      if (!cancelled) setValue((res[key] as T) ?? fallback)
    })
    const listener = (changes: Record<string, chrome.storage.StorageChange>, changedArea: string) => {
      if (changedArea === area && key in changes) setValue((changes[key].newValue as T) ?? fallback)
    }
    chrome.storage.onChanged.addListener(listener)
    return () => {
      cancelled = true
      chrome.storage.onChanged.removeListener(listener)
    }
    // fallback is intentionally not a dependency (callers pass literals)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area, key])
  return value
}

/** The tab being inspected; follows it as it navigates. */
export function useTargetTab() {
  const target = useStorageValue<TargetTab | null>("local", TARGET_TAB_KEY, null)

  const setTarget = useCallback(async (tab: chrome.tabs.Tab) => {
    if (!tab.id || !tab.url) return
    await chrome.storage.local.set({
      [TARGET_TAB_KEY]: { tabId: tab.id, origin: new URL(tab.url).origin, url: tab.url, title: tab.title }
    })
  }, [])

  useEffect(() => {
    if (!target) return
    const onUpdated = (tabId: number, info: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      if (tabId !== target.tabId || !tab.url) return
      if ((info.url && info.url !== target.url) || (info.title && info.title !== target.title)) setTarget(tab)
    }
    chrome.tabs.onUpdated.addListener(onUpdated)
    return () => chrome.tabs.onUpdated.removeListener(onUpdated)
  }, [target, setTarget])

  return { target, setTarget }
}

export function formatTime(ts: number) {
  const d = new Date(ts)
  return `${d.toLocaleTimeString([], { hour12: false })}.${String(d.getMilliseconds()).padStart(3, "0")}`
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement("textarea")
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand("copy")
    ta.remove()
    return ok
  }
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
