import { useEffect, useState } from "react"
import { getVersion } from "@tauri-apps/api/app"
import { api, type UpdateCheck } from "@/lib/api"

const KEY = "turbo-update-check"
const EVENT = "turbo-update-checked"
/** After launch, so the check never competes with startup. */
const DELAY_MS = 8000

type Saved = { at: number; latest: string | null; url: string }

function read(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Saved) : null
  } catch {
    return null
  }
}

/** Remember a check, automatic or manual, and tell anything showing it. */
export function recordUpdateCheck(result: UpdateCheck) {
  const saved: Saved = { at: Date.now(), latest: result.latest, url: result.url }
  try {
    localStorage.setItem(KEY, JSON.stringify(saved))
  } catch {
    /* storage blocked: it still shows for this session */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: saved }))
}

/** Same rule as the backend: numeric segments, a pre-release never newer. */
function isNewer(latest: string, current: string): boolean {
  const parts = (v: string) => v.split(".").map((s) => parseInt(s, 10) || 0)
  const [a, b] = [parts(latest), parts(current)]
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0)
  }
  return false
}

/**
 * A newer release, if there is one: checked quietly at every launch while
 * `enabled` (the setting in Settings > Updates), and refreshed by the manual
 * check there. Compared with the running version, so it disappears once you
 * have updated.
 */
export function useUpdateCheck(enabled: boolean): { latest: string; url: string } | null {
  const [saved, setSaved] = useState<Saved | null>(read)
  const [current, setCurrent] = useState<string | null>(null)

  useEffect(() => {
    getVersion().then(setCurrent).catch(() => undefined)
    const onChecked = (e: Event) => setSaved((e as CustomEvent<Saved>).detail)
    window.addEventListener(EVENT, onChecked)
    return () => window.removeEventListener(EVENT, onChecked)
  }, [])

  useEffect(() => {
    if (!enabled) return
    const timer = window.setTimeout(() => {
      api
        .checkForUpdates()
        .then(recordUpdateCheck)
        // Offline or rate-limited: say nothing, try again next launch.
        .catch(() => undefined)
    }, DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [enabled])

  if (!enabled || !saved?.latest || !current || !isNewer(saved.latest, current)) return null
  return { latest: saved.latest, url: saved.url }
}
