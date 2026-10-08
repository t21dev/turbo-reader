import { useEffect, useState } from "react"
import { disable as disableAutostart, enable as enableAutostart, isEnabled as autostartEnabled } from "@tauri-apps/plugin-autostart"
import { isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification"
import { api, type BackgroundPrefs as Prefs } from "@/lib/api"
import { isLinux, isMac } from "@/lib/platform"
import { cn } from "@/lib/utils"
import { KeepRunningOffer } from "@/components/KeepRunningOffer"

const NOTIFY: { value: Prefs["notify"]; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "all", label: "All feeds" },
  { value: "pinned", label: "Pinned" },
]

/**
 * How Turbo Reader runs when its window is closed: the tray, starting at
 * login, and notifications. Everything here is off until switched on. Used in
 * Settings and on the welcome screen, so a new reader can choose up front.
 */
export function BackgroundPrefs({ withAgents = false }: { withAgents?: boolean }) {
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [agents, setAgents] = useState<boolean | null>(null)
  const [atLogin, setAtLogin] = useState(false)
  // Start at login writes outside the Flatpak sandbox, so a Flatpak copy hides it.
  const [flatpak, setFlatpak] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    api.getBackground().then(setPrefs).catch(() => undefined)
    autostartEnabled().then(setAtLogin).catch(() => undefined)
    api.inFlatpak().then(setFlatpak).catch(() => undefined)
    if (withAgents) api.mcpStatus().then((s) => setAgents(s.config.enabled)).catch(() => undefined)
  }, [withAgents])

  async function setAgentAccess(on: boolean) {
    setNote(null)
    try {
      const s = await api.mcpStatus()
      const next = await api.mcpConfigure({ ...s.config, enabled: on })
      setAgents(next.config.enabled)
      if (next.error) setNote(next.error)
    } catch (err) {
      setNote(String(err))
    }
  }

  async function save(next: Prefs) {
    setNote(null)
    try {
      setPrefs(await api.setBackground(next))
    } catch (err) {
      setNote(String(err))
    }
  }

  async function setTray(on: boolean) {
    if (!prefs) return
    await save({ ...prefs, closeToTray: on })
  }

  async function setLogin(on: boolean) {
    setNote(null)
    try {
      if (on) await enableAutostart()
      else await disableAutostart()
      setAtLogin(await autostartEnabled())
    } catch (err) {
      setNote(`Could not change start at login: ${err}`)
    }
  }

  async function setNotify(mode: Prefs["notify"]) {
    if (!prefs) return
    if (mode !== "off") {
      // The system asks once; macOS will not show anything without this.
      let granted = await isPermissionGranted().catch(() => false)
      if (!granted) granted = (await requestPermission().catch(() => "denied")) === "granted"
      if (!granted) {
        setNote(
          isMac
            ? "Notifications are blocked. Allow them for Turbo Reader in System Settings > Notifications."
            : "Notifications are blocked for Turbo Reader in your system settings.",
        )
        return
      }
    }
    await save({ ...prefs, notify: mode })
  }

  return (
    <div className="space-y-3" data-background-prefs>
      <Row
        id="bg-tray"
        title="Keep running in the tray"
        detail={
          isLinux
            ? "Closing the window leaves Turbo Reader in the system tray, so it keeps refreshing. On GNOME the tray needs the AppIndicator extension."
            : `Closing the window leaves Turbo Reader in the ${isMac ? "menu bar" : "notification area"}, so it keeps refreshing.`
        }
      >
        <Switch on={!!prefs?.closeToTray} disabled={!prefs} labelledBy="bg-tray" onToggle={() => void setTray(!prefs?.closeToTray)} />
      </Row>

      {!flatpak && (
        <Row
          id="bg-login"
          title="Start at login"
          detail={
            prefs?.closeToTray
              ? "Opens quietly in the tray when you sign in."
              : "Opens when you sign in. Turn on the tray above to start it out of sight."
          }
        >
          <Switch on={atLogin} labelledBy="bg-login" onToggle={() => void setLogin(!atLogin)} />
        </Row>
      )}

      <Row
        id="bg-notify"
        title="New-article notifications"
        detail="After a refresh in the background, one notification naming the feeds with something new."
      >
        <div role="radiogroup" aria-labelledby="bg-notify" className="flex shrink-0 rounded-lg border border-border bg-background p-[2px]">
          {NOTIFY.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={prefs?.notify === o.value}
              disabled={!prefs}
              onClick={() => void setNotify(o.value)}
              className={cn(
                "h-7 rounded-md px-2 text-[11.5px] font-medium transition-colors duration-150",
                prefs?.notify === o.value ? "bg-elevated text-foreground" : "text-subtle hover:text-muted-foreground",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </Row>

      {withAgents && (
        <Row
          id="bg-agents"
          title="Let AI agents connect"
          detail="A local server so Claude Code, Codex and other agents can use your feeds as a news source. Make a key for each one in Settings > AI agents."
        >
          <Switch on={!!agents} disabled={agents === null} labelledBy="bg-agents" onToggle={() => void setAgentAccess(!agents)} />
        </Row>
      )}
      {withAgents && <KeepRunningOffer agentsOn={!!agents} prefs={prefs} onChange={setPrefs} />}

      {note && (
        <p role="alert" className="text-[11.5px] leading-relaxed text-destructive">
          {note}
        </p>
      )}
    </div>
  )
}

function Row({ id, title, detail, children }: { id: string; title: string; detail: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p id={id} className="text-[12.5px] font-medium text-foreground">
          {title}
        </p>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-subtle">{detail}</p>
      </div>
      {children}
    </div>
  )
}

function Switch({ on, disabled, labelledBy, onToggle }: { on: boolean; disabled?: boolean; labelledBy: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors duration-200 ease-out disabled:opacity-50",
        on ? "border-system bg-system" : "border-border bg-elevated",
      )}
    >
      <span
        className={cn(
          "absolute left-0.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full transition-transform duration-200 ease-out",
          on ? "translate-x-4 bg-background" : "translate-x-0 bg-muted-foreground",
        )}
      />
    </button>
  )
}
