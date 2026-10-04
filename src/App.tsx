import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Info, Keyboard, LayoutGrid, List as ListIcon, RefreshCw, Search, Settings2 } from "lucide-react"
import { listen } from "@tauri-apps/api/event"
import { useUpdateCheck } from "@/lib/updates"
import { pickAndImportOpml } from "@/lib/opml"
import { Welcome } from "@/components/Welcome"
import { openUrl } from "@tauri-apps/plugin-opener"
import { TitleBar } from "@/components/TitleBar"
import { CommandPalette } from "@/components/CommandPalette"
import { AboutDialog } from "@/components/AboutDialog"
import { isMac } from "@/lib/platform"
import { NotificationBell } from "@/components/Notifications"
import { Sidebar } from "@/components/Sidebar"
import { ArticleList } from "@/components/ArticleList"
import { CardGrid } from "@/components/CardGrid"
import { Reader } from "@/components/Reader"
import { SettingsPanel, type SettingsTab } from "@/components/SettingsPanel"
import { Shortcuts } from "@/components/Shortcuts"
import { Home } from "@/components/Home"
import { Prompt, type PromptSpec } from "@/components/Prompt"
import { AddFeedDialog } from "@/components/AddFeedDialog"
import { Toaster } from "@/components/Toaster"
import { attempt, notify } from "@/lib/notify"
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
import { useNavHistory } from "@/lib/navHistory"

export default function App() {
  const [groups, setGroups] = useState<Group[]>([])
  const [sources, setSources] = useState<Source[]>([])
  const [items, setItems] = useState<ItemSummary[]>([])
  const [current, setCurrent] = useState<ItemFull | null>(null)
  // Reading mode: just the article, with the sidebar and list out of the way.
  const [reading, setReading] = useState(false)
  useEffect(() => {
    if (!current) setReading(false)
  }, [current])

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
  // Set when Settings is opened from home's Customize button.
  const [settingsFocus, setSettingsFocus] = useState<SettingsTab | undefined>(undefined)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
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
  const [addOpen, setAddOpen] = useState(false)
  const [prefs, setPrefs] = useState<AppPrefs>(readPrefs)
  // A newer release on GitHub, checked at launch unless switched off.
  const update = useUpdateCheck(prefs.updateCheck)
  // When any feed was last checked, from the database, so it is right after a
  // restart and reflects scheduled refreshes as well as manual ones.
  const lastChecked = useMemo(() => {
    const newest = Math.max(0, ...sources.map((s) => s.lastFetched ?? 0))
    return newest > 0 ? newest * 1000 : null
  }, [sources])
  const searchTimer = useRef<number | null>(null)

  // The identity of the list on screen. Changing it means a different set of
  // articles, which is the signal the panes use to scroll back to the top.
  const scopeKey = `${scope}:${scopeId}:${unreadOnly}:${hideDuplicates}:${sort}:${search}`

  useEffect(() => installScale(), [])

  // Whether the feed list has loaded once, so the welcome screen for an empty
  // library never flashes up during an ordinary start.
  const [treeLoaded, setTreeLoaded] = useState(false)

  const loadTree = useCallback(async () => {
    const [g, s] = await Promise.all([api.listGroups(), api.listSources()])
    setGroups(g)
    setSources(s)
    setTreeLoaded(true)
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

  // Refreshing on a schedule happens in Rust (see spawn_refresh_schedule), so
  // it runs while the window is minimised and keeps time across restarts. The
  // page only listens, and tells the backend which interval was chosen.
  useEffect(() => {
    void api.setSetting("refresh_minutes", prefs.refreshMinutes)
  }, [prefs.refreshMinutes])

  useEffect(() => {
    const started = listen("refresh-started", () => setBusy(true))
    // Icons are looked up after the articles land, so only the tree reloads.
    const icons = listen("icons-updated", () => void loadTree())
    const updated = listen("feeds-updated", () => {
      setBusy(false)
      void Promise.all([loadTree(), loadItems()])
      setHomeRevision((n) => n + 1)
    })
    return () => {
      void started.then((off) => off())
      void updated.then((off) => off())
      void icons.then((off) => off())
    }
  }, [loadTree, loadItems])

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

  /** Imported feeds are saved without articles, so fetch them straight away. */
  async function afterImport() {
    await Promise.all([loadTree(), loadItems()])
    await refresh()
  }

  // The welcome screen's starter feeds: subscribe to all at once, then say how
  // it went. Each subscription fetches its own articles.
  async function subscribeStarters(urls: string[]) {
    const results = await Promise.allSettled(urls.map((url) => api.addSource(url, null)))
    const failed = urls.filter((_, i) => results[i].status === "rejected")
    await afterTreeChange()
    const added = urls.length - failed.length
    if (added > 0) notify(`Subscribed to ${added} feed${added === 1 ? "" : "s"}.`)
    if (failed.length > 0) {
      notify(`Could not subscribe to ${failed.join(", ")}. Try again later.`, "error")
    }
    // Their icons arrive with the next refresh; start one now.
    if (added > 0) void refresh()
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
      void attempt("Moving the feed", async () => {
        await api.moveSource(s.id, groupId)
        await afterTreeChange()
      }),

    // A lower limit deletes articles, so it asks first and says how many.
    // A limit that removes nothing needs no confirmation.
    setKeepLimit: (s: Source, keepLimit: number) =>
      void attempt("Changing retention", async () => {
        const removes = await api.retentionPreview(s.id, keepLimit)
        const apply = async () => {
          await api.updateSource(s.id, { keepLimit })
          await afterTreeChange()
        }
        if (removes === 0) return apply()
        setPrompt({
          title: `Keep only the last ${keepLimit} from ${s.name}?`,
          detail:
            `This removes ${removes} older article${removes === 1 ? "" : "s"} now, and keeps ` +
            "trimming as new ones arrive. Starred articles are always kept. This cannot be undone.",
          confirmLabel: `Remove ${removes}`,
          destructive: true,
          onConfirm: apply,
        })
      }),

    togglePin: (s: Source) =>
      void attempt(s.pinned ? "Unpinning" : "Pinning", async () => {
        await api.setPinned(s.id, !s.pinned)
        await afterTreeChange()
      }),

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
    } catch (err) {
      notify(`Refreshing failed: ${String(err)}`, "error")
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
    const full = await attempt("Opening the article", () => api.getItem(it.id))
    if (!full) return
    setCurrent(full)
    if (!it.read) {
      if ((await attempt("Marking it read", () => api.setRead([it.id], true))) === undefined) return
      setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, read: true } : x)))
      setSources((prev) =>
        prev.map((s) => (s.id === it.sourceId ? { ...s, unread: Math.max(0, s.unread - 1) } : s)),
      )
    }
  }

  async function toggleStar(id: number, starred: boolean) {
    if ((await attempt(starred ? "Starring" : "Unstarring", () => api.setStarred(id, starred))) === undefined) return
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, starred } : x)))
    setCurrent((prev) => (prev && prev.id === id ? { ...prev, starred } : prev))
  }

  async function toggleRead(id: number, sourceId: number | undefined, read: boolean) {
    if ((await attempt("Changing read state", () => api.setRead([id], read))) === undefined) return
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

  /** Hiding has no undo in the interface, so it confirms. Enter accepts. */
  function hide(id: number) {
    const title = items.find((x) => x.id === id)?.title ?? current?.title ?? "this article"
    setPrompt({
      title: "Hide this article?",
      detail: `"${title}" will not appear in any list again, including search.`,
      confirmLabel: "Hide",
      destructive: true,
      onConfirm: async () => {
        await api.setHidden([id], true)
        setItems((prev) => prev.filter((x) => x.id !== id))
        setCurrent((prev) => (prev && prev.id === id ? null : prev))
        await loadTree()
        setHomeRevision((n) => n + 1)
      },
    })
  }

  /** Marking everything read cannot be undone, so it says how many first. */
  async function markAllRead(olderThanDays?: number) {
    const before =
      olderThanDays === undefined
        ? undefined
        : Math.floor(Date.now() / 1000) - olderThanDays * 86400
    const filter = { scope, id: scopeId ?? undefined, before }
    const count = await attempt("Counting unread articles", () => api.markAllReadPreview(filter))
    if (count === undefined) return
    if (count === 0) {
      notify("Nothing here is unread.")
      return
    }
    const where =
      scope === "source"
        ? `in ${sources.find((x) => x.id === scopeId)?.name ?? "this feed"}`
        : scope === "group"
          ? `in ${groups.find((x) => x.id === scopeId)?.name ?? "this folder"}`
          : scope === "starred"
            ? "among your starred articles"
            : "across every feed"
    const age = olderThanDays === undefined ? "" : ` older than ${olderThanDays} day${olderThanDays === 1 ? "" : "s"}`
    setPrompt({
      title: `Mark ${count} article${count === 1 ? "" : "s"} as read?`,
      detail: `Every unread article${age} ${where}. This cannot be undone.`,
      confirmLabel: "Mark as read",
      destructive: true,
      onConfirm: async () => {
        await api.markAllRead(filter)
        await Promise.all([loadTree(), loadItems()])
        setHomeRevision((n) => n + 1)
      },
    })
  }

  /** The reverse, for starting a feed or folder over. Also asks first: which
      articles were read cannot be recovered afterwards. */
  async function markAllUnread() {
    const filter = { scope, id: scopeId ?? undefined }
    const count = await attempt("Counting read articles", () => api.markAllUnreadPreview(filter))
    if (count === undefined) return
    if (count === 0) {
      notify("Nothing here is read yet.")
      return
    }
    setPrompt({
      title: `Mark ${count} article${count === 1 ? "" : "s"} as unread?`,
      detail: `Every read article ${scopeWhere()}. Hidden articles stay hidden. Which ones you had read cannot be recovered.`,
      confirmLabel: "Mark as unread",
      destructive: true,
      onConfirm: async () => {
        await api.markAllUnread(filter)
        await Promise.all([loadTree(), loadItems()])
        setHomeRevision((n) => n + 1)
      },
    })
  }

  /** Where the current list's articles come from, for confirmations. */
  function scopeWhere() {
    return scope === "source"
      ? `in ${sources.find((x) => x.id === scopeId)?.name ?? "this feed"}`
      : scope === "group"
        ? `in ${groups.find((x) => x.id === scopeId)?.name ?? "this folder"}`
        : scope === "starred"
          ? "among your starred articles"
          : "across every feed"
  }

  /** The current list's name, shown above the cards. */
  const scopeTitle =
    scope === "source"
      ? (sources.find((x) => x.id === scopeId)?.name ?? "Feed")
      : scope === "group"
        ? (groups.find((x) => x.id === scopeId)?.name ?? "Folder")
        : scope === "starred"
          ? "Starred"
          : unreadOnly
            ? "Unread"
            : "All articles"

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

  // Back and forward, as in a browser: Alt+Left and Alt+Right (Cmd+[ and
  // Cmd+] on macOS) and the mouse's side buttons step through the places
  // visited: home, a feed or folder, unread only, and the article open there.
  type Place = { home: boolean; scope: Scope; id: number | null; unread: boolean; item: number | null }
  const nav = useNavHistory<Place>(
    { home: atHome, scope, id: scopeId, unread: unreadOnly, item: current?.id ?? null },
    useCallback((p: Place) => `${p.home}|${p.scope}|${p.id}|${p.unread}|${p.item}`, []),
    useCallback((p: Place) => {
      setAtHome(p.home)
      setScope(p.scope)
      setScopeId(p.id)
      setUnreadOnly(p.unread)
      if (p.item === null) setCurrent(null)
      else
        void api
          .getItem(p.item)
          .then(setCurrent)
          .catch(() => setCurrent(null))
    }, []),
  )
  useEffect(() => {
    // The side buttons arrive as mouseup with button 3 (back) and 4 (forward).
    const onMouse = (ev: MouseEvent) => {
      if (ev.button !== 3 && ev.button !== 4) return
      ev.preventDefault()
      if (ev.button === 3) nav.back()
      else nav.forward()
    }
    window.addEventListener("mouseup", onMouse)
    return () => window.removeEventListener("mouseup", onMouse)
  }, [nav])

  // Keyboard. Fluent Reader issue #592 asked for shortcuts and never got them.
  // Everything here is a single key except the Ctrl pairs, and nothing fires
  // while a text field has focus.
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      // While a dialog is open its keys are its own. Without this, pressing h
      // with a confirmation focused would act on the article behind it.
      if (prompt || addOpen || settingsOpen || shortcutsOpen || paletteOpen || aboutOpen) return
      // Search everything. Works from inside a text field too.
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "k") {
        ev.preventDefault()
        setPaletteOpen(true)
        return
      }
      const el = ev.target as HTMLElement | null
      const typing =
        el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || el?.isContentEditable === true

      const backKey = isMac ? ev.metaKey && ev.key === "[" : ev.altKey && ev.key === "ArrowLeft"
      const forwardKey = isMac ? ev.metaKey && ev.key === "]" : ev.altKey && ev.key === "ArrowRight"
      if ((backKey || forwardKey) && !typing) {
        ev.preventDefault()
        if (backKey) nav.back()
        else nav.forward()
        return
      }

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
          if (current?.link) void attempt("Opening the article", () => openUrl(current.link!))
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
        case "z":
          if (current) setReading((v) => !v)
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
          ev.preventDefault()
          setAddOpen(true)
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
          else if (reading) setReading(false)
          else if (current) setCurrent(null)
          break
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  const totalUnread = sources.reduce((n, s) => n + s.unread, 0)

  return (
    <div className="relative flex h-full w-full flex-col overflow-clip">
      <TitleBar
        update={update}
        unread={totalUnread}
        busy={busy}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={toggleSidebar}
      >
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          title={`Search feeds, articles and settings (${isMac ? "⌘" : "Ctrl"} K)`}
          aria-label="Search feeds, articles and settings"
          className="row grid h-7 w-7 place-items-center text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Search size={14} />
        </button>
        <NotificationBell update={update} onOpenFeed={(id) => select("source", id)} onRefresh={refresh} />
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
          onClick={() => setAboutOpen(true)}
          title="About Turbo Reader"
          aria-label="About Turbo Reader"
          className="row grid h-7 w-7 place-items-center text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Info size={14} />
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
            sidebarOpen && !reading ? "w-[260px] opacity-100" : "w-0 -translate-x-3 opacity-0",
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
            onAddFeed={() => setAddOpen(true)}
            onContextMenu={setMenuTarget}
            onNewGroup={sidebarActions.newGroup}
          />
        </div>

        {treeLoaded && sources.length === 0 ? (
          <Welcome
            onAddFeed={() => setAddOpen(true)}
            onImportOpml={async () => {
              const added = await pickAndImportOpml()
              if (added === null) return
              notify(`Imported ${added} feed${added === 1 ? "" : "s"}.`)
              await afterImport()
            }}
            onSubscribe={subscribeStarters}
          />
        ) : atHome && homePrefs.enabled ? (
          <Home
            prefs={homePrefs}
            onPrefs={updateHomePrefs}
            onCustomize={() => {
              setSettingsFocus("home")
              setSettingsOpen(true)
            }}
            onOpen={(it) => void openFromHome(it)}
            onStar={(it) => void toggleStar(it.id, !it.starred)}
            onScope={select}
            revision={homeRevision}
          />
        ) : view === "list" ? (
          <>
            {!reading && <ArticleList
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
              onMarkAllUnread={() => void markAllUnread()}
              onStar={(it) => void toggleStar(it.id, !it.starred)}
              onHide={(it) => void hide(it.id)}
            />}
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
              reading={reading}
              onToggleReading={() => setReading((v) => !v)}
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
            reading={reading}
            onToggleReading={() => setReading((v) => !v)}
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
            title={scopeTitle}
            onMarkAllRead={(days) => void markAllRead(days)}
            onMarkAllUnread={() => void markAllUnread()}
            unreadOnly={unreadOnly}
            hideDuplicates={hideDuplicates}
            sort={sort}
            onToggleUnread={() => setUnreadOnly((v) => !v)}
            onToggleDuplicates={() => setHideDuplicates((v) => !v)}
            onToggleSort={() => setSort((s) => (s === "newest" ? "oldest" : "newest"))}
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
          onHomeChanged={() => {
              setHomeRevision((n) => n + 1)
              // A category's layout lives on the group, so reload those too.
              void loadTree()
            }}
          onClose={() => {
            setSettingsOpen(false)
            setSettingsFocus(undefined)
          }}
          confirm={setPrompt}
          focus={settingsFocus}
          onImported={afterImport}
        />
      )}

      {shortcutsOpen && <Shortcuts onClose={() => setShortcutsOpen(false)} />}
      {aboutOpen && <AboutDialog onClose={() => setAboutOpen(false)} prefs={prefs} onPrefs={updatePrefs} />}
      {paletteOpen && (
        <CommandPalette
          groups={groups}
          sources={sources}
          onClose={() => setPaletteOpen(false)}
          onFolder={(id) => select("group", id)}
          onSource={(id) => select("source", id)}
          onArticle={(it) => {
            setAtHome(false)
            void selectItem(it)
          }}
          onSetting={(target) => {
            if (target === "about") setAboutOpen(true)
            else if (target === "shortcuts") setShortcutsOpen(true)
            else {
              setSettingsFocus(target)
              setSettingsOpen(true)
            }
          }}
          onSearchAll={(q) => {
            select("all", null)
            if (view === "cards") toggleView()
            if (searchTimer.current) window.clearTimeout(searchTimer.current)
            setSearchInput(q)
            setSearch(q)
          }}
        />
      )}

      <SidebarContextMenu
        target={menuTarget}
        groups={groups}
        onClose={() => setMenuTarget(null)}
        actions={sidebarActions}
      />
      <AddFeedDialog
        open={addOpen}
        groups={groups}
        defaultGroupId={scope === "group" ? scopeId : null}
        onClose={() => setAddOpen(false)}
        onAdded={async (id) => {
          await afterTreeChange()
          const name = (await api.listSources()).find((x) => x.id === id)?.name
          notify(name ? `Subscribed to ${name}.` : "Subscribed.")
          select("source", id)
        }}
        onShowExisting={(id) => select("source", id)}
      />
      <Prompt spec={prompt} onClose={() => setPrompt(null)} />
      <Toaster />
    </div>
  )
}
