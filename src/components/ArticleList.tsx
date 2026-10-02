import { Search, SortDesc, SortAsc, CheckCheck, Star, Copy } from "lucide-react"
import type { ItemSummary } from "@/lib/api"
import { cn, relativeTime } from "@/lib/utils"

type Props = {
  items: ItemSummary[]
  selectedId: number | null
  search: string
  sort: "newest" | "oldest"
  unreadOnly: boolean
  hideDuplicates: boolean
  loading: boolean
  onSelect: (item: ItemSummary) => void
  onSearch: (q: string) => void
  onToggleSort: () => void
  onToggleUnread: () => void
  onToggleDuplicates: () => void
  onMarkAllRead: () => void
  onStar: (item: ItemSummary) => void
}

export function ArticleList(p: Props) {
  return (
    <section className="flex h-full w-[380px] shrink-0 flex-col border-r border-border bg-background">
      <div className="flex items-center gap-1.5 border-b border-border px-2 py-2">
        <div className="relative flex-1">
          <Search
            size={13}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-subtle"
          />
          <input
            value={p.search}
            onChange={(e) => p.onSearch(e.target.value)}
            placeholder="Search articles"
            className="h-7 w-full rounded-md border border-transparent bg-secondary pl-7 pr-2 text-[12px] outline-none placeholder:text-subtle focus:border-system"
          />
        </div>
        <button
          type="button"
          onClick={p.onToggleUnread}
          title={p.unreadOnly ? "Showing unread only" : "Showing all articles"}
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
          title={p.hideDuplicates ? "Duplicates hidden" : "Duplicates shown"}
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
          title={p.sort === "newest" ? "Newest first" : "Oldest first"}
          className="row grid h-7 w-7 place-items-center text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          {p.sort === "newest" ? <SortDesc size={14} /> : <SortAsc size={14} />}
        </button>
        <button
          type="button"
          onClick={p.onMarkAllRead}
          title="Mark all as read"
          className="row grid h-7 w-7 place-items-center text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <CheckCheck size={14} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {p.items.map((it) => {
          const active = it.id === p.selectedId
          return (
            <article
              key={it.id}
              onClick={() => p.onSelect(it)}
              className={cn(
                "relative cursor-pointer border-b border-border/60 px-3 py-2.5 transition-colors duration-150 ease-in-out",
                active ? "bg-elevated" : "hover:bg-secondary/70",
              )}
            >
              {active && <span className="absolute left-0 top-0 h-full w-[2px] bg-system" />}
              <div className="flex items-start gap-2.5">
                {!it.read && (
                  <span className="mt-[7px] block h-1.5 w-1.5 shrink-0 rounded-full bg-system" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[11px] text-subtle">
                    <span className="truncate">{it.sourceName}</span>
                    <span aria-hidden>·</span>
                    <span className="tabular shrink-0">{relativeTime(it.published)}</span>
                    <div className="flex-1" />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        p.onStar(it)
                      }}
                      title={it.starred ? "Unstar" : "Star"}
                      className="shrink-0 opacity-70 hover:opacity-100"
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
                      it.read
                        ? "font-normal text-muted-foreground"
                        : "font-medium text-foreground",
                    )}
                  >
                    {it.title}
                  </h3>
                  {it.snippet && (
                    <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-subtle">
                      {it.snippet}
                    </p>
                  )}
                </div>
                {it.thumbnail && (
                  <img
                    src={it.thumbnail}
                    alt=""
                    loading="lazy"
                    className="h-14 w-14 shrink-0 rounded-md object-cover"
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
          <p className="px-4 py-10 text-center text-[12px] text-subtle">Nothing here yet.</p>
        )}
      </div>
    </section>
  )
}
