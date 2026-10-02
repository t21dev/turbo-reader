import { invoke } from "@tauri-apps/api/core"

export type Group = { id: number; name: string; position: number; expanded: boolean }

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

export type UpdateCheck = {
  current: string
  latest: string | null
  newer: boolean
  url: string
  published: string | null
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
  updateSource: (
    id: number,
    patch: { name?: string; groupId?: number | null; keepLimit?: number },
  ) =>
    call<void>("update_source", {
      id,
      name: patch.name ?? null,
      groupId: patch.groupId === undefined ? null : [patch.groupId],
      keepLimit: patch.keepLimit ?? null,
    }),

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
