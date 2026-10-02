import { useSyncExternalStore } from "react"
import { getCurrentWebview } from "@tauri-apps/api/webview"

export const UI_SCALES = [
  { value: 0.9, label: "Compact" },
  { value: 1, label: "Default" },
  { value: 1.15, label: "Large" },
  { value: 1.3, label: "Larger" },
] as const

export type UiScale = (typeof UI_SCALES)[number]["value"]

const KEY = "turbo-ui-scale"

function read(): UiScale {
  const n = Number(localStorage.getItem(KEY))
  const match = UI_SCALES.find((s) => s.value === n)
  return match ? match.value : 1
}

let scale: UiScale = read()
const listeners = new Set<() => void>()

/** Zooming the webview scales every length at once, which is what the request
    actually is: one knob for the whole interface, not a font-size slider. */
function apply(next: UiScale) {
  getCurrentWebview()
    .setZoom(next)
    .catch(() => undefined)
}

export function setScale(next: UiScale) {
  if (next === scale) return
  scale = next
  try {
    localStorage.setItem(KEY, String(next))
  } catch {
    /* storage blocked */
  }
  apply(next)
  listeners.forEach((fn) => fn())
}

export function stepScale(direction: 1 | -1) {
  const i = UI_SCALES.findIndex((s) => s.value === scale)
  const next = UI_SCALES[Math.min(UI_SCALES.length - 1, Math.max(0, i + direction))]
  setScale(next.value)
}

export function useScale(): UiScale {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => scale,
  )
}

/** Restore the stored zoom at startup, and wire Ctrl/Cmd + = / - / 0. */
export function installScale() {
  if (scale !== 1) apply(scale)
  const onKey = (e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return
    if (e.key === "=" || e.key === "+") {
      e.preventDefault()
      stepScale(1)
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault()
      stepScale(-1)
    } else if (e.key === "0") {
      e.preventDefault()
      setScale(1)
    }
  }
  window.addEventListener("keydown", onKey)
  return () => window.removeEventListener("keydown", onKey)
}
