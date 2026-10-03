import { useEffect, useRef } from "react"
import { Search, SortDesc, SortAsc, CheckCheck, Star, Copy, EyeOff } from "lucide-react"
import type { ItemSummary } from "@/lib/api"
import { cn, relativeTime } from "@/lib/utils"
import { Menu, MenuItem, MenuSeparator } from "@/components/Menu"
import { FeedIcon } from "@/components/FeedIcon"

type Props = {
  items: ItemSummary[]
  sources: { id: number; name: string; iconUrl: string | null; lastError: string | null }[]
  selectedId: number | null
  search: string
  sort: "newest" | "oldest"
  unreadOnly: boolean
  hideDuplicates: boolean
  loading: boolean
  /** Changes whenever the shown set changes, which resets the scroll position. */
  scopeKey: string
  onSelect: (item: ItemSummary) => void
  onSearch: (q: string) => void
  onToggleSort: () => void
  onToggleUnread: () => void
  onToggleDuplicates: () => void
  onMarkAllRead: (olderThanDays?: number) => void
  onStar: (item: ItemSummary) => void
  onHide: (item: ItemSummary) => void
}

export function ArticleList(p: Props) {
  const scroller = useRef<HTMLDivElement>(null)

  // Switching feed, filter or query starts a different list. Keeping the old
  // offset drops you into the middle of articles you have not seen.
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
  }, [p.scopeKey])

  return (
    <section className="flex h-full w-[380px] shrink-0 flex-col border-r border-border bg-background">
      <div className="flex items-center gap-1.5 border-b border-border px-2 py-2">
        <div className="relative flex-1">
          <Search
            size={13}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-subtle"
          />
          <input
            id="turbo-search"
            value={p.search}
            onChange={(e) => p.onSearch(e.target.value)}
            onKeyDown={(e) => {
              // Escape clears first, and only leaves the field once it is empty,
              // matching the search box on the home page.
              if (e.key === "Escape" && p.search) {
                e.preventDefault()
                e.stopPropagation()
                p.onSearch("")
              }
            }}
            placeholder="Search articles"
            className="h-7 w-full rounded-md border border-transparent bg-secondary pl-7 pr-2 text-[12px] outline-none transition-colors duration-150 ease-out placeholder:text-subtle focus:border-system"
          />
        </div>
        <button
          type="button"
          onClick={p.onToggleUnread}
          title={p.unreadOnly ? "Showing unread only (u)" : "Showing all articles (u)"}
          className={cn(
            "row grid h-7 w-7 place-items-center",
            p.unreadOnly ? "bg-elevated text-system" : "text-muted-foreground hover:bg-secondary",
          )}
        >
          <span className="block h-1.5 w-1.5 rounded-full bg-current" />
        </button>
        <button
          type="button"
          onClick={p.onToggleDuplicates}
          title={p.hideDuplicates ? "Duplicates hidden (d)" : "Duplicates shown (d)"}
          className={cn(
            "row grid h-7 w-7 place-items-center",
            p.hideDuplicates
              ? "bg-elevated text-system"
              : "text-muted-foreground hover:bg-secondary",
          )}
        >
          <Copy size={13} />
        </button>
        <button
          type="button"
          onClick={p.onToggleSort}
          title={p.sort === "newest" ? "Newest first (t)" : "Oldest first (t)"}
          className="row grid h-7 w-7 place-items-center text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          {p.sort === "newest" ? <SortDesc size={14} /> : <SortAsc size={14} />}
        </button>

        <MarkAllMenu onMarkAllRead={p.onMarkAllRead} />
      </div>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        {p.items.map((it) => {
          const active = it.id === p.selectedId
          const source = p.sources.find((s) => s.id === it.sourceId)
          return (
            <article
              key={it.id}
              onClick={() => p.onSelect(it)}
              className={cn(
                "group relative cursor-pointer border-b border-border/60 px-3 py-2.5",
                "transition-colors duration-150 ease-in-out",
                active ? "bg-elevated" : "hover:bg-secondary/70",
                it.read && !active && "opacity-[0.78]",
              )}
            >
              {active && <span className="absolute left-0 top-0 h-full w-[2px] bg-system" />}
              <div className="flex items-start gap-2.5">
                {!it.read && (
                  <span className="mt-[7px] block h-1.5 w-1.5 shrink-0 rounded-full bg-system" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[11px] text-subtle">
                    {source && <FeedIcon source={source} size={12} />}
                    <span className="truncate">{it.sourceName}</span>
                    <span aria-hidden>·</span>
                    <span className="tabular shrink-0">{relativeTime(it.published)}</span>
                    <div className="flex-1" />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        p.onHide(it)
                      }}
                      title="Hide article"
                      className="shrink-0 opacity-0 transition-opacity duration-150 hover:text-foreground group-hover:opacity-70"
                    >
                      <EyeOff size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        p.onStar(it)
                      }}
                      title={it.starred ? "Unstar" : "Star"}
                      className={cn(
                        "shrink-0 transition-opacity duration-150 hover:opacity-100",
                        it.starred ? "opacity-100" : "opacity-0 group-hover:opacity-70",
                      )}
                    >
                      <Star
                        size={12}
                        className={it.starred ? "fill-starred text-starred" : undefined}
                      />
                    </button>
                  </div>
                  <h3
                    className={cn(
                      "mt-1 line-clamp-2 text-[13px] leading-snug tracking-tight",
                      it.read ? "font-normal text-muted-foreground" : "font-medium text-foreground",
                    )}
                  >
                    {it.title}
                  </h3>
                  {it.snippet && (
                    <p className="snippet mt-1 line-clamp-2 text-[12px] leading-relaxed text-subtle">
                      {it.snippet}
                    </p>
                  )}
                </div>
                {it.thumbnail && (
                  <img
                    src={it.thumbnail}
                    alt=""
                    loading="lazy"
                    className="thumb h-14 w-14 shrink-0 rounded-md object-cover"
                    onError={(e) => {
                      ;(e.currentTarget as HTMLImageElement).style.display = "none"
                    }}
                  />
                )}
              </div>
            </article>
          )
        })}

        {!p.loading && p.items.length === 0 && (
          <p className="animate-rise px-4 py-10 text-center text-[12px] text-subtle">
            Nothing here yet.
          </p>
        )}
      </div>
    </section>
  )
}

/** Mark all as read, with the same time cuts Fluent Reader offers. */
export function MarkAllMenu({
  onMarkAllRead,
}: {
  onMarkAllRead: (olderThanDays?: number) => void
}) {
  return (
    <Menu
      label="Mark all as read"
      width={184}
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          title="Mark all as read (a)"
          className={cn(
            "row grid h-7 w-7 place-items-center hover:bg-secondary hover:text-foreground",
            open ? "bg-secondary text-foreground" : "text-muted-foreground",
          )}
        >
          <CheckCheck size={14} />
        </button>
      )}
    >
      {(close) => (
        <>
          <p className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wider text-subtle">
            Mark all as read
          </p>
          <MenuItem
            icon={<CheckCheck size={13} />}
            onClick={() => {
              close()
              onMarkAllRead()
            }}
            hint="A"
          >
            All articles
          </MenuItem>
          <MenuSeparator />
          {[1, 3, 7].map((days) => (
            <MenuItem
              key={days}
              onClick={() => {
                close()
                onMarkAllRead(days)
              }}
            >
              {days} day{days === 1 ? "" : "s"} ago
            </MenuItem>
          ))}
        </>
      )}
    </Menu>
  )
}
