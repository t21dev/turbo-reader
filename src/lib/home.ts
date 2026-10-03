import { useEffect, useState } from "react"
import type { BandLayout, HomeWindow } from "@/lib/api"

export type Section = "glance" | "search" | "pinned" | "categories"
export type CardSize = "small" | "medium" | "large"

export const SECTIONS: { key: Section; label: string }[] = [
  { key: "glance", label: "Glance" },
  { key: "search", label: "Search" },
  { key: "pinned", label: "Pinned" },
  { key: "categories", label: "Categories" },
]

/** What the home page shows, and in what order. All of it the reader's call. */
export type HomePrefs = {
  enabled: boolean
  window: HomeWindow
  /** The line under the date. */
  masthead: "off" | "quote" | "headline"
  clock: boolean
  seconds: boolean
  perBand: number
  bands: {
    glance: boolean
    search: boolean
    pinned: boolean
    categories: boolean
  }
  /** The order sections appear in under the date. */
  order: Section[]
  /** Category order on home only, as group ids ("none" is Ungrouped). Any
      category not listed keeps its sidebar order, after the listed ones. */
  groupOrder: string[]
  /** How wide cards are in the card, mosaic and compact layouts. */
  cardSize: CardSize
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
  order: SECTIONS.map((s) => s.key),
  groupOrder: [],
  cardSize: "medium",
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
      order: cleanOrder(o.order),
      groupOrder: Array.isArray(o.groupOrder) ? o.groupOrder.map(String) : [],
      cardSize: (["small", "medium", "large"] as const).includes(o.cardSize as CardSize)
        ? o.cardSize!
        : HOME_DEFAULTS.cardSize,
      perBand: [4, 8, 12].includes(o.perBand as number) ? o.perBand! : HOME_DEFAULTS.perBand,
    }
  } catch {
    return HOME_DEFAULTS
  }
}

/** A saved order with anything unknown dropped and anything missing added at
    the end, so a section added in a later version still shows up. */
function cleanOrder(raw: unknown): Section[] {
  const known = SECTIONS.map((s) => s.key)
  const kept = Array.isArray(raw) ? raw.filter((k): k is Section => known.includes(k)) : []
  const unique = [...new Set(kept)]
  return [...unique, ...known.filter((k) => !unique.includes(k))]
}

/** Sort by a saved order of keys. Unlisted entries keep their relative order
    and go after the listed ones. */
export function ordered<T>(list: T[], key: (t: T) => string, order: string[]): T[] {
  const rank = (t: T) => {
    const i = order.indexOf(key(t))
    return i === -1 ? order.length : i
  }
  return list
    .map((t, i) => ({ t, i }))
    .sort((a, b) => rank(a.t) - rank(b.t) || a.i - b.i)
    .map((x) => x.t)
}

/** The list with one key swapped one place up (-1) or down (1). */
export function moved(list: string[], key: string, by: -1 | 1): string[] {
  const i = list.indexOf(key)
  const j = i + by
  if (i === -1 || j < 0 || j >= list.length) return list
  const next = [...list]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

/** Smallest card width in pixels for each layout at each size. */
export const CARD_WIDTH: Record<CardSize, { cards: number; mosaic: number; compact: number }> = {
  small: { cards: 190, mosaic: 170, compact: 160 },
  medium: { cards: 240, mosaic: 210, compact: 190 },
  large: { cards: 320, mosaic: 280, compact: 250 },
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

export const LAYOUTS: { value: BandLayout; label: string; hint: string }[] = [
  { value: "cards", label: "Cards", hint: "Cover art, four across" },
  {
    value: "mosaic",
    label: "Mosaic",
    hint: "One lead tile, the rest around it",
  },
  {
    value: "magazine",
    label: "Magazine",
    hint: "One story given room, headlines beside it",
  },
  { value: "compact", label: "Compact", hint: "Small cards, no cover art" },
  {
    value: "headlines",
    label: "Headlines",
    hint: "A numbered list, the densest option",
  },
]

export const WINDOWS: {
  value: HomeWindow
  label: string
  countKey: "today" | "week" | "month"
}[] = [
  { value: "today", label: "Today", countKey: "today" },
  { value: "week", label: "This week", countKey: "week" },
  { value: "month", label: "This month", countKey: "month" },
]
