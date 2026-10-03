/** Preferences that are not about appearance and not about the home page. */
export type AppPrefs = {
  /** Minutes between automatic refreshes. 0 switches polling off. */
  refreshMinutes: number
  /** "manual" keeps the imported order, "alpha" sorts by name. Issue #539. */
  feedSort: "manual" | "alpha"
  /** Play YouTube videos inside the reader rather than in the browser. */
  youtubeInline: boolean
  /** Ask GitHub for a newer release at launch. */
  updateCheck: boolean
}

export const REFRESH_CHOICES = [0, 15, 30, 60, 180] as const

export const PREF_DEFAULTS: AppPrefs = {
  refreshMinutes: 30,
  feedSort: "manual",
  youtubeInline: false,
  updateCheck: true,
}

const KEY = "turbo-prefs"

export function readPrefs(): AppPrefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return PREF_DEFAULTS
    const o = JSON.parse(raw) as Partial<AppPrefs>
    return {
      refreshMinutes: REFRESH_CHOICES.includes(o.refreshMinutes as never)
        ? o.refreshMinutes!
        : PREF_DEFAULTS.refreshMinutes,
      feedSort: o.feedSort === "alpha" ? "alpha" : "manual",
      youtubeInline: o.youtubeInline === true,
      updateCheck: o.updateCheck !== false,
    }
  } catch {
    return PREF_DEFAULTS
  }
}

export function writePrefs(prefs: AppPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    /* storage blocked */
  }
}

/** "4 minutes ago", for the line under the refresh setting. */
export function sinceLabel(at: number | null): string {
  if (!at) return "not yet this session"
  const mins = Math.floor((Date.now() - at) / 60_000)
  if (mins < 1) return "just now"
  if (mins === 1) return "1 minute ago"
  if (mins < 60) return `${mins} minutes ago`
  const hours = Math.floor(mins / 60)
  return hours === 1 ? "an hour ago" : `${hours} hours ago`
}
