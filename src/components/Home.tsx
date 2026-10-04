import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowRight, Pin, Search, SlidersHorizontal, Star } from "lucide-react"
import { api, type BandLayout, type Home as HomeData, type HomeItem, type Scope } from "@/lib/api"
import {
  CARD_WIDTH,
  HOME_DEFAULTS,
  WINDOWS,
  ordered,
  useNow,
  type CardSize,
  type HomePrefs,
  type Section,
} from "@/lib/home"
import { cn, relativeTime } from "@/lib/utils"
import { FeedIcon } from "@/components/FeedIcon"
import { CoverFallback } from "@/components/CoverFallback"

type Props = {
  prefs: HomePrefs
  onPrefs: (next: HomePrefs) => void
  /** Open the home section of Settings. */
  onCustomize: () => void
  onOpen: (item: HomeItem) => void
  onStar: (item: HomeItem) => void
  onScope: (scope: Scope, id: number | null) => void
  /** Bumped by the app whenever a refresh lands, so the page reloads. */
  revision: number
}

export function Home({ prefs, onPrefs, onCustomize, onOpen, onStar, onScope, revision }: Props) {
  const [data, setData] = useState<HomeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<HomeItem[] | null>(null)
  const searchTimer = useRef<number | null>(null)
  const now = useNow(prefs.seconds, prefs.clock)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(
        await api.home({
          window: prefs.window,
          perBand: prefs.perBand,
          masthead: prefs.masthead,
        }),
      )
    } finally {
      setLoading(false)
    }
  }, [prefs.window, prefs.perBand, prefs.masthead])

  useEffect(() => {
    void load()
  }, [load, revision])

  // Search replaces the bands while a query is live, and uses the same
  // list_items call the article list does. One search path, not two.
  useEffect(() => {
    if (searchTimer.current) window.clearTimeout(searchTimer.current)
    const q = query.trim()
    if (!q) {
      setResults(null)
      return
    }
    searchTimer.current = window.setTimeout(async () => {
      const rows = await api.listItems({ scope: "all", search: q, limit: 60 })
      setResults(
        rows.map((r) => ({
          id: r.id,
          sourceId: r.sourceId,
          sourceName: r.sourceName,
          title: r.title,
          link: r.link,
          published: r.published,
          snippet: r.snippet,
          thumbnail: r.thumbnail,
          read: r.read,
          starred: r.starred,
          why: "",
        })),
      )
    }, 180)
    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current)
    }
  }, [query])

  const bands = useMemo(
    () =>
      ordered(
        (data?.bands ?? []).filter(
          (b) => !prefs.hiddenGroups.includes(String(b.groupId ?? "none")),
        ),
        (b) => String(b.groupId ?? "none"),
        prefs.groupOrder,
      ),
    [data, prefs.hiddenGroups, prefs.groupOrder],
  )

  const dateLine = now.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  })
  const timeLine = now.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    ...(prefs.seconds ? { second: "2-digit" } : {}),
  })

  const topHeadline = bands[0]?.items[0] ?? null

  // One block per section, so the reader's order decides the page. While a
  // search is live its results stand in for pinned feeds and categories.
  const sections: Record<Section, React.ReactNode> = {
    glance: (
      <>
        {/* Glance */}
        {prefs.bands.glance && data && (
          <div className="animate-rise mt-7 flex flex-wrap items-end gap-x-8 gap-y-4">
            {WINDOWS.map((w) => (
              <button
                key={w.value}
                type="button"
                onClick={() => onPrefs({ ...prefs, window: w.value })}
                className={cn(
                  "group text-left transition-colors duration-150 ease-out",
                  prefs.window === w.value ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <span className="tabular block text-[1.6rem] font-semibold leading-none tracking-tight">
                  {data.counts[w.countKey].toLocaleString()}
                </span>
                <span
                  className={cn(
                    "mt-1.5 block text-[11px] uppercase tracking-wider",
                    prefs.window === w.value
                      ? "text-system"
                      : "text-subtle group-hover:text-muted-foreground",
                  )}
                >
                  {w.label}
                </span>
              </button>
            ))}
            <div className="flex-1" />
            <Sparkline buckets={data.buckets} />
          </div>
        )}
      </>
    ),
    search: (
      <>
        {/* Search */}
        {prefs.bands.search && (
          <div className="animate-rise relative mt-7">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle"
            />
            <input
              id="turbo-home-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setQuery("")}
              placeholder="Search everything"
              className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-[13px] outline-hidden transition-colors duration-150 ease-out placeholder:text-subtle focus:border-system"
            />
          </div>
        )}
        {results && (
          <div className="mt-6">
            <SectionHead title={`${results.length} result${results.length === 1 ? "" : "s"}`} />
            {results.length === 0 ? (
              <p className="py-10 text-center text-[12px] text-subtle">
                Nothing in your feeds matches that.
              </p>
            ) : (
              <Headlines items={results} onOpen={onOpen} onStar={onStar} />
            )}
          </div>
        )}
      </>
    ),
    pinned: !results && (
      <>
        {/* Pinned */}
        {prefs.bands.pinned && (data?.pinned.length ?? 0) > 0 && (
          <div className="animate-rise mt-7">
            <SectionHead title="Pinned" icon={<Pin size={12} />} />
            <div className="mt-2.5 flex flex-wrap gap-2">
              {data!.pinned.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onScope("source", p.id)}
                  className={cn(
                    "row flex h-9 items-center gap-2 border border-border bg-card px-3 text-[12.5px]",
                    "transition-[translate,border-color] duration-200 ease-out",
                    "hover:translate-y-[-2px] hover:border-system/60 active:translate-y-0",
                  )}
                >
                  <FeedIcon source={{ name: p.name, iconUrl: p.iconUrl }} size={14} />
                  <span className="max-w-[18ch] truncate">{p.name}</span>
                  {p.unread > 0 && (
                    <span className="tabular rounded-full bg-secondary px-1.5 text-[10.5px] text-muted-foreground">
                      {p.unread > 999 ? "999+" : p.unread}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </>
    ),
    categories: !results && (
      <>
        {/* Categories */}
        {prefs.bands.categories &&
          bands.map((band, i) => (
            <div
              key={`${band.groupId ?? "none"}`}
              className="animate-rise mt-9"
              style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
            >
              <SectionHead
                title={band.name}
                count={band.unread}
                action={
                  band.groupId !== null ? (
                    <button
                      type="button"
                      onClick={() => onScope("group", band.groupId!)}
                      className="flex items-center gap-1 text-[12px] text-subtle transition-colors duration-150 hover:text-foreground"
                    >
                      See all
                      <ArrowRight size={12} />
                    </button>
                  ) : undefined
                }
              />
              <BandBody
                layout={band.layout}
                size={prefs.cardSize}
                items={band.items}
                onOpen={onOpen}
                onStar={onStar}
              />
            </div>
          ))}
      </>
    ),
  }

  return (
    <section className="min-h-0 flex-1 overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-[1180px] px-6 pb-16 pt-7">
        {/* Masthead */}
        <header className="animate-rise flex items-start justify-between gap-6">
          <div className="min-w-0">
            <h1 className="text-[1.45rem] font-semibold leading-tight tracking-tight">
              {dateLine}
            </h1>
            {prefs.masthead === "quote" && data?.quote && (
              <p className="mt-1.5 max-w-[62ch] text-[12.5px] leading-relaxed text-muted-foreground">
                {data.quote.text}
                {data.quote.author && <span className="text-subtle"> {data.quote.author}</span>}
              </p>
            )}
            {prefs.masthead === "headline" && topHeadline && (
              <button
                type="button"
                onClick={() => onOpen(topHeadline)}
                className="mt-1.5 max-w-[62ch] text-left text-[12.5px] leading-relaxed text-muted-foreground hover:text-foreground"
              >
                {topHeadline.title}
                <span className="text-subtle"> {topHeadline.sourceName}</span>
              </button>
            )}
          </div>
          {/* The clock, with Customize as a quiet action under it, both set
              to the same right edge. */}
          <div className={cn("flex shrink-0 flex-col items-end", prefs.clock ? "gap-1" : "pt-1")}>
            {prefs.clock && (
              <time className="tabular text-[1.45rem] font-medium leading-tight tracking-tight text-muted-foreground">
                {timeLine}
              </time>
            )}
            <button
              type="button"
              onClick={onCustomize}
              title="Customize home"
              className="row -mr-2 flex h-7 items-center gap-1.5 px-2 text-[12px] text-subtle transition-colors duration-150 ease-out hover:bg-secondary hover:text-foreground"
            >
              <SlidersHorizontal size={13} />
              Customize
            </button>
          </div>
        </header>

        {prefs.order.map((key) => (
          <Fragment key={key}>{sections[key]}</Fragment>
        ))}

        {!results && !loading && bands.length === 0 && (data?.pinned.length ?? 0) === 0 && (
          <p className="animate-rise py-16 text-center text-[12px] leading-relaxed text-subtle">
            Nothing published in this window.
            <br />
            Try a wider one, or refresh with <span className="text-foreground">r</span>.
          </p>
        )}
      </div>
    </section>
  )
}

function SectionHead({
  title,
  count,
  icon,
  action,
}: {
  title: string
  count?: number
  icon?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-baseline gap-2 border-b border-border pb-2">
      {icon && <span className="text-subtle">{icon}</span>}
      <h2 className="text-[13px] font-semibold tracking-tight text-foreground">{title}</h2>
      {count ? (
        <span className="tabular text-[11.5px] text-subtle">
          {count > 999 ? "999+" : count} unread
        </span>
      ) : null}
      <div className="flex-1" />
      {action}
    </div>
  )
}

function BandBody({
  layout,
  size,
  items,
  onOpen,
  onStar,
}: {
  layout: BandLayout
  size: CardSize
  items: HomeItem[]
  onOpen: (i: HomeItem) => void
  onStar: (i: HomeItem) => void
}) {
  if (layout === "headlines") return <Headlines items={items} onOpen={onOpen} onStar={onStar} />
  if (layout === "magazine") return <Magazine items={items} onOpen={onOpen} onStar={onStar} />
  return <Grid layout={layout} size={size} items={items} onOpen={onOpen} onStar={onStar} />
}

/** Cards, compact cards, or a mosaic where the lead takes four tiles. */
function Grid({
  layout,
  size,
  items,
  onOpen,
  onStar,
}: {
  layout: BandLayout
  size: CardSize
  items: HomeItem[]
  onOpen: (i: HomeItem) => void
  onStar: (i: HomeItem) => void
}) {
  const mosaic = layout === "mosaic"
  const widths = CARD_WIDTH[size]
  const min = layout === "compact" ? widths.compact : mosaic ? widths.mosaic : widths.cards
  return (
    <div
      className="mt-3 grid gap-4"
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`,
        gridAutoRows: mosaic ? "minmax(0, auto)" : undefined,
      }}
    >
      {items.map((it, i) => (
        <Card
          key={it.id}
          item={it}
          onOpen={onOpen}
          onStar={onStar}
          cover={layout !== "compact"}
          lead={mosaic && i === 0}
        />
      ))}
    </div>
  )
}

/** One story given room, with the rest as a column of headlines beside it.
    This is the layout for a category you actually read rather than scan. */
function Magazine({
  items,
  onOpen,
  onStar,
}: {
  items: HomeItem[]
  onOpen: (i: HomeItem) => void
  onStar: (i: HomeItem) => void
}) {
  const [lead, ...rest] = items
  if (!lead) return null
  return (
    <div className="mt-3 grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <article
        title={lead.why}
        onClick={() => onOpen(lead)}
        className={cn(
          "group flex cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-card shadow-card",
          "transition-[translate,box-shadow] duration-200 ease-out",
          "hover:translate-y-[-3px] hover:shadow-float active:translate-y-0 active:duration-100",
          lead.read && "opacity-[0.72]",
        )}
      >
        <Cover item={lead} aspect="16/9" />
        <div className="p-4">
          <Meta item={lead} onStar={onStar} />
          <h3
            className={cn(
              "mt-2 line-clamp-3 text-[1.08rem] font-semibold leading-tight tracking-tight",
              lead.read ? "text-muted-foreground" : "text-foreground",
            )}
          >
            {lead.title}
          </h3>
          {lead.snippet && (
            <p className="snippet mt-2 line-clamp-3 text-[12.5px] leading-relaxed text-subtle">
              {lead.snippet}
            </p>
          )}
        </div>
      </article>

      <div className="min-w-0">
        <Headlines items={rest} onOpen={onOpen} onStar={onStar} />
      </div>
    </div>
  )
}

function Card({
  item,
  onOpen,
  onStar,
  cover,
  lead,
}: {
  item: HomeItem
  onOpen: (i: HomeItem) => void
  onStar: (i: HomeItem) => void
  cover: boolean
  lead?: boolean
}) {
  return (
    <article
      title={item.why}
      onClick={() => onOpen(item)}
      style={lead ? { gridColumn: "span 2", gridRow: "span 2" } : undefined}
      className={cn(
        "group flex cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-card shadow-card",
        "transition-[translate,box-shadow] duration-200 ease-out",
        "hover:translate-y-[-3px] hover:shadow-float active:translate-y-0 active:duration-100",
        item.read && "opacity-[0.72]",
      )}
    >
      {cover && <Cover item={item} aspect={lead ? "16/9" : "16/10"} />}
      <div className="flex flex-1 flex-col p-3.5">
        <Meta item={item} onStar={onStar} />
        <h3
          className={cn(
            "mt-2 line-clamp-3 leading-snug tracking-tight",
            lead ? "text-[1.02rem]" : "text-[13px]",
            item.read ? "font-normal text-muted-foreground" : "font-semibold text-foreground",
          )}
        >
          {item.title}
        </h3>
        {(!cover || lead) && item.snippet && (
          <p className="snippet mt-2 line-clamp-4 text-[12px] leading-relaxed text-subtle">
            {item.snippet}
          </p>
        )}
      </div>
    </article>
  )
}

/** The article's own image, or a tinted panel standing in for it. Every card
    in a row keeps the same shape either way, which is the point: a grid with
    holes punched in it looks broken, not minimal. */
function Cover({ item, aspect }: { item: HomeItem; aspect: string }) {
  const [failed, setFailed] = useState(false)

  if (!item.thumbnail || failed) {
    return <CoverFallback source={{ name: item.sourceName, iconUrl: null }} aspect={aspect} />
  }
  return (
    <div style={{ aspectRatio: aspect }} className="w-full overflow-hidden bg-secondary">
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

function Headlines({
  items,
  onOpen,
  onStar,
}: {
  items: HomeItem[]
  onOpen: (i: HomeItem) => void
  onStar: (i: HomeItem) => void
}) {
  return (
    <ol className="mt-1">
      {items.map((it, i) => (
        <li key={it.id}>
          <div
            title={it.why}
            onClick={() => onOpen(it)}
            className={cn(
              "group flex cursor-pointer items-baseline gap-3 border-b border-border/60 py-2.5",
              "transition-colors duration-150 ease-in-out hover:bg-secondary/60",
              it.read && "opacity-[0.75]",
            )}
          >
            <span className="tabular w-5 shrink-0 text-right text-[11px] text-subtle">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <h3
                className={cn(
                  "line-clamp-2 text-[13px] leading-snug tracking-tight",
                  it.read ? "font-normal text-muted-foreground" : "font-medium text-foreground",
                )}
              >
                {it.title}
              </h3>
              <div className="mt-1">
                <Meta item={it} onStar={onStar} />
              </div>
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}

function Meta({ item, onStar }: { item: HomeItem; onStar: (i: HomeItem) => void }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-subtle">
      {!item.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-system" />}
      <span className="truncate">{item.sourceName}</span>
      <span aria-hidden>·</span>
      <span className="tabular shrink-0">{relativeTime(item.published)}</span>
      <div className="flex-1" />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onStar(item)
        }}
        title={item.starred ? "Unstar" : "Star"}
        className={cn(
          "shrink-0 transition-opacity duration-150 hover:opacity-100",
          item.starred ? "opacity-100" : "opacity-0 group-hover:opacity-70",
        )}
      >
        <Star size={12} className={item.starred ? "fill-starred text-starred" : undefined} />
      </button>
    </div>
  )
}

/** Fourteen days of article counts. Empty days are present as zero, so the
    shape is honest rather than flattering. */
function Sparkline({ buckets }: { buckets: { day: number; count: number }[] }) {
  if (buckets.length === 0) return null
  const max = Math.max(1, ...buckets.map((b) => b.count))
  return (
    <div
      className="flex h-9 items-end gap-[3px]"
      title={`Articles per day, last ${buckets.length} days`}
    >
      {buckets.map((b, i) => (
        <div
          key={b.day}
          className={cn(
            "w-[5px] rounded-sm transition-colors duration-150",
            i === buckets.length - 1 ? "bg-system" : "bg-elevated",
          )}
          style={{ height: `${Math.max(3, (b.count / max) * 36)}px` }}
          title={`${new Date(b.day * 1000).toLocaleDateString(undefined, {
            day: "numeric",
            month: "short",
          })}: ${b.count}`}
        />
      ))}
    </div>
  )
}

export { HOME_DEFAULTS }
