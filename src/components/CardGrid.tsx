import { useEffect, useRef, useState } from "react"
import { EyeOff, Star } from "lucide-react"
import type { ItemSummary, Source } from "@/lib/api"
import { MarkAllMenu, ViewControls } from "@/components/ArticleList"
import { cn, relativeTime } from "@/lib/utils"
import { FeedIcon } from "@/components/FeedIcon"
import { CoverFallback } from "@/components/CoverFallback"

type Props = {
  items: ItemSummary[]
  sources: Source[]
  loading: boolean
  /** Changes whenever the shown set changes, which resets the scroll position. */
  scopeKey: string
  onSelect: (item: ItemSummary) => void
  onStar: (item: ItemSummary) => void
  onHide: (item: ItemSummary) => void
  /** The list's name, with the mark-all menu beside it. */
  title: string
  onMarkAllRead: (olderThanDays?: number) => void
  onMarkAllUnread: () => void
  unreadOnly: boolean
  hideDuplicates: boolean
  sort: "newest" | "oldest"
  onToggleUnread: () => void
  onToggleDuplicates: () => void
  onToggleSort: () => void
}

/** Grid of article cards with cover art. The counterpart to the dense list;
    this is the view for browsing rather than working through a backlog. */
/** The article's image, or a tinted panel standing in for it. A card that
    collapsed its cover would leave a hole in the row; one that kept an empty
    grey box would look broken. */
function Cover({ item }: { item: ItemSummary }) {
  const [failed, setFailed] = useState(false)
  if (!item.thumbnail || failed) {
    return <CoverFallback source={{ name: item.sourceName, iconUrl: null }} />
  }
  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden bg-secondary">
      <img
        src={item.thumbnail}
        alt=""
        loading="lazy"
        className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.035]"
        onError={() => setFailed(true)}
      />
    </div>
  )
}

export function CardGrid({
  items,
  sources,
  loading,
  scopeKey,
  onSelect,
  onStar,
  onHide,
  title,
  onMarkAllRead,
  onMarkAllUnread,
  ...view
}: Props) {
  const scroller = useRef<HTMLElement>(null)

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
  }, [scopeKey])

  return (
    <section ref={scroller} className="min-h-0 flex-1 overflow-y-auto bg-background">
      <div className="flex items-center justify-between gap-3 px-[var(--card-pad)] pt-[var(--card-pad)]">
        <h2 className="min-w-0 truncate text-[15px] font-semibold tracking-tight text-foreground" data-card-title>
          {title}
        </h2>
        <div className="flex shrink-0 items-center gap-0.5">
          <ViewControls {...view} />
          <MarkAllMenu onMarkAllRead={onMarkAllRead} onMarkAllUnread={onMarkAllUnread} />
        </div>
      </div>
      <div
        className="grid gap-[var(--card-gap)] px-[var(--card-pad)] pb-[var(--card-pad)] pt-3"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(var(--card-min), 1fr))" }}
      >
        {items.map((it, i) => {
          const source = sources.find((s) => s.id === it.sourceId)
          return (
            <article
              key={it.id}
              onClick={() => onSelect(it)}
              // Cards near the top of a fresh list rise in; the rest appear
              // already settled, so scrolling never chases a running animation.
              className={cn(
                "group relative flex cursor-pointer flex-col overflow-hidden rounded-xl",
                "border border-border bg-card shadow-card",
                "transition-[transform,box-shadow,border-color] duration-200 ease-out",
                "hover:-translate-y-[3px] hover:border-border hover:shadow-float",
                "active:translate-y-0 active:duration-100",
                it.read && "opacity-[0.72]",
                i < 18 && "animate-card",
              )}
              style={i < 18 ? { animationDelay: `${Math.min(i, 12) * 18}ms` } : undefined}
            >
              <Cover item={it} />

              <div className="flex min-h-0 flex-1 flex-col p-[var(--card-inset)]">
                <div className="flex items-center gap-1.5 text-[11px] text-subtle">
                  {source ? (
                    <FeedIcon source={source} size={13} />
                  ) : (
                    !it.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-system" />
                  )}
                  <span className="truncate">{it.sourceName}</span>
                  <span aria-hidden>·</span>
                  <span className="tabular shrink-0">{relativeTime(it.published)}</span>
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onHide(it)
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
                      onStar(it)
                    }}
                    title={it.starred ? "Unstar" : "Star"}
                    className={cn(
                      "shrink-0 transition-opacity duration-150 hover:opacity-100 focus-visible:opacity-100",
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
                    "mt-2 line-clamp-3 text-[13.5px] leading-snug tracking-tight",
                    it.read ? "font-normal text-muted-foreground" : "font-semibold text-foreground",
                  )}
                >
                  {it.title}
                </h3>

                {!it.thumbnail && it.snippet && (
                  <p className="snippet mt-2 line-clamp-4 text-[12px] leading-relaxed text-subtle">
                    {it.snippet}
                  </p>
                )}
              </div>
            </article>
          )
        })}
      </div>

      {!loading && items.length === 0 && (
        <p className="animate-rise px-4 py-16 text-center text-[12px] text-subtle">
          Nothing here yet.
        </p>
      )}
    </section>
  )
}
