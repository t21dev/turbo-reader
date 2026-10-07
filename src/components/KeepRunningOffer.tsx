import { useEffect, useState } from "react"
import { api, type BackgroundPrefs } from "@/lib/api"
import { isLinux, isMac } from "@/lib/platform"

const DISMISSED = "turbo-keep-running-offer-dismissed"

function dismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED) === "1"
  } catch {
    return false
  }
}

/**
 * Shown once AI agents are allowed in: agents reach the library through the
 * running app, so closing the window would cut them off. Offers to keep
 * Turbo Reader in the tray instead. Optional and quiet: nothing changes
 * unless the user says yes, and "Not now" is remembered.
 */
export function KeepRunningOffer({
  agentsOn,
  prefs: given,
  onChange,
}: {
  agentsOn: boolean
  /** The background settings, when the parent already has them. */
  prefs?: BackgroundPrefs | null
  /** Told when the offer turns the tray on, so the parent's switch follows. */
  onChange?: (prefs: BackgroundPrefs) => void
}) {
  const [own, setOwn] = useState<BackgroundPrefs | null>(null)
  const [hidden, setHidden] = useState(dismissed)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const prefs = given ?? own

  useEffect(() => {
    if (given === undefined && agentsOn) api.getBackground().then(setOwn).catch(() => undefined)
  }, [given, agentsOn])

  if (done) {
    return (
      <p role="status" className="text-[11.5px] text-subtle" data-keep-running-done>
        Turbo Reader will keep running in the {place()} when you close the window. Change it in
        Settings &gt; Background.
      </p>
    )
  }
  if (!agentsOn || hidden || !prefs || prefs.closeToTray) return null

  async function keepRunning() {
    if (!prefs) return
    setError(null)
    try {
      const next = await api.setBackground({ ...prefs, closeToTray: true })
      setOwn(next)
      onChange?.(next)
      setDone(true)
    } catch (err) {
      setError(String(err))
    }
  }

  function notNow() {
    try {
      localStorage.setItem(DISMISSED, "1")
    } catch {
      /* storage blocked: it hides for this session */
    }
    setHidden(true)
  }

  return (
    <div className="rounded-lg border border-border bg-elevated/40 px-3 py-2.5" data-keep-running-offer>
      <p className="text-[12px] font-medium text-foreground">Keep Turbo Reader running for your agents?</p>
      <p className="mt-0.5 text-[11.5px] leading-relaxed text-subtle">
        Agents can only reach your feeds while the app is running. With this on, closing the window
        leaves it in the {place()} instead of quitting.
      </p>
      <div className="mt-2 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => void keepRunning()}
          className="row h-7 bg-system px-2.5 text-[11.5px] font-medium text-background hover:opacity-90"
        >
          Keep running
        </button>
        <button
          type="button"
          onClick={notNow}
          className="row h-7 px-2.5 text-[11.5px] text-subtle hover:bg-secondary hover:text-foreground"
        >
          Not now
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-[11.5px] text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

function place(): string {
  return isMac ? "menu bar" : isLinux ? "system tray" : "notification area"
}
