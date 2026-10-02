import { useMemo, useState } from "react"
import { ChevronRight, Inbox, Plus, Star, CircleDot } from "lucide-react"
import type { Group, Scope, Source } from "@/lib/api"
import { cn, hostOf } from "@/lib/utils"
import { FeedIcon } from "@/components/FeedIcon"

type Props = {
  groups: Group[]
  sources: Source[]
  scope: Scope
  scopeId: number | null
  unreadOnly: boolean
  onSelect: (scope: Scope, id: number | null) => void
  onToggleGroup: (id: number, expanded: boolean) => void
  onAddSource: (url: string) => Promise<void>
}

/** A rail row. Colour-only feedback, so rows never move on hover. */
function Row({
  active,
  icon,
  label,
  count,
  indent,
  onClick,
  title,
}: {
  active?: boolean
  icon?: React.ReactNode
  label: React.ReactNode
  count?: number
  indent?: boolean
  onClick?: () => void
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "row group relative flex w-full items-center gap-2 pr-2 text-left text-[13px]",
        "h-[var(--row-h)]",
        indent ? "pl-7" : "pl-2.5",
        active
          ? "bg-elevated font-medium text-foreground"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute left-1 w-[3px] rounded-full bg-system",
          "transition-[height,opacity] duration-200 ease-out",
          active ? "h-4 opacity-100" : "h-0 opacity-0",
        )}
      />
      {icon && <span className="shrink-0 opacity-80">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count ? (
        <span className="tabular shrink-0 rounded-full px-1.5 text-[11px] text-subtle">
          {count > 999 ? "999+" : count}
        </span>
      ) : null}
    </button>
  )
}

export function Sidebar(props: Props) {
  const { groups, sources, scope, scopeId, unreadOnly, onSelect, onToggleGroup, onAddSource } =
    props
  const [adding, setAdding] = useState(false)
  const [url, setUrl] = useState("")
  const [error, setError] = useState<string | null>(null)

  const grouped = useMemo(() => {
    const byGroup = new Map<number | null, Source[]>()
    for (const s of sources) {
      const key = s.groupId ?? null
      if (!byGroup.has(key)) byGroup.set(key, [])
      byGroup.get(key)!.push(s)
    }
    return byGroup
  }, [sources])

  const totalUnread = sources.reduce((n, s) => n + s.unread, 0)

  async function submit(ev: React.FormEvent) {
    ev.preventDefault()
    const value = url.trim()
    if (!value) return
    setError(null)
    try {
      await onAddSource(value)
      setUrl("")
      setAdding(false)
    } catch (err) {
      setError(String(err))
    }
  }

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-border bg-background">
      <nav className="flex flex-col gap-0.5 px-1.5 pb-2 pt-2">
        <Row
          active={scope === "all" && !unreadOnly}
          icon={<Inbox size={14} />}
          label="All articles"
          count={totalUnread}
          onClick={() => onSelect("all", null)}
        />
        <Row
          active={scope === "all" && unreadOnly}
          icon={<CircleDot size={14} />}
          label="Unread"
          count={totalUnread}
          onClick={() => onSelect("all", -1)}
        />
        <Row
          active={scope === "starred"}
          icon={<Star size={14} />}
          label="Starred"
          onClick={() => onSelect("starred", null)}
        />
      </nav>

      <div className="flex items-center justify-between px-3 pb-1 pt-1">
        <span className="text-[11px] font-medium uppercase tracking-wider text-subtle">Feeds</span>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          title="Add feed (n)"
          className={cn(
            "row grid h-6 w-6 place-items-center hover:bg-secondary hover:text-foreground",
            adding ? "bg-secondary text-foreground" : "text-subtle",
          )}
        >
          <Plus
            size={13}
            className={cn("transition-transform duration-200 ease-out", adding && "rotate-45")}
          />
        </button>
      </div>

      <div className="collapse-grid px-2" data-open={adding}>
        <div className="overflow-hidden">
          <form onSubmit={submit} className="pb-2">
            <input
              value={url}
              onChange={(ev) => setUrl(ev.target.value)}
              onKeyDown={(ev) => ev.key === "Escape" && setAdding(false)}
              placeholder="https://example.com/feed"
              className="h-8 w-full rounded-md border border-input bg-secondary px-2 font-mono text-[11px] outline-none transition-colors duration-150 ease-out placeholder:text-subtle focus:border-system"
            />
            {error && <p className="mt-1 px-1 text-[11px] text-destructive">{error}</p>}
          </form>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
        {groups.map((g) => {
          const feeds = grouped.get(g.id) ?? []
          const unread = feeds.reduce((n, s) => n + s.unread, 0)
          return (
            <div key={g.id}>
              <Row
                active={scope === "group" && scopeId === g.id}
                icon={
                  <ChevronRight
                    size={13}
                    className={cn(
                      "transition-transform duration-200 ease-out",
                      g.expanded && "rotate-90",
                    )}
                  />
                }
                label={<span className="font-medium text-foreground/90">{g.name}</span>}
                count={unread}
                onClick={() => {
                  onToggleGroup(g.id, !g.expanded)
                  onSelect("group", g.id)
                }}
              />
              {/* Grid rows animate; height does not, so there is no jump at
                  the end of the transition and no layout thrash during it. */}
              <div className="collapse-grid" data-open={g.expanded}>
                <div className="overflow-hidden">
                  {feeds.map((s) => (
                    <Row
                      key={s.id}
                      indent
                      active={scope === "source" && scopeId === s.id}
                      label={s.name}
                      title={s.lastError ?? hostOf(s.siteUrl ?? s.url)}
                      count={s.unread}
                      icon={<FeedIcon source={s} />}
                      onClick={() => onSelect("source", s.id)}
                    />
                  ))}
                </div>
              </div>
            </div>
          )
        })}

        {(grouped.get(null) ?? []).map((s) => (
          <Row
            key={s.id}
            active={scope === "source" && scopeId === s.id}
            label={s.name}
            title={s.lastError ?? hostOf(s.siteUrl ?? s.url)}
            count={s.unread}
            icon={<FeedIcon source={s} />}
            onClick={() => onSelect("source", s.id)}
          />
        ))}

        {sources.length === 0 && (
          <p className="px-3 py-6 text-[12px] leading-relaxed text-subtle">
            No feeds yet. Add one with <span className="text-foreground">+</span>, or import an OPML
            file from Settings.
          </p>
        )}
      </div>
    </aside>
  )
}
