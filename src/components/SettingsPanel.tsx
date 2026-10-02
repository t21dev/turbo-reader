import { useEffect, useState } from "react"
import { X, Download, Upload, Monitor, Sun, Moon } from "lucide-react"
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog"
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs"
import { api, type Stats } from "@/lib/api"
import { ACCENTS, useTheme, type AccentKey, type Mode } from "@/lib/theme"
import { cn } from "@/lib/utils"

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border px-5 py-5 first:border-t-0">
      <h3 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-subtle">
        {title}
      </h3>
      {children}
    </section>
  )
}

export function SettingsPanel({
  onClose,
  onImported,
}: {
  onClose: () => void
  onImported: () => void
}) {
  const { mode, setMode, accent, setAccent, density, setDensity } = useTheme()
  const [stats, setStats] = useState<Stats | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    api.stats().then(setStats).catch(() => undefined)
  }, [])

  async function importOpml() {
    const path = await openDialog({
      multiple: false,
      filters: [{ name: "OPML", extensions: ["opml", "xml"] }],
    })
    if (typeof path !== "string") return
    setBusy("import")
    try {
      const xml = await readTextFile(path)
      const added = await api.importOpml(xml)
      setNote(`Imported ${added} feed${added === 1 ? "" : "s"}.`)
      onImported()
    } catch (err) {
      setNote(String(err))
    } finally {
      setBusy(null)
    }
  }

  async function exportOpml() {
    const path = await saveDialog({
      defaultPath: "turbo-reader-feeds.opml",
      filters: [{ name: "OPML", extensions: ["opml"] }],
    })
    if (!path) return
    setBusy("export")
    try {
      await writeTextFile(path, await api.exportOpml())
      setNote("Exported.")
    } catch (err) {
      setNote(String(err))
    } finally {
      setBusy(null)
    }
  }

  const modes: { key: Mode; label: string; icon: React.ReactNode }[] = [
    { key: "light", label: "Light", icon: <Sun size={13} /> },
    { key: "dark", label: "Dark", icon: <Moon size={13} /> },
    { key: "system", label: "System", icon: <Monitor size={13} /> },
  ]

  return (
    <div className="absolute inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="h-full w-[380px] overflow-y-auto border-l border-border bg-popover shadow-float"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-[14px] font-semibold tracking-tight">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="row grid h-7 w-7 place-items-center text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X size={14} />
          </button>
        </div>

        <Section title="Appearance">
          <div className="grid grid-cols-3 gap-1.5">
            {modes.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                className={cn(
                  "row flex h-9 items-center justify-center gap-1.5 border text-[12px]",
                  mode === m.key
                    ? "border-system bg-elevated text-foreground"
                    : "border-border text-muted-foreground hover:bg-secondary",
                )}
              >
                {m.icon}
                {m.label}
              </button>
            ))}
          </div>

          <p className="mb-2 mt-5 text-[12px] text-muted-foreground">Accent</p>
          <div className="grid grid-cols-7 gap-1.5">
            {(Object.keys(ACCENTS) as AccentKey[]).map((key) => (
              <button
                key={key}
                type="button"
                title={ACCENTS[key].label}
                onClick={() => setAccent(key)}
                className={cn(
                  "h-7 rounded-md border-2 transition-colors",
                  accent === key ? "border-foreground" : "border-transparent",
                )}
                style={{ background: `hsl(${ACCENTS[key].dark})` }}
              />
            ))}
          </div>

          <p className="mb-2 mt-5 text-[12px] text-muted-foreground">Density</p>
          <div className="grid grid-cols-2 gap-1.5">
            {(["comfortable", "compact"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDensity(d)}
                className={cn(
                  "row h-9 border text-[12px] capitalize",
                  density === d
                    ? "border-system bg-elevated text-foreground"
                    : "border-border text-muted-foreground hover:bg-secondary",
                )}
              >
                {d}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Feeds">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={importOpml}
              disabled={busy !== null}
              className="row flex h-9 items-center justify-center gap-2 border border-border text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
            >
              <Upload size={13} />
              Import OPML
            </button>
            <button
              type="button"
              onClick={exportOpml}
              disabled={busy !== null}
              className="row flex h-9 items-center justify-center gap-2 border border-border text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
            >
              <Download size={13} />
              Export OPML
            </button>
          </div>
          {note && <p className="mt-2 text-[11px] text-subtle">{note}</p>}
        </Section>

        {stats && (
          <Section title="Library">
            <dl className="grid grid-cols-2 gap-y-2 text-[12px]">
              {[
                ["Feeds", stats.sources.toLocaleString()],
                ["Articles", stats.items.toLocaleString()],
                ["Unread", stats.unread.toLocaleString()],
                ["Starred", stats.starred.toLocaleString()],
                ["Database", `${(stats.dbBytes / 1024 / 1024).toFixed(1)} MB`],
              ].map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="tabular text-right text-foreground">{v}</dd>
                </div>
              ))}
            </dl>
          </Section>
        )}

        <Section title="About">
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Turbo Reader {" "}
            <span className="tabular text-subtle">v0.1.0</span>
          </p>
          <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
            Feature design, the OPML conventions and the data model owe a great deal to{" "}
            <span className="text-foreground">Fluent Reader</span> by Haoyuan Liu, released
            under the BSD-3-Clause licence. Turbo Reader is an independent implementation.
          </p>
        </Section>
      </div>
    </div>
  )
}
