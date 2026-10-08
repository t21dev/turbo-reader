import { useEffect, useState } from "react"
import { save as saveDialog } from "@tauri-apps/plugin-dialog"
import { api, type SkillTarget } from "@/lib/api"
import { cn } from "@/lib/utils"

/** Told when a copy is installed, updated or removed, so the bell can recount. */
export const SKILLS_CHANGED = "turbo-skills-changed"

/**
 * The Turbo Reader skill: a SKILL.md that teaches an agent when to use the
 * MCP tools and how. Installed per agent on request, or saved anywhere for
 * agents that keep skills elsewhere. Each copy checks itself against the app
 * through get_skill, and the bell flags an old copy the app installed.
 */
export function SkillSettings() {
  const [targets, setTargets] = useState<SkillTarget[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null)
  const version = targets[0]?.current

  useEffect(() => {
    api.skillStatus().then(setTargets).catch(() => undefined)
  }, [])

  async function act(id: string, work: () => Promise<SkillTarget[]>, done: string) {
    setBusy(id)
    setNote(null)
    try {
      setTargets(await work())
      setNote({ text: done, error: false })
      window.dispatchEvent(new Event(SKILLS_CHANGED))
    } catch (err) {
      setNote({ text: String(err), error: true })
    } finally {
      setBusy(null)
    }
  }

  async function saveCopy() {
    setNote(null)
    try {
      const path = await saveDialog({
        defaultPath: "SKILL.md",
        filters: [{ name: "Markdown", extensions: ["md"] }],
      })
      if (!path) return
      await api.writeTextFile(path, await api.skillContent())
      setNote({ text: "Skill saved", error: false })
    } catch (err) {
      setNote({ text: String(err), error: true })
    }
  }

  return (
    <div data-skill-settings>
      <div className="flex items-center gap-2">
        <p className="text-[12.5px] font-medium text-foreground">Skill</p>
        {version && (
          <span className="rounded-md bg-elevated px-1.5 py-0.5 font-mono text-[10.5px] text-subtle" data-skill-version>
            v{version}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-[11.5px] leading-relaxed text-subtle">
        A SKILL.md that teaches an agent when to reach for your feeds and how to use the tools well. It
        checks itself against this app through the server, so an old copy updates itself.
      </p>

      <ul className="mt-2.5 space-y-1.5">
        {targets.map((t) => {
          const state = !t.installed
            ? t.detected
              ? "Not installed"
              : "Not found on this computer"
            : t.outdated
              ? `Update available: ${t.installed === "0" ? "an old copy" : `v${t.installed}`} → v${t.current}`
              : `Installed · v${t.installed}`
          return (
            <li
              key={t.id}
              className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
              data-skill-target={t.id}
            >
              <div className="min-w-0 flex-1">
                <p className="text-[12px] text-foreground">{t.label}</p>
                <p
                  className={cn("truncate text-[11px]", t.outdated ? "text-system" : "text-subtle")}
                  title={t.path}
                  data-skill-state
                >
                  {state}
                </p>
              </div>
              {(!t.installed || t.outdated) && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    void act(t.id, () => api.skillInstall(t.id), t.installed ? `Updated for ${t.label}` : `Installed for ${t.label}`)
                  }
                  className="row h-7 shrink-0 bg-elevated px-2.5 text-[11.5px] font-medium text-foreground hover:bg-secondary disabled:opacity-50"
                >
                  {t.installed ? "Update" : "Install"}
                </button>
              )}
              {t.installed && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void act(t.id, () => api.skillRemove(t.id), `Removed from ${t.label}`)}
                  className="row h-7 shrink-0 px-2 text-[11.5px] text-subtle hover:bg-secondary hover:text-destructive disabled:opacity-50"
                >
                  Remove
                </button>
              )}
            </li>
          )
        })}
      </ul>

      <button
        type="button"
        onClick={() => void saveCopy()}
        className="mt-2 text-[11.5px] text-subtle underline-offset-2 hover:text-foreground hover:underline"
      >
        {targets.length ? "Save SKILL.md for another agent…" : "Save SKILL.md…"}
      </button>

      {note && (
        <p
          role={note.error ? "alert" : "status"}
          className={cn("mt-1.5 text-[11.5px]", note.error ? "text-destructive" : "text-subtle")}
        >
          {note.text}
        </p>
      )}
    </div>
  )
}
