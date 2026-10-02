import { useMemo, useState } from "react"
import {
  ChevronRight,
  Inbox,
  Plus,
  RefreshCw,
  Settings2,
  Star,
  CircleDot,
} from "lucide-react"
import type { Group, Scope, Source } from "@/lib/api"
import { cn, hostOf } from "@/lib/utils"

type Props = {
  groups: Group[]
  sources: Source[]
  scope: Scope
  scopeId: number | null
  unreadOnly: boolean
  busy: boolean
  onSelect: (scope: Scope, id: number | null) => void
  onToggleGroup: (id: number, expanded: boolean) => void
  onAddSource: (url: string) => Promise<void>
  onRefresh: () => void
  onOpenSettings: () => void
}

/** A rail row. Colour-only feedback — rows never move on hover. */
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
        "row group relative flex h-8 w-full items-center gap-2 pr-2 text-left text-[13px]",
        indent ? "pl-7" : "pl-2.5",
        active
          ? "bg-elevated font-medium text-foreground"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-1 h-4 w-[3px] rounded-full bg-system"
        />
      )}
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
  const {
    groups,
    sources,
    scope,
    scopeId,
    unreadOnly,
    busy,
    onSelect,
    onToggleGroup,
    onAddSource,
    onRefresh,
    onOpenSettings,
  } = props
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
      <div className="flex items-center gap-1 px-2 py-2">
        <span className="px-1 text-[13px] font-semibold tracking-tight">Turbo Reader</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onRefresh}
          disabled={busy}
          title="Refresh all feeds"
          className="row grid h-7 w-7 place-items-center text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40"
        >
          <RefreshCw size={14} className={busy ? "animate-spin" : undefined} />
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          title="Settings"
          className="row grid h-7 w-7 place-items-center text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Settings2 size={14} />
        </button>
      </div>

      <nav className="flex flex-col gap-0.5 px-1.5 pb-2">
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
        <span className="text-[11px] font-medium uppercase tracking-wider text-subtle">
          Feeds
        </span>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          title="Add feed"
          className="row grid h-6 w-6 place-items-center text-subtle hover:bg-secondary hover:text-foreground"
        >
          <Plus size={13} />
        </button>
      </div>

      {adding && (
        <form onSubmit={submit} className="px-2 pb-2">
          <input
            autoFocus
            value={url}
            onChange={(ev) => setUrl(ev.target.value)}
            onKeyDown={(ev) => ev.key === "Escape" && setAdding(false)}
            placeholder="https://example.com/feed"
            className="h-8 w-full rounded-md border border-input bg-secondary px-2 font-mono text-[11px] outline-none placeholder:text-subtle focus:border-system"
          />
          {error && <p className="mt-1 px-1 text-[11px] text-destructive">{error}</p>}
        </form>
      )}

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
              {g.expanded &&
                feeds.map((s) => (
                  <Row
                    key={s.id}
                    indent
                    active={scope === "source" && scopeId === s.id}
                    label={s.name}
                    title={s.lastError ?? hostOf(s.siteUrl ?? s.url)}
                    count={s.unread}
                    icon={
                      s.lastError ? (
                        <span className="block h-1.5 w-1.5 rounded-full bg-destructive" />
                      ) : undefined
                    }
                    onClick={() => onSelect("source", s.id)}
                  />
                ))}
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
            onClick={() => onSelect("source", s.id)}
          />
        ))}

        {sources.length === 0 && (
          <p className="px-3 py-6 text-[12px] leading-relaxed text-subtle">
            No feeds yet. Add one with <span className="text-foreground">+</span>, or import an
            OPML file from Settings.
          </p>
        )}
      </div>
    </aside>
  )
}
