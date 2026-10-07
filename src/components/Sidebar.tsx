import { useMemo } from "react"
import { ChevronRight, FolderPlus, Home as HomeIcon, Inbox, Pin, Plus, Star, CircleDot } from "lucide-react"
import type { MenuPoint } from "@/components/ContextMenu"
import type { Target } from "@/components/SidebarMenus"
import type { Group, Scope, Source } from "@/lib/api"
import { cn, hostOf } from "@/lib/utils"
import { FeedIcon } from "@/components/FeedIcon"

type Props = {
  atHome: boolean
  homeEnabled: boolean
  onHome: () => void
  groups: Group[]
  sources: Source[]
  scope: Scope
  scopeId: number | null
  unreadOnly: boolean
  onSelect: (scope: Scope, id: number | null) => void
  onToggleGroup: (id: number, expanded: boolean) => void
  /** Open the Add Feed dialog. */
  onAddFeed: () => void
  /** Right-click anywhere in the rail. Null closes whatever is open. */
  onContextMenu: (target: Target | null) => void
  onNewGroup: () => void
}

/** A rail row. Colour-only feedback, so rows never move on hover. */
function Row({
  active,
  icon,
  label,
  count,
  indent,
  onClick,
  onContextMenu,
  title,
  badge,
}: {
  active?: boolean
  icon?: React.ReactNode
  label: React.ReactNode
  count?: number
  indent?: boolean
  onClick?: () => void
  onContextMenu?: (at: MenuPoint) => void
  title?: string
  badge?: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={(ev) => {
        if (!onContextMenu) return
        ev.preventDefault()
        ev.stopPropagation()
        onContextMenu({ x: ev.clientX, y: ev.clientY })
      }}
      title={title}
      className={cn(
        "row group relative flex w-full items-center gap-2 pr-2 text-left text-[13px]",
        "h-(--row-h)",
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
      {badge}
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
    atHome,
    homeEnabled,
    onHome,
    groups,
    sources,
    scope,
    scopeId,
    unreadOnly,
    onSelect,
    onToggleGroup,
    onAddFeed,
    onContextMenu,
    onNewGroup,
  } = props

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


  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-border bg-background">
      <nav className="flex flex-col gap-0.5 px-1.5 pb-2 pt-2">
        {homeEnabled && (
          <Row
            active={atHome}
            icon={<HomeIcon size={14} />}
            label="Home"
            title="What happened since you last looked (g)"
            onClick={onHome}
          />
        )}
        <Row
          active={!atHome && scope === "all" && !unreadOnly}
          icon={<Inbox size={14} />}
          label="All articles"
          // No count here: it was the unread total, the same number Unread
          // shows directly below.
          onClick={() => onSelect("all", null)}
        />
        <Row
          active={!atHome && scope === "all" && unreadOnly}
          icon={<CircleDot size={14} />}
          label="Unread"
          count={totalUnread}
          onClick={() => onSelect("all", -1)}
        />
        <Row
          active={!atHome && scope === "starred"}
          icon={<Star size={14} />}
          label="Starred"
          onClick={() => onSelect("starred", null)}
        />
      </nav>

      <div className="flex items-center justify-between px-3 pb-1 pt-1">
        <span className="text-[11px] font-medium uppercase tracking-wider text-subtle">Feeds</span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={onNewGroup}
            title="New folder"
            className="row grid h-6 w-6 place-items-center text-subtle hover:bg-secondary hover:text-foreground"
          >
            <FolderPlus size={13} />
          </button>
          <button
            type="button"
            onClick={onAddFeed}
            title="Add feed (n)"
            className="row grid h-6 w-6 place-items-center text-subtle hover:bg-secondary hover:text-foreground"
          >
            <Plus size={13} />
          </button>
        </div>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3"
        onContextMenu={(ev) => {
          // Right-clicking the empty part of the rail still offers New folder.
          ev.preventDefault()
          onContextMenu({ kind: "rail", at: { x: ev.clientX, y: ev.clientY } })
        }}
      >
        {groups.map((g) => {
          const feeds = grouped.get(g.id) ?? []
          const unread = feeds.reduce((n, s) => n + s.unread, 0)
          return (
            <div key={g.id}>
              <Row
                active={!atHome && scope === "group" && scopeId === g.id}
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
                onContextMenu={(at) => onContextMenu({ kind: "group", group: g, at })}
              />
              {/* Grid rows animate; height does not, so there is no jump at
                  the end of the transition and no layout thrash during it. */}
              <div className="collapse-grid" data-open={g.expanded}>
                <div className="overflow-hidden">
                  {feeds.map((s) => (
                    <Row
                      key={s.id}
                      indent
                      active={!atHome && scope === "source" && scopeId === s.id}
                      label={s.name}
                      title={s.lastError ?? hostOf(s.siteUrl ?? s.url)}
                      count={s.unread}
                      icon={<FeedIcon source={s} />}
                      badge={s.pinned ? <Pin size={10} className="shrink-0 text-subtle" /> : null}
                      onClick={() => onSelect("source", s.id)}
                      onContextMenu={(at) => onContextMenu({ kind: "source", source: s, at })}
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
            active={!atHome && scope === "source" && scopeId === s.id}
            label={s.name}
            title={s.lastError ?? hostOf(s.siteUrl ?? s.url)}
            count={s.unread}
            icon={<FeedIcon source={s} />}
            badge={s.pinned ? <Pin size={10} className="shrink-0 text-subtle" /> : null}
            onClick={() => onSelect("source", s.id)}
            onContextMenu={(at) => onContextMenu({ kind: "source", source: s, at })}
          />
        ))}

        {sources.length === 0 && (
          <p className="px-3 py-6 text-[12px] leading-relaxed text-subtle">
            No feeds yet. Add one with <span className="text-foreground">+</span>, or start from the
            welcome page. Right-click a feed later to rename, move or delete it.
          </p>
        )}
      </div>
    </aside>
  )
}
