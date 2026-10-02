import { useCallback, useEffect, useRef, useState } from "react"
import { Sidebar } from "@/components/Sidebar"
import { ArticleList } from "@/components/ArticleList"
import { Reader } from "@/components/Reader"
import { SettingsPanel } from "@/components/SettingsPanel"
import {
  api,
  type Group,
  type ItemFull,
  type ItemSummary,
  type Scope,
  type Source,
} from "@/lib/api"

export default function App() {
  const [groups, setGroups] = useState<Group[]>([])
  const [sources, setSources] = useState<Source[]>([])
  const [items, setItems] = useState<ItemSummary[]>([])
  const [current, setCurrent] = useState<ItemFull | null>(null)

  const [scope, setScope] = useState<Scope>("all")
  const [scopeId, setScopeId] = useState<number | null>(null)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [hideDuplicates, setHideDuplicates] = useState(true)
  const [sort, setSort] = useState<"newest" | "oldest">("newest")
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")

  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const searchTimer = useRef<number | null>(null)

  const loadTree = useCallback(async () => {
    const [g, s] = await Promise.all([api.listGroups(), api.listSources()])
    setGroups(g)
    setSources(s)
  }, [])

  const loadItems = useCallback(async () => {
    setLoading(true)
    try {
      setItems(
        await api.listItems({
          scope,
          id: scopeId ?? undefined,
          unreadOnly,
          hideDuplicates,
          sort,
          search: search.trim() || undefined,
          limit: 300,
        }),
      )
    } finally {
      setLoading(false)
    }
  }, [scope, scopeId, unreadOnly, hideDuplicates, sort, search])

  useEffect(() => {
    void loadTree()
  }, [loadTree])

  // Refresh once when the window opens, if anything is stale. Guarded by a ref
  // so React 19's StrictMode double-mount doesn't fire two fetches.
  const didAutoFetch = useRef(false)
  useEffect(() => {
    if (didAutoFetch.current || sources.length === 0) return
    const stale = sources.some(
      (s) => !s.lastFetched || Date.now() / 1000 - s.lastFetched > 900,
    )
    if (!stale) return
    didAutoFetch.current = true
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources.length])

  useEffect(() => {
    void loadItems()
  }, [loadItems])

  // The input stays instant; the query it drives is debounced, so typing
  // doesn't fire a round trip per keystroke.
  const onSearch = (q: string) => {
    setSearchInput(q)
    if (searchTimer.current) window.clearTimeout(searchTimer.current)
    searchTimer.current = window.setTimeout(() => setSearch(q), 180)
  }

  useEffect(
    () => () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current)
    },
    [],
  )

  async function refresh() {
    setBusy(true)
    try {
      await api.fetchAll()
      await Promise.all([loadTree(), loadItems()])
    } finally {
      setBusy(false)
    }
  }

  async function selectItem(it: ItemSummary) {
    const full = await api.getItem(it.id)
    setCurrent(full)
    if (!it.read) {
      await api.setRead([it.id], true)
      setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, read: true } : x)))
      setSources((prev) =>
        prev.map((s) => (s.id === it.sourceId ? { ...s, unread: Math.max(0, s.unread - 1) } : s)),
      )
    }
  }

  async function toggleStar(id: number, starred: boolean) {
    await api.setStarred(id, starred)
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, starred } : x)))
    setCurrent((prev) => (prev && prev.id === id ? { ...prev, starred } : prev))
  }

  function select(nextScope: Scope, id: number | null) {
    // the Unread entry reuses the "all" scope with the filter switched on
    if (nextScope === "all" && id === -1) {
      setScope("all")
      setScopeId(null)
      setUnreadOnly(true)
    } else {
      setScope(nextScope)
      setScopeId(id)
      if (nextScope === "all") setUnreadOnly(false)
    }
    setCurrent(null)
  }

  // Keyboard: j/k move, Enter opens, s stars, r refreshes — issue #592 asked
  // for shortcuts and Fluent Reader never shipped custom ones.
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      const tag = (ev.target as HTMLElement | null)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return
      const idx = items.findIndex((i) => i.id === current?.id)
      if (ev.key === "j" || ev.key === "ArrowDown") {
        ev.preventDefault()
        const next = items[Math.min(items.length - 1, idx + 1)]
        if (next) void selectItem(next)
      } else if (ev.key === "k" || ev.key === "ArrowUp") {
        ev.preventDefault()
        const prev = items[Math.max(0, idx - 1)]
        if (prev) void selectItem(prev)
      } else if (ev.key === "s" && current) {
        void toggleStar(current.id, !current.starred)
      } else if (ev.key === "r") {
        void refresh()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  return (
    <div className="relative flex h-full w-full overflow-hidden">
      <Sidebar
        groups={groups}
        sources={sources}
        scope={scope}
        scopeId={scopeId}
        unreadOnly={unreadOnly}
        busy={busy}
        onSelect={select}
        onToggleGroup={async (id, expanded) => {
          setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, expanded } : g)))
          await api.setGroupExpanded(id, expanded)
        }}
        onAddSource={async (url) => {
          await api.addSource(url)
          await Promise.all([loadTree(), loadItems()])
        }}
        onRefresh={refresh}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <ArticleList
        items={items}
        selectedId={current?.id ?? null}
        search={searchInput}
        sort={sort}
        unreadOnly={unreadOnly}
        hideDuplicates={hideDuplicates}
        loading={loading}
        onSelect={(it) => void selectItem(it)}
        onSearch={onSearch}
        onToggleSort={() => setSort((s) => (s === "newest" ? "oldest" : "newest"))}
        onToggleUnread={() => setUnreadOnly((v) => !v)}
        onToggleDuplicates={() => setHideDuplicates((v) => !v)}
        onMarkAllRead={async () => {
          await api.markAllRead({ scope, id: scopeId ?? undefined })
          await Promise.all([loadTree(), loadItems()])
        }}
        onStar={(it) => void toggleStar(it.id, !it.starred)}
      />

      <Reader item={current} onStar={(it) => void toggleStar(it.id, !it.starred)} />

      {settingsOpen && (
        <SettingsPanel
          onClose={() => setSettingsOpen(false)}
          onImported={async () => {
            await Promise.all([loadTree(), loadItems()])
          }}
        />
      )}
    </div>
  )
}
