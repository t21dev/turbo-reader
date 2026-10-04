import { useEffect, useRef, useState } from "react"
import {
  X,
  Download,
  Upload,
  Monitor,
  Sun,
  Moon,
  BookOpen,
  RotateCcw,
  Pipette,
  Palette,
  Type,
  Home as HomeIcon,
  Rss,
  HardDrive,
  BellRing,
  Bot,
  Search,
} from "lucide-react"
import { save as saveDialog } from "@tauri-apps/plugin-dialog"
import { api, type Group, type Source, type Stats } from "@/lib/api"
import { type HomePrefs } from "@/lib/home"
import { REFRESH_CHOICES, sinceLabel, type AppPrefs } from "@/lib/prefs"
import { pickAndImportOpml } from "@/lib/opml"
import { HomeSettings } from "@/components/HomeSettings"
import { BackgroundPrefs } from "@/components/BackgroundPrefs"
import { AgentSettings } from "@/components/AgentSettings"
import { StorageSettings } from "@/components/StorageSettings"
import type { PromptSpec } from "@/components/Prompt"
import {
  ACCENTS,
  LINE_WIDTHS,
  accentHsl,
  normalizeHex,
  READER_FONTS,
  READER_SIZES,
  useTheme,
  type AccentKey,
  type Mode,
} from "@/lib/theme"
import { UI_SCALES, setScale, useScale } from "@/lib/scale"
import { useDismissible } from "@/lib/presence"
import { cn } from "@/lib/utils"
import { fuzzyFilter } from "@/lib/fuzzy"
import { SETTINGS_INDEX, type SettingEntry } from "@/lib/settingsIndex"

export type SettingsTab = "appearance" | "reading" | "home" | "feeds" | "storage" | "background" | "agents"

const TABS: { key: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { key: "appearance", label: "Appearance", icon: <Palette size={14} /> },
  { key: "reading", label: "Reading", icon: <Type size={14} /> },
  { key: "home", label: "Home", icon: <HomeIcon size={14} /> },
  { key: "feeds", label: "Feeds", icon: <Rss size={14} /> },
  { key: "storage", label: "Storage", icon: <HardDrive size={14} /> },
  { key: "background", label: "Background", icon: <BellRing size={14} /> },
  { key: "agents", label: "AI agents", icon: <Bot size={14} /> },
]

/** The tab Settings last showed, so reopening it goes back there. */
let lastTab: SettingsTab = "appearance"

/** One block of a tab. The tab's own name is the page heading, so a block only
    carries a title when a tab holds more than one. */
function Section({
  title,
  id,
  hidden,
  children,
}: {
  title?: string
  id?: string
  hidden?: boolean
  children: React.ReactNode
}) {
  if (hidden) return null
  return (
    <section id={id} className="border-t border-border py-5 first:border-t-0 first:pt-0">
      {title && <h3 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-subtle">{title}</h3>}
      {children}
    </section>
  )
}

/** The eighth swatch: the system colour picker, showing the custom colour. */
function CustomSwatch() {
  const theme = useTheme()
  const on = theme.accent === "custom"
  return (
    <label
      title="Custom colour"
      className={cn(
        "relative grid h-7 cursor-pointer place-items-center overflow-hidden rounded-md border-2 transition-[border-color,scale] duration-200 ease-out active:scale-[0.94]",
        on ? "border-foreground" : "border-transparent",
      )}
      style={{
        background: on
          ? `hsl(${accentHsl("custom", theme.customAccent, theme.resolved)})`
          : "conic-gradient(from 0deg, #f43f5e, #f59e0b, #22c55e, #06b6d4, #6366f1, #d946ef, #f43f5e)",
      }}
      onClick={() => theme.set("accent", "custom")}
    >
      <Pipette size={12} className={on ? "text-background" : "text-white drop-shadow-[0_1px_2px_rgb(0_0_0/0.1),0_1px_1px_rgb(0_0_0/0.06)]"} />
      <input
        type="color"
        aria-label="Custom accent colour"
        value={theme.customAccent}
        onChange={(e) => {
          theme.set("customAccent", e.target.value)
          theme.set("accent", "custom")
        }}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </label>
  )
}

/** Type or paste a hex code. Applied as soon as it is a whole colour. */
function HexInput() {
  const theme = useTheme()
  const [text, setText] = useState(theme.customAccent)
  // Follow the picker when it changes the colour.
  useEffect(() => setText(theme.customAccent), [theme.customAccent])
  const valid = normalizeHex(text) !== null
  return (
    <div className="mt-2 flex items-center gap-2">
      <input
        aria-label="Accent hex code"
        value={text}
        spellCheck={false}
        maxLength={7}
        onChange={(e) => {
          setText(e.target.value)
          const hex = normalizeHex(e.target.value)
          if (hex) theme.set("customAccent", hex)
        }}
        onBlur={() => setText(theme.customAccent)}
        className={cn(
          "h-8 w-28 rounded-md border bg-secondary px-2.5 font-mono text-[12px] uppercase outline-hidden transition-colors duration-150 ease-out",
          valid ? "border-input focus:border-system" : "border-destructive",
        )}
      />
      <p className="text-[11px] leading-snug text-subtle">
        {valid
          ? "Lightened or darkened a little if it would be hard to read."
          : "Use six hex digits, like #4f8ff7."}
      </p>
    </div>
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
            "transition-[background-color,color,scale] duration-200 ease-out active:scale-[0.96]",
            "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50",
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
  groups,
  sources,
  homePrefs,
  onHomePrefs,
  onHomeChanged,
  prefs,
  onPrefs,
  lastChecked,
  onSortChanged,
  confirm,
  focus,
}: {
  onClose: () => void
  onImported: () => void
  groups: Group[]
  sources: Source[]
  homePrefs: HomePrefs
  onHomePrefs: (next: HomePrefs) => void
  onHomeChanged: () => void
  prefs: AppPrefs
  onPrefs: (next: AppPrefs) => void
  lastChecked: number | null
  onSortChanged: () => void
  /** Ask before doing something that cannot be undone. */
  confirm: (spec: PromptSpec) => void
  /** Open on this tab, as the home page's Customize button does. */
  focus?: SettingsTab
}) {
  const [tab, setTabState] = useState<SettingsTab>(focus ?? lastTab)
  const setTab = (next: SettingsTab) => {
    lastTab = next
    setTabState(next)
  }
  const theme = useTheme()
  const scale = useScale()
  const [stats, setStats] = useState<Stats | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const { closing, dismiss } = useDismissible(onClose, 180)

  useEffect(() => {
    api
      .stats()
      .then(setStats)
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => ev.key === "Escape" && dismiss()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [dismiss])

  async function importOpml() {
    setBusy("import")
    try {
      const added = await pickAndImportOpml()
      if (added === null) return
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
    {
      value: "light",
      label: (
        <>
          <Sun size={13} /> Light
        </>
      ),
    },
    {
      value: "dark",
      label: (
        <>
          <Moon size={13} /> Dark
        </>
      ),
    },
    {
      value: "paper",
      label: (
        <>
          <BookOpen size={13} /> Paper
        </>
      ),
    },
    {
      value: "system",
      label: (
        <>
          <Monitor size={13} /> System
        </>
      ),
    },
  ]

  const activeScale = UI_SCALES.find((s) => s.value === scale) ?? UI_SCALES[1]

  const home = homePrefs
  const setHome = (patch: Partial<HomePrefs>) => onHomePrefs({ ...home, ...patch })

  // Interests and mutes live in the database, because the ranking that reads
  // them runs in Rust. Debounced per list: they used to share one timer, so
  // typing in Muted within 400ms of typing in Interests silently threw the
  // Interests edit away.
  const listTimers = useRef<Record<string, number>>({})
  const pending = useRef<Record<string, string>>({})
  function saveList(key: "home_interests" | "home_mutes", value: string) {
    const timers = listTimers.current
    pending.current[key] = value
    if (timers[key]) window.clearTimeout(timers[key])
    timers[key] = window.setTimeout(() => {
      delete timers[key]
      delete pending.current[key]
      void api.setSetting(key, value).then(onHomeChanged)
    }, 400)
  }
  // Closing Settings inside the debounce saves the edit instead of losing it.
  useEffect(
    () => () => {
      for (const id of Object.values(listTimers.current)) window.clearTimeout(id)
      const left = Object.entries(pending.current)
      if (left.length) {
        void Promise.all(left.map(([k, v]) => api.setSetting(k, v))).then(onHomeChanged)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // Search within Settings: the tabs give way to the settings that match, and
  // choosing one opens its tab and points at it.
  const [query, setQuery] = useState("")
  const found = query.trim()
    ? fuzzyFilter(
        query,
        SETTINGS_INDEX.filter((e) => TABS.some((t) => t.key === e.target)),
        (e) => [e.label, `${e.place} ${e.label}`, e.keywords],
      ).slice(0, 9)
    : []

  function goTo(entry: SettingEntry) {
    setQuery("")
    setTab(entry.target as SettingsTab)
    // Two frames: one for the tab to render, one for its layout.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const want = (entry.anchor ?? entry.label).toLowerCase()
        const label = [...document.querySelectorAll("#settings-body p, #settings-body span, #settings-body h3")].find(
          (n) => n.textContent?.trim().toLowerCase() === want,
        )
        const block = label?.parentElement
        if (!block) return
        block.scrollIntoView({ block: "center" })
        block.classList.add("settings-flash")
        window.setTimeout(() => block.classList.remove("settings-flash"), 1600)
      }),
    )
  }

  const current = TABS.find((t) => t.key === tab) ?? TABS[0]
  const resettable = tab === "appearance" || tab === "reading"

  /** Up and down move between tabs, as in a native settings window. */
  function onTabKey(ev: React.KeyboardEvent) {
    if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp") return
    ev.preventDefault()
    const i = TABS.findIndex((t) => t.key === tab)
    const next = TABS[(i + (ev.key === "ArrowDown" ? 1 : TABS.length - 1)) % TABS.length]
    setTab(next.key)
    requestAnimationFrame(() => document.getElementById(`settings-tab-${next.key}`)?.focus())
  }

  return (
    <div
      className={cn(
        "absolute inset-0 z-50 grid place-items-center bg-black/50 p-6",
        closing ? "animate-fade-out" : "animate-fade",
      )}
      onClick={dismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className={cn(
          "flex h-[min(680px,100%)] w-[min(880px,100%)] overflow-hidden rounded-xl border border-border bg-popover shadow-float",
          closing ? "animate-pop-out" : "animate-pop",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <nav className="flex w-[200px] shrink-0 flex-col border-r border-border bg-background/40 p-2">
          <h2 id="settings-title" className="px-2.5 pb-3 pt-2.5 text-[14px] font-semibold tracking-tight">
            Settings
          </h2>
          <div className="relative mb-2 px-0.5">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" />
            <input
              id="settings-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && found[0]) goTo(found[0])
                // Escape clears first, and only closes Settings once empty.
                if (e.key === "Escape" && query) {
                  e.preventDefault()
                  e.stopPropagation()
                  e.nativeEvent.stopImmediatePropagation()
                  setQuery("")
                }
              }}
              placeholder="Search settings"
              spellCheck={false}
              autoComplete="off"
              className="h-8 w-full rounded-lg border border-border bg-background/60 pl-7 pr-2 text-[12px] outline-hidden transition-colors duration-150 ease-out placeholder:text-subtle focus:border-system"
            />
          </div>
          {query.trim() ? (
            <div role="listbox" aria-label="Matching settings" className="space-y-0.5" data-settings-results>
              {found.length === 0 ? (
                <p className="px-2.5 py-2 text-[12px] text-subtle">No setting matches.</p>
              ) : (
                found.map((e, i) => (
                  <button
                    key={`${e.target}-${e.label}`}
                    type="button"
                    role="option"
                    aria-selected={i === 0}
                    onClick={() => goTo(e)}
                    className={cn(
                      "row flex w-full flex-col items-start px-2.5 py-1.5 text-left",
                      "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50",
                      i === 0 ? "bg-secondary" : "hover:bg-secondary",
                    )}
                  >
                    <span className="text-[12.5px] text-foreground">{e.label}</span>
                    <span className="text-[11px] text-subtle">{e.place}</span>
                  </button>
                ))
              )}
            </div>
          ) : (
          <div
            role="tablist"
            aria-orientation="vertical"
            aria-label="Settings sections"
            onKeyDown={onTabKey}
            className="space-y-0.5"
          >
            {TABS.map((t) => (
              <button
                key={t.key}
                id={`settings-tab-${t.key}`}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                aria-controls="settings-body"
                tabIndex={tab === t.key ? 0 : -1}
                onClick={() => setTab(t.key)}
                className={cn(
                  "row flex h-8 w-full items-center gap-2.5 px-2.5 text-left text-[12.5px]",
                  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50",
                  tab === t.key
                    ? "bg-elevated font-medium text-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <span className={tab === t.key ? "text-system" : "text-subtle"}>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
          )}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-border px-6">
            <h3 className="text-[14px] font-semibold tracking-tight text-foreground" data-settings-heading>
              {current.label}
            </h3>
            <div className="flex items-center gap-0.5">
              {resettable && (
                <button
                  type="button"
                  onClick={() =>
                    confirm({
                      title: "Reset appearance?",
                      detail:
                        "Theme, accent, density, animations and reading settings go back to their " +
                        "defaults. Your feeds and articles are not touched.",
                      confirmLabel: "Reset",
                      destructive: true,
                      onConfirm: () => theme.reset(),
                    })
                  }
                  title="Reset appearance to defaults"
                  className="row grid h-7 w-7 place-items-center text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <RotateCcw size={13} />
                </button>
              )}
              <button
                type="button"
                onClick={dismiss}
                title="Close (Esc)"
                aria-label="Close settings"
                className="row grid h-7 w-7 place-items-center text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          <div
            id="settings-body"
            role="tabpanel"
            aria-labelledby={`settings-tab-${tab}`}
            className="min-h-0 flex-1 overflow-y-auto px-6 py-5"
          >
        <Section hidden={tab !== "appearance"}>
          <Field label="Theme">
            <Segmented value={theme.mode} options={modes} onChange={(v) => theme.set("mode", v)} />
          </Field>

          <Field label="Accent">
            <div className="grid grid-cols-8 gap-1.5">
              {(Object.keys(ACCENTS) as AccentKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  title={ACCENTS[key].label}
                  onClick={() => theme.set("accent", key)}
                  className={cn(
                    "h-7 rounded-md border-2 transition-[border-color,scale] duration-200 ease-out active:scale-[0.94]",
                    theme.accent === key ? "border-foreground" : "border-transparent",
                  )}
                  style={{ background: `hsl(${ACCENTS[key][theme.resolved]})` }}
                />
              ))}
              <CustomSwatch />
            </div>
            {theme.accent === "custom" && <HexInput />}
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

        <Section hidden={tab !== "reading"}>
          <Field label="Article font">
            <div role="radiogroup" aria-label="Article font" className="grid grid-cols-2 gap-1.5">
              {READER_FONTS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  role="radio"
                  aria-checked={theme.font === f.key}
                  onClick={() => theme.set("font", f.key)}
                  title={f.note}
                  className={cn(
                    "row flex items-baseline gap-2 border px-2.5 py-2 text-left transition-colors duration-150",
                    theme.font === f.key
                      ? "border-system bg-elevated text-foreground"
                      : "border-border text-muted-foreground hover:bg-secondary",
                  )}
                >
                  <span className="text-[17px] leading-none" style={{ fontFamily: f.stack }}>
                    Aa
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] font-medium" style={{ fontFamily: f.stack }}>
                      {f.label}
                    </span>
                    <span className="block truncate text-[10.5px] text-subtle">{f.note}</span>
                  </span>
                </button>
              ))}
            </div>
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

        <Section id="settings-home" hidden={tab !== "home"}>
          <HomeSettings
            home={home}
            setHome={setHome}
            saveList={saveList}
            groups={groups}
            sources={sources}
            onChanged={onHomeChanged}
            Field={Field}
            Segmented={Segmented}
          />
        </Section>

        <Section hidden={tab !== "feeds"}>
          <Field label="Check for new articles">
            <Segmented
              value={prefs.refreshMinutes}
              onChange={(v) => onPrefs({ ...prefs, refreshMinutes: v })}
              options={REFRESH_CHOICES.map((m) => ({
                value: m,
                label: m === 0 ? "Off" : m < 60 ? `${m}m` : `${m / 60}h`,
                title: m === 0 ? "Only when you press r" : `Every ${m} minutes`,
              }))}
            />
            <p className="mt-1.5 text-[11px] text-subtle">
              {prefs.refreshMinutes === 0
                ? "Manual only. Press r, or the refresh button."
                : `Last checked ${sinceLabel(lastChecked)}.`}
            </p>
          </Field>

          <Field label="Order">
            <Segmented
              value={prefs.feedSort}
              onChange={(v) => {
                onPrefs({ ...prefs, feedSort: v })
                void api.setSetting("feed_sort", v).then(onSortChanged)
              }}
              options={[
                { value: "manual", label: "As imported" },
                { value: "alpha", label: "Alphabetical" },
              ]}
            />
          </Field>

          <Field label="YouTube videos">
            <Segmented
              value={prefs.youtubeInline ? "inline" : "browser"}
              onChange={(v) => onPrefs({ ...prefs, youtubeInline: v === "inline" })}
              options={[
                { value: "browser", label: "Open in browser" },
                { value: "inline", label: "Play here" },
              ]}
            />
            <p className="mt-1.5 text-[11px] leading-relaxed text-subtle">
              Playing here embeds YouTube's own player, so Google sees the view. The
              privacy-enhanced domain is used either way.
            </p>
          </Field>

          <Field label="OPML">
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
          </Field>
          {note && <p className="animate-rise mt-2 text-[11px] text-subtle">{note}</p>}
        </Section>

        {stats && (
          <Section title="Library" hidden={tab !== "feeds"}>
            <dl className="grid grid-cols-2 gap-y-2 text-[12px]">
              {[
                ["Feeds", stats.sources.toLocaleString()],
                ["Articles", stats.items.toLocaleString()],
                ["Unread", stats.unread.toLocaleString()],
                ["Starred", stats.starred.toLocaleString()],
              ].map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="tabular text-right text-foreground">{v}</dd>
                </div>
              ))}
            </dl>
          </Section>
        )}

        <Section hidden={tab !== "storage"}>
          <StorageSettings
            confirm={confirm}
            onChanged={() => {
              onImported()
              api.stats().then(setStats).catch(() => undefined)
            }}
          />
        </Section>

        <Section hidden={tab !== "background"}>
          <BackgroundPrefs />
        </Section>

        <Section hidden={tab !== "agents"}>
          <AgentSettings confirm={confirm} />
        </Section>

          </div>
        </div>
      </div>
    </div>
  )
}
