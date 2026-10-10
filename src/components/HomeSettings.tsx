import { useEffect, useState } from "react"
import { ChevronDown, Eye, EyeOff, Pin } from "lucide-react"
import { api, type BandLayout, type Group, type Source } from "@/lib/api"
import {
  LAYOUTS,
  SECTIONS,
  WINDOWS,
  ordered,
  type CardSize,
  type HomePrefs,
} from "@/lib/home"
import { cn } from "@/lib/utils"
import { fuzzyFilter } from "@/lib/fuzzy"
import { ListFilter } from "@/components/ListFilter"
import { SortableList } from "@/components/Sortable"

type Props = {
  home: HomePrefs
  setHome: (patch: Partial<HomePrefs>) => void
  saveList: (key: "home_interests" | "home_mutes", value: string) => void
  groups: Group[]
  sources: Source[]
  onChanged: () => void
  Field: (p: { label: string; children: React.ReactNode }) => React.ReactElement
  Segmented: <T extends string | number>(p: {
    value: T
    options: { value: T; label: React.ReactNode; title?: string; style?: React.CSSProperties }[]
    onChange: (v: T) => void
  }) => React.ReactElement
}

/** Everything the reader can decide about the home page. Lives in its own file
    because the settings panel was already long enough. */
export function HomeSettings({
  home,
  setHome,
  saveList,
  groups,
  sources,
  onChanged,
  Field,
  Segmented,
}: Props) {
  // Categories in the order home shows them, which can differ from the sidebar.
  const homeGroups = ordered(groups, (g) => String(g.id), home.groupOrder)
  return (
    <>
      <Field label="Show the home page">
        <Segmented
          value={home.enabled ? "on" : "off"}
          onChange={(v) => setHome({ enabled: v === "on" })}
          options={[
            { value: "on", label: "On" },
            { value: "off", label: "Off" },
          ]}
        />
      </Field>

      {home.enabled && (
        <>
          <Field label="Opening window">
            <Segmented
              value={home.window}
              onChange={(v) => setHome({ window: v })}
              options={WINDOWS.map((w) => ({ value: w.value, label: w.label }))}
            />
          </Field>

          <Field label="Under the date">
            <Segmented
              value={home.masthead}
              onChange={(v) => setHome({ masthead: v as HomePrefs["masthead"] })}
              options={[
                { value: "off", label: "Nothing" },
                { value: "quote", label: "A quote" },
                { value: "headline", label: "Top story" },
              ]}
            />
            {home.masthead === "quote" && <QuotesHint />}
          </Field>

          <Field label="Clock">
            <Segmented
              value={!home.clock ? "off" : home.seconds ? "seconds" : "minutes"}
              onChange={(v) => setHome({ clock: v !== "off", seconds: v === "seconds" })}
              options={[
                { value: "off", label: "Off" },
                { value: "minutes", label: "Minutes" },
                { value: "seconds", label: "Seconds" },
              ]}
            />
          </Field>

          <Field label="Articles per category">
            <Segmented
              value={home.perBand}
              onChange={(v) => setHome({ perBand: v })}
              options={[4, 8, 12].map((n) => ({ value: n, label: String(n) }))}
            />
          </Field>

          <Field label="Card size">
            <Segmented
              value={home.cardSize}
              onChange={(v) => setHome({ cardSize: v as CardSize })}
              options={[
                { value: "small", label: "Small" },
                { value: "medium", label: "Medium" },
                { value: "large", label: "Large" },
              ]}
            />
          </Field>

          <Field label="Sections">
            <SortableList
              data={{ "data-home-sections": true }}
              keys={home.order}
              onReorder={(next) => setHome({ order: next as HomePrefs["order"] })}
              label={(key) => SECTIONS.find((x) => x.key === key)!.label}
              row={(key, handle) => {
                const section = key as HomePrefs["order"][number]
                const on = home.bands[section]
                return (
                  <OrderRow
                    label={SECTIONS.find((x) => x.key === section)!.label}
                    shown={on}
                    handle={handle}
                    onToggle={() => setHome({ bands: { ...home.bands, [section]: !on } })}
                  />
                )
              }}
            />
          </Field>

          <Field label="Pinned feeds">
            <PinPicker sources={sources} onChanged={onChanged} />
          </Field>

          {groups.length > 0 && (
            <Field label="Categories">
              <SortableList
                data={{ "data-home-categories": true }}
                keys={homeGroups.map((g) => String(g.id))}
                onReorder={(next) => setHome({ groupOrder: next })}
                label={(id) => homeGroups.find((g) => String(g.id) === id)?.name ?? "category"}
                row={(id, handle) => {
                  const g = homeGroups.find((x) => String(x.id) === id)!
                  return (
                    <GroupRow
                      group={g}
                      handle={handle}
                      hidden={home.hiddenGroups.includes(String(g.id))}
                      onToggleHidden={() =>
                        setHome({
                          hiddenGroups: home.hiddenGroups.includes(String(g.id))
                            ? home.hiddenGroups.filter((x) => x !== String(g.id))
                            : [...home.hiddenGroups, String(g.id)],
                        })
                      }
                      onLayout={(layout) => void api.setGroupLayout(g.id, layout).then(onChanged)}
                    />
                  )
                }}
              />
            </Field>
          )}

          <Field label="Interests">
            <KeywordList
              value={home.interests}
              placeholder={"kubernetes\nrust\n/\\bLLM\\b/"}
              onChange={(v) => {
                setHome({ interests: v })
                saveList("home_interests", v)
              }}
            />
          </Field>

          <Field label="Muted">
            <KeywordList
              value={home.mutes}
              placeholder={"crypto\ncelebrity"}
              onChange={(v) => {
                setHome({ mutes: v })
                saveList("home_mutes", v)
              }}
            />
          </Field>
        </>
      )}
    </>
  )
}

/** One rule per line. Slashes make it a regular expression, anything else is a
    plain substring, and the count underneath makes a broken rule obvious now
    rather than when the page quietly stops matching. */
function KeywordList({
  value,
  placeholder,
  onChange,
}: {
  value: string
  placeholder: string
  onChange: (v: string) => void
}) {
  const lines = value
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))

  const broken = lines
    .filter((l) => l.startsWith("/") && l.endsWith("/") && l.length > 2)
    .filter((l) => {
      try {
        new RegExp(l.slice(1, -1), "i")
        return false
      } catch {
        return true
      }
    })

  return (
    <>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        rows={4}
        placeholder={placeholder}
        className="w-full resize-y rounded-lg border border-input bg-secondary px-2.5 py-2 font-mono text-[11.5px] leading-relaxed outline-hidden transition-colors duration-150 ease-out placeholder:text-subtle focus:border-system"
      />
      <p className="mt-1 text-[11px] leading-relaxed text-subtle">
        {lines.length === 0
          ? "One per line. Wrap a line in slashes for a regular expression."
          : `${lines.length} rule${lines.length === 1 ? "" : "s"}.`}
        {broken.length > 0 && (
          <span className="text-destructive">
            {" "}
            {broken.length} will not compile, so {broken.length === 1 ? "it is" : "they are"}{" "}
            ignored.
          </span>
        )}
      </p>
    </>
  )
}

function QuotesHint() {
  const [path, setPath] = useState<string | null>(null)
  useEffect(() => {
    api
      .quotesPath()
      .then(setPath)
      .catch(() => undefined)
  }, [])
  return (
    <p className="mt-1.5 text-[11px] leading-relaxed text-subtle">
      One line a day, picked by the date so it does not reshuffle while you read. Put your own in{" "}
      <span className="break-all font-mono text-muted-foreground">{path ?? "quotes.json"}</span>, a
      JSON array of objects with a text and an optional author.
    </p>
  )
}

function PinPicker({ sources, onChanged }: { sources: Source[]; onChanged: () => void }) {
  const [pinned, setPinned] = useState<Set<number>>(new Set())
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  // A handful of feeds is quicker to scan than to search.
  const searchable = sources.length > 6
  const shown = fuzzyFilter(query, sources, (s) => [s.name, s.url])

  useEffect(() => {
    api
      .home({ perBand: 1 })
      .then((h) => setPinned(new Set(h.pinned.map((p) => p.id))))
      .catch(() => undefined)
  }, [])

  function toggle(id: number) {
    const next = new Set(pinned)
    const on = !next.has(id)
    if (on) next.add(id)
    else next.delete(id)
    setPinned(next)
    void api.setPinned(id, on).then(onChanged)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="row flex h-9 w-full items-center justify-between border border-border px-3 text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground"
      >
        <span>{pinned.size === 0 ? "None pinned" : `${pinned.size} pinned`}</span>
        <ChevronDown
          size={13}
          className={cn("transition-transform duration-200 ease-out", open && "rotate-180")}
        />
      </button>
      <div className="collapse-grid" data-open={open}>
        <div className="overflow-hidden">
          {searchable && (
            <div className="pt-1.5">
              <ListFilter value={query} onChange={setQuery} placeholder="Find a feed" label="Find a feed to pin" />
            </div>
          )}
          <div className="max-h-56 space-y-0.5 overflow-y-auto pt-1.5" data-pin-list>
            {shown.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => toggle(s.id)}
                className={cn(
                  "row flex h-8 w-full items-center gap-2 px-2 text-left text-[12px]",
                  pinned.has(s.id)
                    ? "bg-elevated text-foreground"
                    : "text-muted-foreground hover:bg-secondary",
                )}
              >
                <Pin
                  size={12}
                  className={cn("shrink-0", pinned.has(s.id) ? "text-system" : "text-subtle")}
                />
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
              </button>
            ))}
            {sources.length === 0 && (
              <p className="px-2 py-3 text-[11.5px] text-subtle">No feeds to pin yet.</p>
            )}
            {sources.length > 0 && shown.length === 0 && (
              <p className="px-2 py-3 text-[11.5px] text-subtle">No feed matches.</p>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function OrderRow({
  label,
  shown,
  handle,
  onToggle,
}: {
  label: string
  shown: boolean
  handle: React.ReactNode
  onToggle: () => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      {handle}
      <button
        type="button"
        onClick={onToggle}
        aria-label={`${shown ? "Hide" : "Show"} ${label}`}
        aria-pressed={shown}
        title={shown ? "Shown on home" : "Hidden from home"}
        className={cn(
          "row grid h-8 w-8 shrink-0 place-items-center border border-border",
          shown ? "text-system" : "text-subtle",
        )}
      >
        {shown ? <Eye size={13} /> : <EyeOff size={13} />}
      </button>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-[12px]",
          shown ? "text-foreground" : "text-subtle",
        )}
      >
        {label}
      </span>
    </div>
  )
}

function GroupRow({
  group,
  hidden,
  handle,
  onToggleHidden,
  onLayout,
}: {
  group: Group
  hidden: boolean
  handle: React.ReactNode
  onToggleHidden: () => void
  onLayout: (layout: BandLayout | null) => void
}) {
  // Kept here as well, since the group list is not reloaded after a change.
  const [layout, setLayout] = useState<string>(group.homeLayout ?? "")
  return (
    <div className="flex items-center gap-1.5">
      {handle}
      <button
        type="button"
        onClick={onToggleHidden}
        aria-label={`${hidden ? "Show" : "Hide"} ${group.name}`}
        aria-pressed={!hidden}
        title={hidden ? "Hidden from home" : "Shown on home"}
        className={cn(
          "row grid h-8 w-8 shrink-0 place-items-center border border-border",
          hidden ? "text-subtle" : "text-system",
        )}
      >
        {hidden ? <EyeOff size={13} /> : <Eye size={13} />}
      </button>
      <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">
        {group.name}
      </span>
      <select
        aria-label={`Layout for ${group.name}`}
        value={layout}
        onChange={(e) => {
          setLayout(e.target.value)
          onLayout((e.target.value || null) as BandLayout | null)
        }}
        title="How this category is laid out. Auto decides from whether its feeds carry images."
        className="h-8 shrink-0 rounded-md border border-border bg-background px-2 text-[11.5px] text-muted-foreground outline-hidden focus:border-system"
      >
        <option value="">Auto</option>
        {LAYOUTS.map((l) => (
          <option key={l.value} value={l.value} title={l.hint}>
            {l.label}
          </option>
        ))}
      </select>
    </div>
  )
}
