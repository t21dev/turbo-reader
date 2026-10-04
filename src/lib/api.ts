import { invoke } from "@tauri-apps/api/core"

export type Group = {
  id: number
  name: string
  position: number
  expanded: boolean
  homeLayout: BandLayout | null
}

export type Source = {
  id: number
  url: string
  name: string
  siteUrl: string | null
  iconUrl: string | null
  groupId: number | null
  unread: number
  lastFetched: number | null
  lastError: string | null
  keepLimit: number
  pinned: boolean
}

export type ItemSummary = {
  id: number
  sourceId: number
  sourceName: string
  title: string
  link: string | null
  author: string | null
  published: number
  snippet: string
  thumbnail: string | null
  read: boolean
  starred: boolean
}

export type ItemFull = {
  id: number
  sourceName: string
  title: string
  link: string | null
  author: string | null
  published: number
  content: string
  read: boolean
  starred: boolean
}

/** The MCP server for AI agents. Off by default. */
export type McpConfig = { enabled: boolean; port: number; lan: boolean }
export type McpStatus = { config: McpConfig; listening: string | null; error: string | null }
export type McpKey = {
  id: number
  name: string
  prefix: string
  write: boolean
  created: number
  lastUsed: number | null
}
/** Settings > Storage. Sizes are bytes. */
export type StorageInfo = {
  dbBytes: number
  reclaimableBytes: number
  articles: number
  fullCount: number
  fullBytes: number
  webviewBytes: number
  webviewPending: boolean
}

export type OldRead = { count: number; bytes: number }

export type McpActivity = { at: number; key: string; tool: string }

/** Background mode. All off by default. */
export type BackgroundPrefs = {
  /** Closing the window keeps the app running in the tray. */
  closeToTray: boolean
  /** New-article notifications after background refreshes. */
  notify: "off" | "all" | "pinned"
}

export type UpdateCheck = {
  current: string
  latest: string | null
  newer: boolean
  url: string
  published: string | null
}

export type SourcePreview = {
  /** The feed address found, which may differ from what was typed. */
  url: string
  title: string
  siteUrl: string | null
  itemCount: number
  latest: { title: string; published: number }[]
  /** True when the address typed was a page and the feed came from it. */
  discovered: boolean
  existing: { id: number; name: string } | null
}

export type HomeWindow = "today" | "week" | "month"
export type BandLayout = "cards" | "mosaic" | "magazine" | "compact" | "headlines"

export type HomeItem = {
  id: number
  sourceId: number
  sourceName: string
  title: string
  link: string | null
  published: number
  snippet: string
  thumbnail: string | null
  read: boolean
  starred: boolean
  /** Why the ranking put this here, for the tooltip. */
  why: string
}

export type Home = {
  counts: { today: number; week: number; month: number }
  buckets: { day: number; count: number }[]
  pinned: { id: number; name: string; iconUrl: string | null; unread: number }[]
  bands: {
    groupId: number | null
    name: string
    layout: BandLayout
    unread: number
    items: HomeItem[]
  }[]
  quote: { text: string; author: string | null } | null
}

export type Scope = "all" | "source" | "group" | "starred"

export type Filter = {
  scope?: Scope
  id?: number
  unreadOnly?: boolean
  search?: string
  hideDuplicates?: boolean
  sort?: "newest" | "oldest"
  limit?: number
  offset?: number
  /** Unix seconds. mark_all_read only: stop at items published before this. */
  before?: number
}

export type FetchReport = {
  sources: number
  newItems: number
  notModified: number
  errors: [string, string][]
  elapsedMs: number
}

export type Stats = {
  sources: number
  items: number
  unread: number
  starred: number
  dbBytes: number
}

/** Rust returns snake_case; normalise once here so components stay clean. */
function camel<T>(v: unknown): T {
  if (Array.isArray(v)) return v.map((x) => camel(x)) as unknown as T
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = camel(val)
    }
    return out as T
  }
  return v as T
}

const call = async <T>(cmd: string, args?: Record<string, unknown>): Promise<T> =>
  camel<T>(await invoke(cmd, args))

export const api = {
  listGroups: () => call<Group[]>("list_groups"),
  createGroup: (name: string) => call<number>("create_group", { name }),
  renameGroup: (id: number, name: string) => call<void>("rename_group", { id, name }),
  deleteGroup: (id: number) => call<void>("delete_group", { id }),
  setGroupExpanded: (id: number, expanded: boolean) =>
    call<void>("set_group_expanded", { id, expanded }),

  listSources: () => call<Source[]>("list_sources"),
  addSource: (url: string, groupId?: number | null) =>
    call<number>("add_source", { url, groupId: groupId ?? null }),
  deleteSource: (id: number) => call<void>("delete_source", { id }),
  /** Rename a feed or change its retention. Moving is moveSource. */
  updateSource: (id: number, patch: { name?: string; keepLimit?: number }) =>
    call<void>("update_source", {
      id,
      name: patch.name ?? null,
      keepLimit: patch.keepLimit ?? null,
    }),
  /** Put a feed in a folder, or take it out of one with null. */
  moveSource: (id: number, groupId: number | null) =>
    call<void>("move_source", { id, groupId }),
  /** Check what is behind an address before subscribing to it. */
  previewSource: (url: string) => call<SourcePreview>("preview_source", { url }),
  /** How many articles a new retention limit would remove. */
  retentionPreview: (id: number, limit: number) =>
    call<number>("retention_preview", { id, limit }),
  /** How many articles a mark-all-read would change. */
  markAllReadPreview: (filter: Filter) => call<number>("mark_all_read_preview", { filter }),

  fetchAll: () => call<FetchReport>("fetch_all"),

  listItems: (filter: Filter) => call<ItemSummary[]>("list_items", { filter }),
  getItem: (id: number) => call<ItemFull>("get_item", { id }),
  setRead: (ids: number[], read: boolean) => call<void>("set_read", { ids, read }),
  setStarred: (id: number, starred: boolean) => call<void>("set_starred", { id, starred }),
  markAllRead: (filter: Filter) => call<number>("mark_all_read", { filter }),

  importOpml: (xml: string) => call<number>("import_opml", { xml }),
  exportOpml: () => call<string>("export_opml"),

  getSettings: () => call<Record<string, unknown>>("get_settings"),
  setSetting: (key: string, value: unknown) => call<void>("set_setting", { key, value }),
  stats: () => call<Stats>("stats"),

  setHidden: (ids: number[], hidden: boolean) =>
    call<void>("set_hidden", { ids, hidden }),
  loadFullContent: (id: number) => call<string>("load_full_content", { id }),
  articleMarkdown: (id: number) =>
    call<{ filename: string; markdown: string }>("article_markdown", { id }),
  qrSvg: (text: string) => call<string>("qr_svg", { text }),
  checkForUpdates: () => call<UpdateCheck>("check_for_updates"),
  getBackground: () => call<BackgroundPrefs>("get_background"),
  setBackground: (prefs: BackgroundPrefs) => call<BackgroundPrefs>("set_background", { prefs }),
  startHidden: () => call<boolean>("start_hidden"),
  mcpStatus: () => call<McpStatus>("mcp_status"),
  mcpConfigure: (config: McpConfig) => call<McpStatus>("mcp_configure", { config }),
  mcpKeys: () => call<McpKey[]>("mcp_keys"),
  mcpCreateKey: (name: string, write: boolean) => call<string>("mcp_create_key", { name, write }),
  mcpRevokeKey: (id: number) => call<void>("mcp_revoke_key", { id }),
  mcpActivity: () => call<McpActivity[]>("mcp_activity"),
  mcpLanAddresses: () => call<string[]>("mcp_lan_addresses"),
  mcpExePath: () => call<string>("mcp_exe_path"),
  storageInfo: () => call<StorageInfo>("storage_info"),
  storageCompact: () => call<StorageInfo>("storage_compact"),
  storageClearFull: () => call<number>("storage_clear_full"),
  storageOldRead: (days: number) => call<OldRead>("storage_old_read", { days }),
  storageDeleteOldRead: (days: number) => call<number>("storage_delete_old_read", { days }),
  storageClearWebview: (clear: boolean) => call<void>("storage_clear_webview", { clear }),
  restartApp: () => call<void>("restart_app"),
  settleWindow: () => call<void>("settle_window"),

  home: (req: { window?: HomeWindow; perBand?: number; masthead?: string }) =>
    call<Home>("home_summary", { req }),
  setPinned: (id: number, pinned: boolean) => call<void>("set_pinned", { id, pinned }),
  setGroupLayout: (id: number, layout: BandLayout | null) =>
    call<void>("set_group_layout", { id, layout }),
  quotesPath: () => call<string>("quotes_path"),

  readTextFile: (path: string) => call<string>("read_text_file", { path }),
  writeTextFile: (path: string, contents: string) =>
    call<void>("write_text_file", { path, contents }),
}
