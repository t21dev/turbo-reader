import { useCallback, useEffect, useRef, useState } from "react"
import { Home as HomeIcon, Keyboard, LayoutGrid, List as ListIcon, RefreshCw, Settings2 } from "lucide-react"
import { TitleBar } from "@/components/TitleBar"
import { Sidebar } from "@/components/Sidebar"
import { ArticleList } from "@/components/ArticleList"
import { CardGrid } from "@/components/CardGrid"
import { Reader } from "@/components/Reader"
import { SettingsPanel } from "@/components/SettingsPanel"
import { Shortcuts } from "@/components/Shortcuts"
import { Home } from "@/components/Home"
import { Prompt, type PromptSpec } from "@/components/Prompt"
import { SidebarContextMenu, type Target } from "@/components/SidebarMenus"
import { readHomePrefs, writeHomePrefs, type HomePrefs } from "@/lib/home"
import { installScale } from "@/lib/scale"
import {
  api,
  type Group,
  type HomeItem,
  type ItemFull,
  type ItemSummary,
  type Scope,
  type Source,
} from "@/lib/api"
import { readPrefs, writePrefs, type AppPrefs } from "@/lib/prefs"
import { cn } from "@/lib/utils"

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
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [view, setView] = useState<"cards" | "list">(
    () => (localStorage.getItem("turbo-view") as "cards" | "list") ?? "cards",
  )
  const [sidebarOpen, setSidebarOpen] = useState(
    () => localStorage.getItem("turbo-sidebar") !== "closed",
  )
  const [homePrefs, setHomePrefs] = useState<HomePrefs>(readHomePrefs)
  // Home opens on launch when it is enabled: the point of it is being the
  // first thing you see.
  const [atHome, setAtHome] = useState(() => readHomePrefs().enabled)
  const [homeRevision, setHomeRevision] = useState(0)
  const [menuTarget, setMenuTarget] = useState<Target | null>(null)
  const [prompt, setPrompt] = useState<PromptSpec | null>(null)
  const [prefs, setPrefs] = useState<AppPrefs>(readPrefs)
  const [lastChecked, setLastChecked] = useState<number | null>(null)
  const searchTimer = useRef<number | null>(null)

  // The identity of the list on screen. Changing it means a different set of
  // articles, which is the signal the panes use to scroll back to the top.
  const scopeKey = `${scope}:${scopeId}:${unreadOnly}:${hideDuplicates}:${sort}:${search}`

  useEffect(() => installScale(), [])

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
    const stale = sources.some((s) => !s.lastFetched || Date.now() / 1000 - s.lastFetched > 900)
    if (!stale) return
    didAutoFetch.current = true
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources.length])

  useEffect(() => {
    void loadItems()
  }, [loadItems])

  // Poll on a timer. Before this the app fetched once at launch and then not
  // again until someone pressed r, which is not what a feed reader is for.
  // The interval is checked every minute rather than slept through, so a
  // laptop that was closed for an hour catches up when it wakes.
  useEffect(() => {
    if (prefs.refreshMinutes <= 0) return
    const tick = () => {
      if (busy) return
      const due = (lastChecked ?? 0) + prefs.refreshMinutes * 60_000
      if (Date.now() >= due) void refresh()
    }
    const id = window.setInterval(tick, 60_000)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.refreshMinutes, lastChecked, busy])

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

  function updatePrefs(next: AppPrefs) {
    setPrefs(next)
    writePrefs(next)
  }

  /* ----------------------------- feed admin ---------------------------- */

  async function afterTreeChange() {
    await Promise.all([loadTree(), loadItems()])
    setHomeRevision((n) => n + 1)
  }

  const sidebarActions = {
    renameSource: (s: Source) =>
      setPrompt({
        title: "Rename feed",
        field: { label: "Name", value: s.name },
        confirmLabel: "Rename",
        onConfirm: async (name) => {
          await api.updateSource(s.id, { name })
          await afterTreeChange()
        },
      }),

    moveSource: (s: Source, groupId: number | null) =>
      void api.updateSource(s.id, { groupId }).then(afterTreeChange),

    setKeepLimit: (s: Source, keepLimit: number) =>
      void api.updateSource(s.id, { keepLimit }).then(afterTreeChange),

    togglePin: (s: Source) => void api.setPinned(s.id, !s.pinned).then(afterTreeChange),

    deleteSource: (s: Source) =>
      setPrompt({
        title: `Delete ${s.name}?`,
        detail:
          "The feed and every article it brought in are removed. Starred articles go too. " +
          "This cannot be undone.",
        confirmLabel: "Delete",
        destructive: true,
        onConfirm: async () => {
          await api.deleteSource(s.id)
          if (scope === "source" && scopeId === s.id) select("all", null)
          await afterTreeChange()
        },
      }),

    renameGroup: (g: Group) =>
      setPrompt({
        title: "Rename folder",
        field: { label: "Name", value: g.name },
        confirmLabel: "Rename",
        onConfirm: async (name) => {
          await api.renameGroup(g.id, name)
          await afterTreeChange()
        },
      }),

    deleteGroup: (g: Group) =>
      setPrompt({
        title: `Delete the folder ${g.name}?`,
        detail: "Its feeds are kept and moved out of the folder. No articles are removed.",
        confirmLabel: "Delete folder",
        destructive: true,
        onConfirm: async () => {
          await api.deleteGroup(g.id)
          if (scope === "group" && scopeId === g.id) select("all", null)
          await afterTreeChange()
        },
      }),

    newGroup: () =>
      setPrompt({
        title: "New folder",
        field: { label: "Name", value: "", placeholder: "Reading" },
        confirmLabel: "Create",
        onConfirm: async (name) => {
          await api.createGroup(name)
          await afterTreeChange()
        },
      }),
  }

  async function refresh() {
    setBusy(true)
    try {
      await api.fetchAll()
      await Promise.all([loadTree(), loadItems()])
      setHomeRevision((n) => n + 1)
      setLastChecked(Date.now())
    } finally {
      setBusy(false)
    }
  }

  function updateHomePrefs(next: HomePrefs) {
    setHomePrefs(next)
    writeHomePrefs(next)
  }

  /** Opening anything from home leaves home and shows the reader. */
  async function openFromHome(it: HomeItem) {
    setAtHome(false)
    await selectItem({ ...it, author: null } as ItemSummary)
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

  async function toggleRead(id: number, sourceId: number | undefined, read: boolean) {
    await api.setRead([id], read)
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, read } : x)))
    setCurrent((prev) => (prev && prev.id === id ? { ...prev, read } : prev))
    if (sourceId !== undefined) {
      setSources((prev) =>
        prev.map((s) =>
          s.id === sourceId ? { ...s, unread: Math.max(0, s.unread + (read ? -1 : 1)) } : s,
        ),
      )
    }
  }

  async function hide(id: number) {
    await api.setHidden([id], true)
    setItems((prev) => prev.filter((x) => x.id !== id))
    setCurrent((prev) => (prev && prev.id === id ? null : prev))
    await loadTree()
  }

  async function markAllRead(olderThanDays?: number) {
    const before =
      olderThanDays === undefined
        ? undefined
        : Math.floor(Date.now() / 1000) - olderThanDays * 86400
    await api.markAllRead({ scope, id: scopeId ?? undefined, before })
    await Promise.all([loadTree(), loadItems()])
  }

  function select(nextScope: Scope, id: number | null) {
    setAtHome(false)
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

  function toggleSidebar() {
    setSidebarOpen((v) => {
      localStorage.setItem("turbo-sidebar", v ? "closed" : "open")
      return !v
    })
  }

  function toggleView() {
    const next = view === "cards" ? "list" : "cards"
    setView(next)
    localStorage.setItem("turbo-view", next)
  }

  // Keyboard. Fluent Reader issue #592 asked for shortcuts and never got them.
  // Everything here is a single key except the Ctrl pairs, and nothing fires
  // while a text field has focus.
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      const el = ev.target as HTMLElement | null
      const typing =
        el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || el?.isContentEditable === true

      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "b") {
        ev.preventDefault()
        toggleSidebar()
        return
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "f") {
        ev.preventDefault()
        if (view === "cards") toggleView()
        window.setTimeout(() => document.getElementById("turbo-search")?.focus(), 0)
        return
      }
      if (ev.key === "Escape" && typing) {
        ;(el as HTMLInputElement).blur()
        return
      }
      if (typing || ev.ctrlKey || ev.metaKey || ev.altKey) return

      const idx = items.findIndex((i) => i.id === current?.id)
      switch (ev.key) {
        case "j":
        case "ArrowDown": {
          ev.preventDefault()
          const next = items[Math.min(items.length - 1, idx + 1)]
          if (next) void selectItem(next)
          break
        }
        case "k":
        case "ArrowUp": {
          ev.preventDefault()
          const prev = items[Math.max(0, idx - 1)]
          if (prev) void selectItem(prev)
          break
        }
        case "s":
          if (current) void toggleStar(current.id, !current.starred)
          break
        case "m":
          if (current) {
            const row = items.find((i) => i.id === current.id)
            void toggleRead(current.id, row?.sourceId, !current.read)
          }
          break
        case "h":
          if (current) void hide(current.id)
          break
        case "o":
          if (current?.link) void import("@tauri-apps/plugin-opener").then((m) => m.openUrl(current.link!))
          break
        case "r":
          void refresh()
          break
        case "a":
          void markAllRead()
          break
        case "u":
          setUnreadOnly((v) => !v)
          break
        case "d":
          setHideDuplicates((v) => !v)
          break
        case "t":
          setSort((s) => (s === "newest" ? "oldest" : "newest"))
          break
        case "v":
          toggleView()
          break
        case "g":
          if (homePrefs.enabled) setAtHome((v) => !v)
          break
        case "n":
          if (!sidebarOpen) toggleSidebar()
          break
        case "/":
          ev.preventDefault()
          if (view === "cards") toggleView()
          window.setTimeout(() => document.getElementById("turbo-search")?.focus(), 0)
          break
        case "?":
          setShortcutsOpen((v) => !v)
          break
        case ",":
          setSettingsOpen(true)
          break
        case "Escape":
          if (shortcutsOpen) setShortcutsOpen(false)
          else if (current) setCurrent(null)
          break
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  const totalUnread = sources.reduce((n, s) => n + s.unread, 0)

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      <TitleBar
        unread={totalUnread}
        busy={busy}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={toggleSidebar}
      >
        {homePrefs.enabled && (
          <button
            type="button"
            onClick={() => setAtHome((v) => !v)}
            title="Home (g)"
            className={cn(
              "row grid h-7 w-7 place-items-center hover:bg-secondary hover:text-foreground",
              atHome ? "bg-secondary text-foreground" : "text-muted-foreground",
            )}
          >
            <HomeIcon size={14} />
          </button>
        )}
        <button
          type="button"
          onClick={toggleView}
          title={view === "cards" ? "Switch to list view (v)" : "Switch to card view (v)"}
          className="row grid h-7 w-7 place-items-center text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          {view === "cards" ? <ListIcon size={14} /> : <LayoutGrid size={14} />}
        </button>
        <button
          type="button"
          onClick={refresh}
          disabled={busy}
          title="Refresh all feeds (r)"
          className="row grid h-7 w-7 place-items-center text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40"
        >
          <RefreshCw size={14} className={busy ? "animate-spin" : undefined} />
        </button>
        <button
          type="button"
          onClick={() => setShortcutsOpen(true)}
          title="Keyboard shortcuts (?)"
          className="row grid h-7 w-7 place-items-center text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Keyboard size={14} />
        </button>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title="Settings (,)"
          className="row grid h-7 w-7 place-items-center text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Settings2 size={14} />
        </button>
      </TitleBar>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* The rail slides out rather than popping, and its width animates so
            the panes beside it move with it instead of snapping afterwards. */}
        <div
          className={cn(
            "min-h-0 shrink-0 overflow-hidden",
            "transition-[width,opacity,transform] duration-[280ms] ease-out",
            sidebarOpen ? "w-[260px] opacity-100" : "w-0 -translate-x-3 opacity-0",
          )}
        >
          <Sidebar
            atHome={atHome}
            homeEnabled={homePrefs.enabled}
            onHome={() => setAtHome(true)}
            groups={groups}
            sources={sources}
            scope={scope}
            scopeId={scopeId}
            unreadOnly={unreadOnly}
            onSelect={select}
            onToggleGroup={async (id, expanded) => {
              setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, expanded } : g)))
              await api.setGroupExpanded(id, expanded)
            }}
            onAddSource={async (url) => {
              await api.addSource(url)
              await afterTreeChange()
            }}
            onContextMenu={setMenuTarget}
            onNewGroup={sidebarActions.newGroup}
          />
        </div>

        {atHome && homePrefs.enabled ? (
          <Home
            prefs={homePrefs}
            onPrefs={updateHomePrefs}
            onOpen={(it) => void openFromHome(it)}
            onStar={(it) => void toggleStar(it.id, !it.starred)}
            onScope={select}
            revision={homeRevision}
          />
        ) : view === "list" ? (
          <>
            <ArticleList
              items={items}
              sources={sources}
              selectedId={current?.id ?? null}
              search={searchInput}
              sort={sort}
              unreadOnly={unreadOnly}
              hideDuplicates={hideDuplicates}
              loading={loading}
              scopeKey={scopeKey}
              onSelect={(it) => void selectItem(it)}
              onSearch={onSearch}
              onToggleSort={() => setSort((s) => (s === "newest" ? "oldest" : "newest"))}
              onToggleUnread={() => setUnreadOnly((v) => !v)}
              onToggleDuplicates={() => setHideDuplicates((v) => !v)}
              onMarkAllRead={(days) => void markAllRead(days)}
              onStar={(it) => void toggleStar(it.id, !it.starred)}
              onHide={(it) => void hide(it.id)}
            />
            <Reader
              item={current}
              youtubeInline={prefs.youtubeInline}
              onStar={(it) => void toggleStar(it.id, !it.starred)}
              onToggleRead={(it) =>
                void toggleRead(it.id, items.find((x) => x.id === it.id)?.sourceId, !it.read)
              }
              onHide={(it) => void hide(it.id)}
              onContentLoaded={(id, content) =>
                setCurrent((prev) => (prev && prev.id === id ? { ...prev, content } : prev))
              }
            />
          </>
        ) : current ? (
          <Reader
            item={current}
            youtubeInline={prefs.youtubeInline}
            onStar={(it) => void toggleStar(it.id, !it.starred)}
            onToggleRead={(it) =>
              void toggleRead(it.id, items.find((x) => x.id === it.id)?.sourceId, !it.read)
            }
            onHide={(it) => void hide(it.id)}
            onContentLoaded={(id, content) =>
              setCurrent((prev) => (prev && prev.id === id ? { ...prev, content } : prev))
            }
            onBack={() => setCurrent(null)}
          />
        ) : (
          <CardGrid
            items={items}
            sources={sources}
            loading={loading}
            scopeKey={scopeKey}
            onSelect={(it) => void selectItem(it)}
            onStar={(it) => void toggleStar(it.id, !it.starred)}
            onHide={(it) => void hide(it.id)}
          />
        )}
      </div>

      {settingsOpen && (
        <SettingsPanel
          groups={groups}
          sources={sources}
          homePrefs={homePrefs}
          onHomePrefs={updateHomePrefs}
          prefs={prefs}
          onPrefs={updatePrefs}
          lastChecked={lastChecked}
          onSortChanged={afterTreeChange}
          onHomeChanged={() => setHomeRevision((n) => n + 1)}
          onClose={() => setSettingsOpen(false)}
          onImported={async () => {
            await Promise.all([loadTree(), loadItems()])
          }}
        />
      )}

      {shortcutsOpen && <Shortcuts onClose={() => setShortcutsOpen(false)} />}

      <SidebarContextMenu
        target={menuTarget}
        groups={groups}
        onClose={() => setMenuTarget(null)}
        actions={sidebarActions}
      />
      <Prompt spec={prompt} onClose={() => setPrompt(null)} />
    </div>
  )
}
