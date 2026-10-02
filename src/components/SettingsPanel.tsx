import { useEffect, useState } from "react"
import {
  X,
  Download,
  Upload,
  Monitor,
  Sun,
  Moon,
  RotateCcw,
  RefreshCw,
  CheckCircle2,
  ArrowUpCircle,
} from "lucide-react"
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog"
import { openUrl } from "@tauri-apps/plugin-opener"
import { api, type Stats, type UpdateCheck } from "@/lib/api"
import {
  ACCENTS,
  LINE_WIDTHS,
  READER_FONTS,
  READER_SIZES,
  useTheme,
  type AccentKey,
  type Mode,
} from "@/lib/theme"
import { UI_SCALES, setScale, useScale } from "@/lib/scale"
import { useDismissible } from "@/lib/presence"
import { cn } from "@/lib/utils"

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border px-5 py-5 first:border-t-0">
      <h3 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-subtle">{title}</h3>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 first:mt-0">
      <p className="mb-2 text-[12px] text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}

/** A segmented control. One shape for every either/or setting in here. */
function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: React.ReactNode; title?: string; style?: React.CSSProperties }[]
  onChange: (v: T) => void
}) {
  return (
    <div
      role="radiogroup"
      className="grid gap-0.5 rounded-lg border border-border bg-background p-[3px]"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          style={o.style}
          className={cn(
            "flex h-8 items-center justify-center gap-1.5 rounded-md px-2 text-[12px] font-medium leading-none",
            "transition-[background-color,color,transform] duration-200 ease-out active:scale-[0.96]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            value === o.value
              ? "bg-elevated text-foreground"
              : "text-subtle hover:text-muted-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function SettingsPanel({
  onClose,
  onImported,
}: {
  onClose: () => void
  onImported: () => void
}) {
  const theme = useTheme()
  const scale = useScale()
  const [stats, setStats] = useState<Stats | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [update, setUpdate] = useState<UpdateCheck | null>(null)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const { closing, dismiss } = useDismissible(onClose, 180)

  useEffect(() => {
    api.stats().then(setStats).catch(() => undefined)
  }, [])

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => ev.key === "Escape" && dismiss()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [dismiss])

  async function importOpml() {
    const path = await openDialog({
      multiple: false,
      filters: [{ name: "OPML", extensions: ["opml", "xml"] }],
    })
    if (typeof path !== "string") return
    setBusy("import")
    try {
      const added = await api.importOpml(await api.readTextFile(path))
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
      await api.writeTextFile(path, await api.exportOpml())
      setNote("Exported.")
    } catch (err) {
      setNote(String(err))
    } finally {
      setBusy(null)
    }
  }

  const modes: { value: Mode; label: React.ReactNode }[] = [
    { value: "light", label: <><Sun size={13} /> Light</> },
    { value: "dark", label: <><Moon size={13} /> Dark</> },
    { value: "system", label: <><Monitor size={13} /> System</> },
  ]

  const activeScale = UI_SCALES.find((s) => s.value === scale) ?? UI_SCALES[1]

  async function checkUpdates() {
    setChecking(true)
    setUpdateError(null)
    try {
      setUpdate(await api.checkForUpdates())
    } catch (err) {
      setUpdateError(String(err))
    } finally {
      setChecking(false)
    }
  }

  return (
    <div
      className={cn(
        "absolute inset-0 z-50 flex justify-end bg-black/40",
        closing ? "animate-fade-out" : "animate-fade",
      )}
      onClick={dismiss}
    >
      <div
        className={cn(
          "h-full w-[380px] overflow-y-auto border-l border-border bg-popover shadow-float",
          closing ? "animate-slide-out" : "animate-slide-in",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-popover/90 px-5 py-4 backdrop-blur">
          <h2 className="text-[14px] font-semibold tracking-tight">Settings</h2>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={theme.reset}
              title="Reset appearance to defaults"
              className="row grid h-7 w-7 place-items-center text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <RotateCcw size={13} />
            </button>
            <button
              type="button"
              onClick={dismiss}
              title="Close (Esc)"
              className="row grid h-7 w-7 place-items-center text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        <Section title="Appearance">
          <Field label="Theme">
            <Segmented
              value={theme.mode}
              options={modes}
              onChange={(v) => theme.set("mode", v)}
            />
          </Field>

          <Field label="Accent">
            <div className="grid grid-cols-7 gap-1.5">
              {(Object.keys(ACCENTS) as AccentKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  title={ACCENTS[key].label}
                  onClick={() => theme.set("accent", key)}
                  className={cn(
                    "h-7 rounded-md border-2 transition-[border-color,transform] duration-200 ease-out active:scale-[0.94]",
                    theme.accent === key ? "border-foreground" : "border-transparent",
                  )}
                  style={{ background: `hsl(${ACCENTS[key][theme.resolved]})` }}
                />
              ))}
            </div>
          </Field>

          <Field label={`Interface size · ${activeScale.label} ${Math.round(scale * 100)}%`}>
            <Segmented
              value={scale}
              onChange={setScale}
              options={UI_SCALES.map((s, i) => ({
                value: s.value,
                label: "Aa",
                title: `${s.label} · ${Math.round(s.value * 100)}%`,
                style: { fontSize: `${11 + i * 2.5}px` },
              }))}
            />
            <p className="mt-1.5 text-[11px] text-subtle">
              Ctrl and <span className="font-mono">+</span> / <span className="font-mono">-</span> /{" "}
              <span className="font-mono">0</span> step through these.
            </p>
          </Field>

          <Field label="Density">
            <Segmented
              value={theme.density}
              onChange={(v) => theme.set("density", v)}
              options={[
                { value: "comfortable", label: "Comfortable" },
                { value: "compact", label: "Compact" },
              ]}
            />
          </Field>

          <Field label="Animations">
            <Segmented
              value={theme.animations ? "on" : "off"}
              onChange={(v) => theme.set("animations", v === "on")}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
            />
          </Field>
        </Section>

        <Section title="Reading">
          <Field label="Article font">
            <Segmented
              value={theme.font}
              onChange={(v) => theme.set("font", v)}
              options={READER_FONTS.map((f) => ({
                value: f.key,
                label: f.label,
                style: { fontFamily: f.stack },
              }))}
            />
          </Field>

          <Field label="Article text size">
            <Segmented
              value={theme.fontSize}
              onChange={(v) => theme.set("fontSize", v)}
              options={READER_SIZES.map((size, i) => ({
                value: size,
                label: "Aa",
                title: `${Math.round(size * 100)}%`,
                style: { fontSize: `${10 + i * 1.6}px` },
              }))}
            />
          </Field>

          <Field label="Line width">
            <Segmented
              value={theme.lineWidth}
              onChange={(v) => theme.set("lineWidth", v)}
              options={(Object.keys(LINE_WIDTHS) as (keyof typeof LINE_WIDTHS)[]).map((k) => ({
                value: k,
                label: k[0].toUpperCase() + k.slice(1),
                title: `${LINE_WIDTHS[k]} characters`,
              }))}
            />
          </Field>

          <Field label="Text direction">
            <Segmented
              value={theme.direction}
              onChange={(v) => theme.set("direction", v)}
              options={[
                { value: "ltr", label: "Left to right" },
                { value: "rtl", label: "Right to left" },
              ]}
            />
          </Field>
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
          {note && <p className="animate-rise mt-2 text-[11px] text-subtle">{note}</p>}
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

        <Section title="Updates">
          <button
            type="button"
            onClick={checkUpdates}
            disabled={checking}
            className="row flex h-9 w-full items-center justify-center gap-2 border border-border text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw size={13} className={checking ? "animate-spin" : undefined} />
            {checking ? "Checking" : "Check for updates"}
          </button>

          {update && !updateError && (
            <div className="animate-rise mt-3">
              {update.newer ? (
                <>
                  <p className="flex items-start gap-2 text-[12px] leading-relaxed text-foreground">
                    <ArrowUpCircle size={14} className="mt-[1px] shrink-0 text-system" />
                    <span>
                      Version <span className="tabular">{update.latest}</span> is out.
                      {update.published ? ` Published ${update.published}.` : ""} You are on{" "}
                      <span className="tabular">{update.current}</span>.
                    </span>
                  </p>
                  <button
                    type="button"
                    onClick={() => void openUrl(update.url)}
                    className="row mt-2 flex h-9 w-full items-center justify-center gap-2 border border-system bg-elevated text-[12px] text-foreground hover:bg-secondary"
                  >
                    <Download size={13} />
                    Get it from GitHub
                  </button>
                </>
              ) : (
                <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
                  <CheckCircle2 size={14} className="shrink-0 text-system" />
                  Up to date on <span className="tabular">{update.current}</span>.
                </p>
              )}
            </div>
          )}

          {updateError && (
            <p className="animate-rise mt-3 text-[11px] leading-relaxed text-destructive">
              {updateError}
            </p>
          )}
        </Section>

        <Section title="About">
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Turbo Reader <span className="tabular text-subtle">v0.1.0</span> by{" "}
            <button
              type="button"
              onClick={() => void openUrl("https://github.com/t21dev")}
              className="text-foreground underline underline-offset-2 hover:text-system"
            >
              t21 dev
            </button>{" "}
            and{" "}
            <button
              type="button"
              onClick={() => void openUrl("https://github.com/TriptoAfsin")}
              className="text-foreground underline underline-offset-2 hover:text-system"
            >
              TriptoAfsin
            </button>
            .
          </p>
          <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
            Free for personal and other non-commercial use. For commercial use, get in touch
            first.
          </p>
          <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
            Feature design, the OPML conventions and the data model owe a great deal to{" "}
            <span className="text-foreground">Fluent Reader</span> by Haoyuan Liu, released under
            the BSD-3-Clause licence. Turbo Reader is an independent implementation.
          </p>
        </Section>
      </div>
    </div>
  )
}
