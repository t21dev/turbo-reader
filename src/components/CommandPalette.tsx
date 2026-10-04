import { useEffect, useMemo, useRef, useState } from "react"
import { Folder, Search } from "lucide-react"
import { api, type Group, type ItemSummary, type Source } from "@/lib/api"
import { FeedIcon } from "@/components/FeedIcon"
import { useDismissible } from "@/lib/presence"
import { cn, hostOf, relativeTime } from "@/lib/utils"

type Hit =
  | { kind: "folder"; group: Group }
  | { kind: "source"; source: Source }
  | { kind: "article"; item: ItemSummary }
  | { kind: "all"; query: string }

const MAX_FOLDERS = 3
const MAX_SOURCES = 6
const MAX_ARTICLES = 8

function matches(q: string, ...fields: (string | null | undefined)[]) {
  return fields.some((f) => f?.toLowerCase().includes(q))
}

/**
 * Search everything from one box: folders and feeds by name or address, and
 * articles through the full-text index. Ctrl+K or the title bar opens it.
 */
export function CommandPalette({
  groups,
  sources,
  onClose,
  onFolder,
  onSource,
  onArticle,
  onSearchAll,
}: {
  groups: Group[]
  sources: Source[]
  onClose: () => void
  onFolder: (id: number) => void
  onSource: (id: number) => void
  onArticle: (item: ItemSummary) => void
  onSearchAll: (query: string) => void
}) {
  const { closing, dismiss } = useDismissible(onClose)
  const [query, setQuery] = useState("")
  const [articles, setArticles] = useState<ItemSummary[]>([])
  const [searching, setSearching] = useState(false)
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const q = query.trim().toLowerCase()

  useEffect(() => {
    input.current?.focus()
  }, [])

  // Articles come from the index, a moment after typing stops. A stale answer
  // never replaces a newer one.
  useEffect(() => {
    if (!q) {
      setArticles([])
      setSearching(false)
      return
    }
    let live = true
    setSearching(true)
    const t = window.setTimeout(() => {
      api
        .listItems({ scope: "all", search: query.trim(), hideDuplicates: true, limit: MAX_ARTICLES })
        .then((rows) => live && setArticles(rows))
        .catch(() => live && setArticles([]))
        .finally(() => live && setSearching(false))
    }, 120)
    return () => {
      live = false
      window.clearTimeout(t)
    }
  }, [q, query])

  const hits = useMemo<Hit[]>(() => {
    const folders = (q ? groups.filter((g) => matches(q, g.name)) : groups).slice(0, MAX_FOLDERS)
    const feeds = (
      q
        ? sources.filter((s) => matches(q, s.name, hostOf(s.siteUrl), hostOf(s.url)))
        : [...sources].sort((a, b) => b.unread - a.unread)
    ).slice(0, MAX_SOURCES)
    return [
      ...folders.map((group) => ({ kind: "folder" as const, group })),
      ...feeds.map((source) => ({ kind: "source" as const, source })),
      ...articles.map((item) => ({ kind: "article" as const, item })),
      ...(q ? [{ kind: "all" as const, query: query.trim() }] : []),
    ]
  }, [q, query, groups, sources, articles])

  useEffect(() => setActive(0), [q])
  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" })
  }, [active])

  function choose(hit: Hit | undefined) {
    if (!hit) return
    if (hit.kind === "folder") onFolder(hit.group.id)
    else if (hit.kind === "source") onSource(hit.source.id)
    else if (hit.kind === "article") onArticle(hit.item)
    else onSearchAll(hit.query)
    dismiss()
  }

  function onKey(ev: React.KeyboardEvent) {
    if (ev.key === "ArrowDown") {
      ev.preventDefault()
      setActive((i) => (hits.length ? (i + 1) % hits.length : 0))
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault()
      setActive((i) => (hits.length ? (i - 1 + hits.length) % hits.length : 0))
    } else if (ev.key === "Enter") {
      ev.preventDefault()
      choose(hits[active])
    } else if (ev.key === "Escape") {
      ev.preventDefault()
      ev.stopPropagation()
      dismiss()
    }
  }

  const sections: { title: string; kind: Hit["kind"] }[] = [
    { title: "Folders", kind: "folder" },
    { title: q ? "Feeds" : "Feeds with the most unread", kind: "source" },
    { title: "Articles", kind: "article" },
  ]
  const empty = q && !searching && hits.length === 1

  return (
    <div
      className={cn(
        "absolute inset-0 z-[60] flex justify-center bg-black/50 px-6 pt-[12vh]",
        closing ? "animate-fade-out" : "animate-fade",
      )}
      onClick={dismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className={cn(
          "flex max-h-[min(560px,70vh)] w-full max-w-[600px] flex-col self-start overflow-hidden rounded-xl border border-border bg-popover shadow-float",
          closing ? "animate-pop-out" : "animate-pop",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4">
          <Search size={14} className="shrink-0 text-subtle" />
          <input
            ref={input}
            id="turbo-palette"
            role="combobox"
            aria-expanded="true"
            aria-controls="turbo-palette-list"
            aria-activedescendant={hits.length ? `palette-${active}` : undefined}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            spellCheck={false}
            autoComplete="off"
            placeholder="Search feeds, folders and articles"
            className="h-12 min-w-0 flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-subtle"
          />
          <kbd className="shrink-0 rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-[10.5px] text-subtle">
            Esc
          </kbd>
        </div>

        <div ref={list} id="turbo-palette-list" role="listbox" className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {sections.map((sec) => {
            const rows = hits
              .map((hit, index) => ({ hit, index }))
              .filter(({ hit }) => hit.kind === sec.kind)
            if (rows.length === 0) return null
            return (
              <div key={sec.kind} role="group" aria-label={sec.title} className="mb-1 last:mb-0">
                <p className="px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-subtle">
                  {sec.title}
                </p>
                {rows.map(({ hit, index }) => (
                  <Row key={index} index={index} active={index === active} onHover={setActive} onChoose={() => choose(hit)}>
                    <HitBody hit={hit} />
                  </Row>
                ))}
              </div>
            )
          })}

          {q && searching && articles.length === 0 && (
            <p className="px-2.5 py-2 text-[12px] text-subtle">Searching articles</p>
          )}
          {empty && <p className="px-2.5 py-2 text-[12px] text-subtle">No feeds, folders or articles match.</p>}

          {q &&
            hits.map((hit, index) =>
              hit.kind === "all" ? (
                <div key="all" className="mt-1 border-t border-border pt-1">
                  <Row index={index} active={index === active} onHover={setActive} onChoose={() => choose(hit)}>
                    <Search size={13} className="shrink-0 text-subtle" />
                    <span className="min-w-0 truncate text-[12.5px] text-muted-foreground">
                      Show every article matching <span className="text-foreground">{hit.query}</span>
                    </span>
                  </Row>
                </div>
              ) : null,
            )}

          {!q && sources.length === 0 && (
            <p className="px-2.5 py-2 text-[12px] text-subtle">Add a feed first, then search it from here.</p>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-border px-4 py-2 text-[11px] text-subtle">
          <span>
            <Key>↑</Key> <Key>↓</Key> to move
          </span>
          <span>
            <Key>Enter</Key> to open
          </span>
        </div>
      </div>
    </div>
  )
}

function Row({
  index,
  active,
  onHover,
  onChoose,
  children,
}: {
  index: number
  active: boolean
  onHover: (i: number) => void
  onChoose: () => void
  children: React.ReactNode
}) {
  return (
    <div
      id={`palette-${index}`}
      data-index={index}
      role="option"
      aria-selected={active}
      onMouseMove={() => !active && onHover(index)}
      onClick={onChoose}
      className={cn(
        "row flex h-9 cursor-default items-center gap-2.5 px-2.5",
        active ? "bg-secondary text-foreground" : "text-muted-foreground",
      )}
    >
      {children}
    </div>
  )
}

function HitBody({ hit }: { hit: Hit }) {
  if (hit.kind === "folder") {
    return (
      <>
        <Folder size={14} className="shrink-0 text-subtle" />
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">{hit.group.name}</span>
      </>
    )
  }
  if (hit.kind === "source") {
    const s = hit.source
    return (
      <>
        <FeedIcon source={s} size={14} />
        <span className="min-w-0 truncate text-[12.5px] text-foreground">{s.name}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-subtle">{hostOf(s.siteUrl ?? s.url)}</span>
        {s.unread > 0 && <span className="tabular shrink-0 text-[11px] text-muted-foreground">{s.unread}</span>}
      </>
    )
  }
  if (hit.kind === "article") {
    const it = hit.item
    return (
      <>
        <span
          className={cn("h-1.5 w-1.5 shrink-0 rounded-full", it.read ? "bg-transparent" : "bg-unread")}
          aria-label={it.read ? undefined : "Unread"}
        />
        <span className={cn("min-w-0 flex-1 truncate text-[12.5px]", it.read ? "text-muted-foreground" : "text-foreground")}>
          {it.title}
        </span>
        <span className="min-w-0 max-w-[30%] shrink truncate text-[11px] text-subtle">{it.sourceName}</span>
        <span className="tabular shrink-0 text-[11px] text-subtle">{relativeTime(it.published)}</span>
      </>
    )
  }
  return null
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-background px-1 font-mono text-[10px] text-muted-foreground">{children}</kbd>
  )
}
