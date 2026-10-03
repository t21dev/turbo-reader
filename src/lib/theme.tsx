import { createContext, useContext, useEffect, useMemo, useState } from "react"

export type Mode = "light" | "dark" | "system"

/** Accents are stored as HSL triples so they drop straight into the tokens. */
export const ACCENTS = {
  blue: { label: "Blue", dark: "215 90% 68%", light: "215 78% 50%" },
  violet: { label: "Violet", dark: "262 83% 72%", light: "262 72% 52%" },
  teal: { label: "Teal", dark: "172 66% 55%", light: "173 70% 36%" },
  green: { label: "Green", dark: "152 52% 54%", light: "152 62% 36%" },
  amber: { label: "Amber", dark: "38 92% 60%", light: "32 92% 44%" },
  rose: { label: "Rose", dark: "347 85% 70%", light: "347 72% 50%" },
  mono: { label: "Mono", dark: "0 0% 78%", light: "0 0% 28%" },
} as const

export type AccentKey = keyof typeof ACCENTS
/** A preset, or the reader's own colour from `customAccent`. */
export type Accent = AccentKey | "custom"

export const DEFAULT_CUSTOM_ACCENT = "#4f8ff7"

/** "#abc" or "#aabbcc", with or without the hash, as "#aabbcc"; otherwise null. */
export function normalizeHex(input: string): string | null {
  const m = input.trim().replace(/^#/, "").toLowerCase()
  if (/^[0-9a-f]{6}$/.test(m)) return `#${m}`
  if (/^[0-9a-f]{3}$/.test(m)) return `#${[...m].map((c) => c + c).join("")}`
  return null
}

/** Hex to an HSL triple, the shape the tokens take. */
export function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  let h = 0
  let s = 0
  if (d > 0) {
    s = d / (1 - Math.abs(2 * l - 1))
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)]
}

/** The accent as tokens want it. A custom colour keeps its hue and
    saturation, but its lightness is held to a band that stays readable on
    the background, so near-black on dark or near-white on light still works. */
export function accentHsl(accent: Accent, custom: string, resolved: "light" | "dark"): string {
  if (accent !== "custom") return ACCENTS[accent][resolved]
  const [h, s, l] = hexToHsl(normalizeHex(custom) ?? DEFAULT_CUSTOM_ACCENT)
  const [lo, hi] = resolved === "dark" ? [55, 82] : [28, 52]
  return `${h} ${s}% ${Math.min(hi, Math.max(lo, l))}%`
}
export type Density = "comfortable" | "compact"
export type ReaderFont = "sans" | "serif" | "mono"
export type Direction = "ltr" | "rtl"

export const READER_FONTS: { key: ReaderFont; label: string; stack: string }[] = [
  { key: "sans", label: "Geist", stack: '"Geist Variable", ui-sans-serif, system-ui, sans-serif' },
  { key: "serif", label: "Serif", stack: 'Georgia, "Iowan Old Style", "Times New Roman", serif' },
  { key: "mono", label: "Mono", stack: '"Geist Mono Variable", ui-monospace, monospace' },
]

/** Article body sizes, in rem. The UI chrome is scaled separately by zoom. */
export const READER_SIZES = [0.86, 0.94, 1.02, 1.12, 1.24] as const
export const LINE_WIDTHS = { narrow: 58, normal: 68, wide: 84 } as const
export type LineWidth = keyof typeof LINE_WIDTHS

export type Prefs = {
  mode: Mode
  accent: Accent
  /** The colour picked for the custom accent, kept even while a preset is on. */
  customAccent: string
  density: Density
  font: ReaderFont
  fontSize: number
  lineWidth: LineWidth
  direction: Direction
  animations: boolean
}

const DEFAULTS: Prefs = {
  mode: "system",
  accent: "blue",
  customAccent: DEFAULT_CUSTOM_ACCENT,
  density: "comfortable",
  font: "sans",
  fontSize: 0.94,
  lineWidth: "normal",
  direction: "ltr",
  animations: true,
}

type ThemeState = Prefs & {
  set: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void
  reset: () => void
  resolved: "light" | "dark"
}

const Ctx = createContext<ThemeState | null>(null)
const KEY = "turbo-theme"

function readStored(): Prefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    const o = JSON.parse(raw) as Partial<Prefs>
    return {
      mode: o.mode ?? DEFAULTS.mode,
      accent:
        o.accent === "custom" || (o.accent && o.accent in ACCENTS) ? o.accent : DEFAULTS.accent,
      customAccent: normalizeHex(o.customAccent ?? "") ?? DEFAULTS.customAccent,
      density: o.density === "compact" ? "compact" : "comfortable",
      font: READER_FONTS.some((f) => f.key === o.font) ? o.font! : DEFAULTS.font,
      fontSize: READER_SIZES.includes(o.fontSize as never) ? o.fontSize! : DEFAULTS.fontSize,
      lineWidth: o.lineWidth && o.lineWidth in LINE_WIDTHS ? o.lineWidth : DEFAULTS.lineWidth,
      direction: o.direction === "rtl" ? "rtl" : "ltr",
      animations: o.animations !== false,
    }
  } catch {
    return DEFAULTS
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(readStored)
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  )

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = (ev: MediaQueryListEvent) => setSystemDark(ev.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  const resolved: "light" | "dark" =
    prefs.mode === "system" ? (systemDark ? "dark" : "light") : prefs.mode

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle("dark", resolved === "dark")
    root.dataset.density = prefs.density
    root.dataset.motion = prefs.animations ? "full" : "none"

    const hsl = accentHsl(prefs.accent, prefs.customAccent, resolved)
    root.style.setProperty("--system", hsl)
    root.style.setProperty("--unread", hsl)
    root.style.setProperty("--ring", hsl)

    const font = READER_FONTS.find((f) => f.key === prefs.font) ?? READER_FONTS[0]
    root.style.setProperty("--reader-font", font.stack)
    root.style.setProperty("--reader-size", `${prefs.fontSize}rem`)
    root.style.setProperty("--reader-width", `${LINE_WIDTHS[prefs.lineWidth]}ch`)
    root.style.setProperty("--reader-dir", prefs.direction)

    try {
      localStorage.setItem(KEY, JSON.stringify(prefs))
    } catch {
      /* storage blocked */
    }
  }, [prefs, resolved])

  const value = useMemo<ThemeState>(
    () => ({
      ...prefs,
      resolved,
      set: (key, v) => setPrefs((p) => ({ ...p, [key]: v })),
      reset: () => setPrefs(DEFAULTS),
    }),
    [prefs, resolved],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTheme() {
  const v = useContext(Ctx)
  if (!v) throw new Error("useTheme must be used inside ThemeProvider")
  return v
}
