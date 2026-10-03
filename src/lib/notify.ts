import { useSyncExternalStore } from "react"

/**
 * App-wide messages.
 *
 * Most actions used to be `void api.something()` with no catch, so a failure
 * looked exactly like success: you moved a feed, nothing happened, and nothing
 * said why. Anything that can fail now reports here.
 */

export type Toast = {
  id: number
  kind: "error" | "info"
  text: string
}

let toasts: Toast[] = []
let next = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

export function notify(text: string, kind: Toast["kind"] = "info", ms = kind === "error" ? 6000 : 2600) {
  const id = next++
  toasts = [...toasts.slice(-2), { id, kind, text }]
  emit()
  window.setTimeout(() => dismissToast(id), ms)
  return id
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

/** The message an invoke rejection carries, without the plumbing around it. */
export function reason(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err)
  return text.replace(/^Error:\s*/, "").trim() || "Something went wrong."
}

/** Run an action, reporting its failure instead of swallowing it. */
export async function attempt<T>(what: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn()
  } catch (err) {
    notify(`${what} failed: ${reason(err)}`, "error")
    return undefined
  }
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => toasts,
  )
}
