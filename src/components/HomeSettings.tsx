import { useEffect, useState } from "react"
import { ArrowDown, ArrowUp, ChevronDown, Eye, EyeOff, Pin } from "lucide-react"
import { api, type BandLayout, type Group, type Source } from "@/lib/api"
import {
  LAYOUTS,
  SECTIONS,
  WINDOWS,
  moved,
  ordered,
  type CardSize,
  type HomePrefs,
} from "@/lib/home"
import { cn } from "@/lib/utils"

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
            <div className="space-y-1.5" data-home-sections>
              {home.order.map((key, i) => {
                const label = SECTIONS.find((x) => x.key === key)!.label
                const on = home.bands[key]
                return (
                  <OrderRow
                    key={key}
                    label={label}
                    shown={on}
                    first={i === 0}
                    last={i === home.order.length - 1}
                    onToggle={() => setHome({ bands: { ...home.bands, [key]: !on } })}
                    onMove={(by) =>
                      setHome({ order: moved(home.order, key, by) as HomePrefs["order"] })
                    }
                  />
                )
              })}
            </div>
          </Field>

          <Field label="Pinned feeds">
            <PinPicker sources={sources} onChanged={onChanged} />
          </Field>

          {groups.length > 0 && (
            <Field label="Categories">
              <div className="space-y-1.5" data-home-categories>
                {homeGroups.map((g, i) => (
                  <GroupRow
                    key={g.id}
                    group={g}
                    first={i === 0}
                    last={i === homeGroups.length - 1}
                    onMove={(by) =>
                      setHome({
                        groupOrder: moved(
                          homeGroups.map((x) => String(x.id)),
                          String(g.id),
                          by,
                        ),
                      })
                    }
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
                ))}
              </div>
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
        className="w-full resize-y rounded-lg border border-input bg-secondary px-2.5 py-2 font-mono text-[11.5px] leading-relaxed outline-none transition-colors duration-150 ease-out placeholder:text-subtle focus:border-system"
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
          <div className="max-h-56 space-y-0.5 overflow-y-auto pt-1.5">
            {sources.map((s) => (
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
          </div>
        </div>
      </div>
    </>
  )
}

/** Up and down buttons for anything the reader can put in order. */
function MoveButtons({
  label,
  first,
  last,
  onMove,
}: {
  label: string
  first: boolean
  last: boolean
  onMove: (by: -1 | 1) => void
}) {
  const cls =
    "row grid h-8 w-7 shrink-0 place-items-center border border-border text-muted-foreground hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
  return (
    <>
      <button
        type="button"
        aria-label={`Move ${label} up`}
        title="Move up"
        disabled={first}
        onClick={() => onMove(-1)}
        className={cls}
      >
        <ArrowUp size={12} />
      </button>
      <button
        type="button"
        aria-label={`Move ${label} down`}
        title="Move down"
        disabled={last}
        onClick={() => onMove(1)}
        className={cls}
      >
        <ArrowDown size={12} />
      </button>
    </>
  )
}

function OrderRow({
  label,
  shown,
  first,
  last,
  onToggle,
  onMove,
}: {
  label: string
  shown: boolean
  first: boolean
  last: boolean
  onToggle: () => void
  onMove: (by: -1 | 1) => void
}) {
  return (
    <div className="flex items-center gap-1.5">
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
      <MoveButtons label={label} first={first} last={last} onMove={onMove} />
    </div>
  )
}

function GroupRow({
  group,
  hidden,
  first,
  last,
  onToggleHidden,
  onMove,
  onLayout,
}: {
  group: Group
  hidden: boolean
  first: boolean
  last: boolean
  onToggleHidden: () => void
  onMove: (by: -1 | 1) => void
  onLayout: (layout: BandLayout | null) => void
}) {
  // Kept here as well, since the group list is not reloaded after a change.
  const [layout, setLayout] = useState<string>(group.homeLayout ?? "")
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={onToggleHidden}
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
      <MoveButtons label={group.name} first={first} last={last} onMove={onMove} />
      <select
        aria-label={`Layout for ${group.name}`}
        value={layout}
        onChange={(e) => {
          setLayout(e.target.value)
          onLayout((e.target.value || null) as BandLayout | null)
        }}
        title="How this category is laid out. Auto decides from whether its feeds carry images."
        className="h-8 shrink-0 rounded-md border border-border bg-background px-2 text-[11.5px] text-muted-foreground outline-none focus:border-system"
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
