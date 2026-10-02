import { useEffect, useState } from "react"
import type { BandLayout, HomeWindow } from "@/lib/api"

/** What the home page shows, and in what order. All of it the reader's call. */
export type HomePrefs = {
  enabled: boolean
  window: HomeWindow
  /** The line under the date. */
  masthead: "off" | "quote" | "headline"
  clock: boolean
  seconds: boolean
  perBand: number
  bands: { glance: boolean; search: boolean; pinned: boolean; categories: boolean }
  /** Group ids the reader has switched off, as strings so they survive JSON. */
  hiddenGroups: string[]
  interests: string
  mutes: string
}

export const HOME_DEFAULTS: HomePrefs = {
  enabled: true,
  window: "today",
  masthead: "quote",
  clock: true,
  seconds: false,
  perBand: 8,
  bands: { glance: true, search: true, pinned: true, categories: true },
  hiddenGroups: [],
  interests: "",
  mutes: "",
}

const KEY = "turbo-home"

export function readHomePrefs(): HomePrefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return HOME_DEFAULTS
    const o = JSON.parse(raw) as Partial<HomePrefs>
    return {
      ...HOME_DEFAULTS,
      ...o,
      bands: { ...HOME_DEFAULTS.bands, ...(o.bands ?? {}) },
      hiddenGroups: Array.isArray(o.hiddenGroups) ? o.hiddenGroups.map(String) : [],
      perBand: [4, 8, 12].includes(o.perBand as number) ? o.perBand! : HOME_DEFAULTS.perBand,
    }
  } catch {
    return HOME_DEFAULTS
  }
}

export function writeHomePrefs(prefs: HomePrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    /* storage blocked */
  }
}

/** A clock that ticks no more often than it has to. */
export function useNow(seconds: boolean, enabled: boolean): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (!enabled) return
    let timer = 0
    const tick = () => {
      const d = new Date()
      setNow(d)
      // Line the next tick up with the boundary rather than drifting a little
      // further out every minute.
      const ms = seconds
        ? 1000 - d.getMilliseconds()
        : (60 - d.getSeconds()) * 1000 - d.getMilliseconds()
      timer = window.setTimeout(tick, Math.max(250, ms))
    }
    tick()
    return () => window.clearTimeout(timer)
  }, [seconds, enabled])
  return now
}

export const LAYOUTS: { value: BandLayout; label: string }[] = [
  { value: "cards", label: "Cards" },
  { value: "compact", label: "Compact" },
  { value: "headlines", label: "Headlines" },
]

export const WINDOWS: { value: HomeWindow; label: string; countKey: "today" | "week" | "month" }[] =
  [
    { value: "today", label: "Today", countKey: "today" },
    { value: "week", label: "This week", countKey: "week" },
    { value: "month", label: "This month", countKey: "month" },
  ]
