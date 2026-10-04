import type { SettingsTab } from "@/components/SettingsPanel"

/** Where a settings search result goes: a Settings tab, or a dialog. */
export type SettingTarget = SettingsTab | "about" | "shortcuts"

export type SettingEntry = {
  label: string
  /** Where it lives, shown beside the label. */
  place: string
  /** Other words people use for it. */
  keywords: string
  target: SettingTarget
  /** The label on screen to scroll to, when it differs from `label`. */
  anchor?: string
}

const A = "appearance" as const
const R = "reading" as const
const H = "home" as const
const F = "feeds" as const
const S = "storage" as const
const B = "background" as const
const G = "agents" as const

/** Every setting, by the names people look for. Search in the title bar and
    in Settings both read this, so a new setting goes here too. */
export const SETTINGS_INDEX: SettingEntry[] = [
  // Appearance
  { label: "Theme", place: "Appearance", keywords: "light dark paper system mode colour color scheme", target: A },
  { label: "Dark mode", place: "Appearance", keywords: "theme night black", target: A, anchor: "Theme" },
  { label: "Light mode", place: "Appearance", keywords: "theme day white bright", target: A, anchor: "Theme" },
  { label: "Paper theme", place: "Appearance", keywords: "warm reading sepia cream", target: A, anchor: "Theme" },
  { label: "Accent colour", place: "Appearance", keywords: "color highlight custom hex picker", target: A, anchor: "Accent" },
  { label: "Interface size", place: "Appearance", keywords: "zoom scale bigger smaller ui text size", target: A },
  { label: "Density", place: "Appearance", keywords: "compact comfortable spacing rows", target: A },
  { label: "Animations", place: "Appearance", keywords: "motion reduce effects transitions", target: A },
  { label: "Reset appearance", place: "Appearance", keywords: "defaults restore theme", target: A, anchor: "Theme" },
  // Reading
  { label: "Article font", place: "Reading", keywords: "typeface libron literata source serif merriweather atkinson mono", target: R },
  { label: "Article text size", place: "Reading", keywords: "font size bigger smaller", target: R },
  { label: "Line width", place: "Reading", keywords: "measure column narrow wide", target: R },
  { label: "Text direction", place: "Reading", keywords: "rtl ltr right to left arabic hebrew", target: R },
  // Home
  { label: "Show the home page", place: "Home", keywords: "start page landing dashboard", target: H },
  { label: "Home sections", place: "Home", keywords: "order glance search pinned categories reorder", target: H, anchor: "Sections" },
  { label: "Opening window", place: "Home", keywords: "time range since midnight days", target: H },
  { label: "Under the date", place: "Home", keywords: "quote headline masthead", target: H },
  { label: "Clock", place: "Home", keywords: "time seconds", target: H },
  { label: "Card size", place: "Home", keywords: "small medium large", target: H },
  { label: "Articles per category", place: "Home", keywords: "count band limit", target: H },
  { label: "Category layout", place: "Home", keywords: "cards mosaic magazine compact headlines", target: H, anchor: "Categories" },
  { label: "Pinned feeds", place: "Home", keywords: "pin favourite top", target: H },
  { label: "Interests", place: "Home", keywords: "keywords topics ranking boost", target: H },
  { label: "Muted words", place: "Home", keywords: "mute hide keywords filter", target: H, anchor: "Muted" },
  // Feeds
  { label: "Refresh interval", place: "Feeds", keywords: "check for new articles schedule automatic minutes", target: F, anchor: "Check for new articles" },
  { label: "Feed order", place: "Feeds", keywords: "sort alphabetical as imported", target: F, anchor: "Order" },
  { label: "YouTube videos", place: "Feeds", keywords: "play inline browser embed video", target: F },
  { label: "Import OPML", place: "Feeds", keywords: "subscriptions migrate add feeds", target: F, anchor: "OPML" },
  { label: "Export OPML", place: "Feeds", keywords: "backup subscriptions save feeds", target: F, anchor: "OPML" },
  { label: "Library stats", place: "Feeds", keywords: "count articles unread starred", target: F, anchor: "Library" },
  // Storage
  { label: "Compact the database", place: "Storage", keywords: "vacuum space disk size", target: S },
  { label: "Downloaded full articles", place: "Storage", keywords: "full content space remove", target: S },
  { label: "Delete old read articles", place: "Storage", keywords: "clean up space retention age", target: S, anchor: "Old read articles" },
  { label: "Clear the webview cache", place: "Storage", keywords: "images cache space", target: S, anchor: "Webview cache" },
  // Background
  { label: "Keep running in the tray", place: "Background", keywords: "system tray minimize close background menu bar", target: B },
  { label: "Start at login", place: "Background", keywords: "startup boot autostart", target: B },
  { label: "New-article notifications", place: "Background", keywords: "alerts notify system desktop", target: B },
  // AI agents
  { label: "Let AI agents connect", place: "AI agents", keywords: "mcp server claude codex cursor enable", target: G, anchor: "Allow AI agents to connect" },
  { label: "Agent server port", place: "AI agents", keywords: "mcp port http", target: G, anchor: "Port" },
  { label: "Allow other computers on my network", place: "AI agents", keywords: "lan remote mcp", target: G },
  { label: "API keys", place: "AI agents", keywords: "mcp token key access create revoke", target: G },
  { label: "Connect an agent", place: "AI agents", keywords: "setup claude code codex claude desktop cursor config", target: G },
  { label: "Recent agent activity", place: "AI agents", keywords: "log calls history", target: G },
  // Elsewhere
  { label: "Check for updates", place: "About", keywords: "version new release upgrade", target: "about" },
  { label: "Check for updates at launch", place: "About", keywords: "automatic update startup", target: "about" },
  { label: "About Turbo Reader", place: "About", keywords: "version licence credits", target: "about" },
  { label: "Keyboard shortcuts", place: "Help", keywords: "keys hotkeys keyboard", target: "shortcuts" },
]
