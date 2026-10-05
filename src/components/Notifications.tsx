import { useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { AlertTriangle, ArrowUpCircle, Bell, Bot, Newspaper, RefreshCw, Trash2, X } from "lucide-react"
import { listen } from "@tauri-apps/api/event"
import { openUrl } from "@tauri-apps/plugin-opener"
import { api, type AppNotification, type NotificationSummary } from "@/lib/api"
import { Menu } from "@/components/Menu"
import { useDismissible } from "@/lib/presence"
import { cn, relativeTime } from "@/lib/utils"

/** A short history plus what needs attention: failing feeds and an update. */
function useSummary() {
  const [summary, setSummary] = useState<NotificationSummary | null>(null)
  const load = useCallback(() => {
    api.notificationsSummary().then(setSummary).catch(() => undefined)
  }, [])
  useEffect(() => {
    load()
    const offs = [listen("notifications-changed", load), listen("feeds-updated", load)]
    return () => {
      for (const off of offs) void off.then((fn) => fn())
    }
  }, [load])
  return { summary, reload: load }
}

function KindIcon({ n }: { n: AppNotification }) {
  if (n.kind === "agent") return <Bot size={14} className="mt-px shrink-0 text-subtle" />
  return <Newspaper size={14} className="mt-px shrink-0 text-subtle" />
}

function Entry({
  n,
  onOpen,
  onRemove,
}: {
  n: AppNotification
  onOpen?: (n: AppNotification) => void
  onRemove?: (n: AppNotification) => void
}) {
  return (
    <li className="group flex items-start gap-2.5 rounded-lg px-2.5 py-2 hover:bg-secondary" data-notification>
      <KindIcon n={n} />
      <button
        type="button"
        onClick={() => onOpen?.(n)}
        disabled={!onOpen || n.sourceId === null}
        className="min-w-0 flex-1 text-left disabled:cursor-default"
      >
        <span className={cn("block text-[12.5px] leading-snug", n.seen ? "text-muted-foreground" : "text-foreground")}>
          {!n.seen && <span className="mr-1.5 inline-block h-1.5 w-1.5 -translate-y-px rounded-full bg-unread align-middle" />}
          {n.title}
        </span>
        {n.body && <span className="mt-0.5 block text-[11.5px] leading-relaxed text-subtle">{n.body}</span>}
      </button>
      <span className="tabular shrink-0 pt-px text-[11px] text-subtle">{relativeTime(n.created)}</span>
      {onRemove && (
        <button
          type="button"
          onClick={() => onRemove(n)}
          aria-label="Remove"
          title="Remove"
          className="row -mr-1 grid h-6 w-6 shrink-0 place-items-center text-subtle opacity-0 hover:bg-elevated hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
        >
          <X size={12} />
        </button>
      )}
    </li>
  )
}

/** What needs you now: a new version, feeds that keep failing. Worked out
    live rather than stored, so the bell and View all both show it. */
function Attention({
  update,
  failing,
  onDone,
  onOpenFeed,
  onRefresh,
}: {
  update: { latest: string; url: string } | null
  failing: NotificationSummary["failing"]
  onDone: () => void
  onOpenFeed: (id: number) => void
  onRefresh: () => void
}) {
  return (
    <section className="p-1.5">
      <div className="flex items-center justify-between pl-2.5 pr-1">
        <p className="pb-1 pt-1 text-[11px] font-medium uppercase tracking-wider text-subtle">Needs attention</p>
        {failing.length > 0 && (
          <button
            type="button"
            onClick={() => {
              onDone()
              onRefresh()
            }}
            title="Retry every feed"
            aria-label="Retry every feed"
            className="row grid h-6 w-6 place-items-center text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <RefreshCw size={12} />
          </button>
        )}
      </div>
      <ul>
        {update && (
          <li className="flex items-start gap-2.5 rounded-lg px-2.5 py-2">
            <ArrowUpCircle size={14} className="mt-px shrink-0 text-system" />
            <span className="min-w-0 flex-1 text-[12.5px] text-foreground">
              Turbo Reader <span className="tabular">{update.latest}</span> is out
            </span>
            <button
              type="button"
              onClick={() => {
                onDone()
                void openUrl(update.url)
              }}
              className="row h-6 shrink-0 px-2 text-[11.5px] text-system hover:bg-secondary"
            >
              Get it
            </button>
          </li>
        )}
        {failing.map((f) => (
          <li key={f.id} className="flex items-start gap-2.5 rounded-lg px-2.5 py-2" data-failing-feed>
            <AlertTriangle size={14} className="mt-px shrink-0 text-destructive" />
            <button
              type="button"
              onClick={() => {
                onDone()
                onOpenFeed(f.id)
              }}
              className="min-w-0 flex-1 text-left"
            >
              <span className="block truncate text-[12.5px] text-foreground">{f.name} is failing</span>
              <span className="block truncate text-[11.5px] text-subtle" title={f.error}>
                {f.error}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * The bell in the title bar. A dot when something new landed; a number when
 * something needs you (a feed that keeps failing, an update). The panel shows
 * what needs attention, then the latest few entries, with View all for the rest.
 */
export function NotificationBell({
  update,
  onOpenFeed,
  onRefresh,
}: {
  update: { latest: string; url: string } | null
  onOpenFeed: (id: number) => void
  onRefresh: () => void
}) {
  const { summary, reload } = useSummary()
  const [allOpen, setAllOpen] = useState(false)
  const failing = summary?.failing ?? []
  const attention = failing.length + (update ? 1 : 0)
  const unseen = summary?.unseen ?? 0

  return (
    <>
      <Menu
        width={380}
        label="Notifications"
        role="dialog"
        trigger={({ open, toggle }) => (
          <button
            type="button"
            onClick={() => {
              toggle()
              if (!open && unseen > 0) {
                // Opening is seeing; the dot clears, the entries stay.
                void api.notificationsMarkSeen().then(reload)
              }
            }}
            title={attention ? `${attention} need${attention === 1 ? "s" : ""} attention` : "Notifications"}
            aria-label="Notifications"
            className={cn(
              "row relative grid h-7 w-7 place-items-center hover:bg-secondary hover:text-foreground",
              open ? "bg-secondary text-foreground" : "text-muted-foreground",
            )}
          >
            <Bell size={14} />
            {attention > 0 ? (
              <span
                className="tabular absolute -right-0.5 -top-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-destructive px-[3px] text-[9px] font-semibold leading-none text-destructive-foreground"
                data-bell-count
              >
                {attention > 9 ? "9+" : attention}
              </span>
            ) : unseen > 0 ? (
              <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-unread" data-bell-dot />
            ) : null}
          </button>
        )}
      >
        {(close) => (
          <div className="-m-1 flex max-h-[min(520px,70vh)] flex-col" data-bell-panel>
            <div className="min-h-0 flex-1 overflow-y-auto">
            {attention > 0 && (
              <Attention update={update} failing={failing} onDone={close} onOpenFeed={onOpenFeed} onRefresh={onRefresh} />
            )}

            <section className={cn("p-1.5", attention > 0 && "border-t border-border")}>
              <p className="px-2.5 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wider text-subtle">Recent</p>
              {summary && summary.recent.length > 0 ? (
                <ul>
                  {summary.recent.map((n) => (
                    <Entry
                      key={n.id}
                      n={n}
                      onOpen={(x) => {
                        close()
                        if (x.sourceId !== null) onOpenFeed(x.sourceId)
                      }}
                    />
                  ))}
                </ul>
              ) : (
                <p className="px-2.5 pb-2 pt-1 text-[12px] leading-relaxed text-subtle">
                  Nothing yet. Refreshes that find articles while you are away, and changes AI agents make, show up
                  here.
                </p>
              )}
            </section>

            </div>

            <div className="flex shrink-0 items-center justify-between border-t border-border px-2 py-1.5">
              <button
                type="button"
                onClick={() => {
                  close()
                  setAllOpen(true)
                }}
                className="row h-7 px-2 text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                View all
              </button>
              {summary && summary.recent.length > 0 && (
                <button
                  type="button"
                  onClick={() => void api.notificationsClear().then(reload)}
                  className="row h-7 px-2 text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>
        )}
      </Menu>
      {allOpen && (
        <AllNotifications
          onClose={() => {
            setAllOpen(false)
            reload()
          }}
          onOpenFeed={onOpenFeed}
          update={update}
          failing={failing}
          onRefresh={onRefresh}
        />
      )}
    </>
  )
}

/** Every kept entry, newest first, a page at a time. Rendered at the top of
    the page: the title bar's backdrop blur would otherwise become the box this
    centres in, and the window would sit in a 40 pixel strip. */
function AllNotifications({
  onClose,
  onOpenFeed,
  update,
  failing,
  onRefresh,
}: {
  onClose: () => void
  onOpenFeed: (id: number) => void
  update: { latest: string; url: string } | null
  failing: NotificationSummary["failing"]
  onRefresh: () => void
}) {
  const { closing, dismiss } = useDismissible(onClose)
  const [items, setItems] = useState<AppNotification[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const attention = update !== null || failing.length > 0

  const more = useCallback(async (before?: number) => {
    setLoading(true)
    try {
      const page = await api.notificationsPage(before)
      setItems((prev) => (before === undefined ? page.items : [...prev, ...page.items]))
      setHasMore(page.hasMore)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void more()
  }, [more])

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => ev.key === "Escape" && dismiss()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [dismiss])

  return createPortal(
    <div
      className={cn("fixed inset-0 z-60 grid place-items-center bg-black/50 p-6", closing ? "animate-fade-out" : "animate-fade")}
      onClick={dismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="notifications-title"
        className={cn(
          "flex max-h-[min(640px,calc(100vh-96px))] w-full max-w-[560px] flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-float",
          closing ? "animate-pop-out" : "animate-pop",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-border px-5">
          <h2 id="notifications-title" className="text-[14px] font-semibold tracking-tight">
            Notifications
          </h2>
          <div className="flex items-center gap-0.5">
            {items.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  void api.notificationsClear().then(() => {
                    setItems([])
                    setHasMore(false)
                  })
                }
                className="row flex h-7 items-center gap-1.5 px-2 text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <Trash2 size={12} />
                Clear all
              </button>
            )}
            <button
              type="button"
              onClick={dismiss}
              title="Close (Esc)"
              aria-label="Close notifications"
              className="row grid h-7 w-7 place-items-center text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X size={14} />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {attention && (
            <div className="-m-2 mb-2 border-b border-border p-2">
              <Attention update={update} failing={failing} onDone={dismiss} onOpenFeed={onOpenFeed} onRefresh={onRefresh} />
            </div>
          )}
          {attention && (
            <p className="px-2.5 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wider text-subtle">History</p>
          )}
          {items.length === 0 && !loading ? (
            <p className={cn("px-3 text-center text-[12px] leading-relaxed text-subtle", attention ? "py-6" : "py-10")}>
              No history yet. Refreshes that find articles while you are away, and changes AI agents make, show up
              here.
            </p>
          ) : (
            <ul>
              {items.map((n) => (
                <Entry
                  key={n.id}
                  n={n}
                  onOpen={(x) => {
                    if (x.sourceId === null) return
                    dismiss()
                    onOpenFeed(x.sourceId)
                  }}
                  onRemove={(x) => {
                    void api.notificationsRemove(x.id)
                    setItems((prev) => prev.filter((p) => p.id !== x.id))
                  }}
                />
              ))}
            </ul>
          )}
          {hasMore && (
            <div className="flex justify-center py-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => void more(items[items.length - 1]?.id)}
                className="row flex h-8 items-center px-3 text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
              >
                {loading ? "Loading" : "Load more"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
