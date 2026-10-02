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

type ThemeState = {
  mode: Mode
  accent: AccentKey
  density: "comfortable" | "compact"
  setMode: (m: Mode) => void
  setAccent: (a: AccentKey) => void
  setDensity: (d: "comfortable" | "compact") => void
  resolved: "light" | "dark"
}

const Ctx = createContext<ThemeState | null>(null)
const KEY = "turbo-theme"

function readStored(): { mode: Mode; accent: AccentKey; density: "comfortable" | "compact" } {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const o = JSON.parse(raw)
      return {
        mode: (o.mode as Mode) ?? "system",
        accent: (o.accent as AccentKey) ?? "blue",
        density: o.density === "compact" ? "compact" : "comfortable",
      }
    }
  } catch {
    /* first run, or storage blocked */
  }
  return { mode: "system", accent: "blue", density: "comfortable" }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const initial = readStored()
  const [mode, setMode] = useState<Mode>(initial.mode)
  const [accent, setAccent] = useState<AccentKey>(initial.accent)
  const [density, setDensity] = useState(initial.density)
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  )

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  const resolved: "light" | "dark" = mode === "system" ? (systemDark ? "dark" : "light") : mode

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle("dark", resolved === "dark")
    root.dataset.density = density
    const hsl = ACCENTS[accent][resolved]
    root.style.setProperty("--system", hsl)
    root.style.setProperty("--unread", hsl)
    root.style.setProperty("--ring", hsl)
    localStorage.setItem(KEY, JSON.stringify({ mode, accent, density }))
  }, [resolved, accent, density, mode])

  const value = useMemo<ThemeState>(
    () => ({ mode, accent, density, setMode, setAccent, setDensity, resolved }),
    [mode, accent, density, resolved],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTheme() {
  const v = useContext(Ctx)
  if (!v) throw new Error("useTheme must be used inside ThemeProvider")
  return v
}
