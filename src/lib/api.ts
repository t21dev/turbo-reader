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
}
