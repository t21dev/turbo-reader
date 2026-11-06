import release from "./release.json";

export const SITE = {
  url: "https://turbo-reader.t21.dev",
  repo: "https://github.com/t21dev/turbo-reader",
  readme: "https://github.com/t21dev/turbo-reader#readme",
  perf: "https://github.com/t21dev/turbo-reader#fast-and-small",
  changelog: "https://github.com/t21dev/turbo-reader/blob/main/CHANGELOG.md",
  privacy: "https://github.com/t21dev/turbo-reader/blob/main/PRIVACY.md",
  mcpDocs: "https://github.com/t21dev/turbo-reader/blob/main/docs/mcp.md",
  license: "https://github.com/t21dev/turbo-reader/blob/main/LICENSE",
};

export type Asset = { name: string; url: string; size: number };
type Assets = Partial<Record<
  "windows" | "windowsMsi" | "windowsPortable" | "macArm" | "macIntel" | "appimage" | "deb" | "rpm" | "flatpak" | "checksums",
  Asset
>>;
export const RELEASE = release as { version: string; date: string; page: string; assets: Assets };

/** Bytes to MB the way Windows Explorer shows it (MiB), one decimal. */
export const mb = (bytes: number) => (bytes / 1048576).toFixed(1);

export const installerMB = RELEASE.assets.windows ? mb(RELEASE.assets.windows.size) : "4.8";

// Every figure below is from the README's "Fast and small" table, measured on one Windows machine.
export const SPECS: { label: string; value: string; unit: string }[] = [
  { label: "Installed on disk", value: "11", unit: "MB" },
  { label: "Core process, 500 feeds and 20,000 articles", value: "14", unit: "MB" },
  { label: "Refresh 500 feeds from a local test server", value: "0.2", unit: "s" },
  { label: "Cold start to usable", value: "< 0.5", unit: "s" },
];

export type TourItem = {
  id: string;
  shot: string;
  alt: string;
  title: string;
  body: string;
  points: string[];
};

export const TOUR: TourItem[] = [
  {
    id: "home",
    shot: "home",
    alt: "Turbo Reader home: the date, counts for today, this week and this month, search, and a band of article cards per category",
    title: "Home",
    body: "The date, a clock, and counts for today, this week and this month. Each count is a filter, with a fourteen-day sparkline.",
    points: ["Pinned feeds first, then a band per category", "Five layouts per category, or auto", "Every card says why it is there"],
  },
  {
    id: "reading",
    shot: "reader",
    alt: "An article open in the reader with its full text loaded",
    title: "Reading",
    body: "A dense three-pane list or a card grid with cover art. Load the full text for feeds that only publish a teaser.",
    points: ["Full-text search with SQLite FTS5, as you type", "Reading mode on z, the article alone", "Newest-first or oldest-first"],
  },
  {
    id: "actions",
    shot: "menu",
    alt: "The article actions menu: copy link, copy as Markdown, save as PDF, font, QR code",
    title: "Article actions",
    body: "Copy the link, save as Markdown or PDF, or send it to your phone with a QR code.",
    points: ["Hide an article", "Mark all read from 1, 3 or 7 days back", "Starred, unread and all filters per feed"],
  },
  {
    id: "feeds",
    shot: "feed-menu",
    alt: "The feed menu: rename, pin, move, retention and delete",
    title: "Feeds",
    body: "RSS, Atom and JSON Feed, detected automatically. Right-click a feed to rename, move, pin, set retention or delete it.",
    points: ["OPML import and export, folders kept", "Duplicates collapsed across feeds", "Conditional GET: an unchanged feed costs one 304"],
  },
  {
    id: "appearance",
    shot: "light",
    alt: "Turbo Reader home in the light theme",
    title: "Appearance",
    body: "Light, dark, or paper, a warm low-contrast page for long reading. Seven accents or any colour you pick.",
    points: ["Six bundled open-source reading fonts", "Comfortable and compact density", "Four interface sizes on Ctrl + / - / 0"],
  },
  {
    id: "settings",
    shot: "settings",
    alt: "The settings panel with appearance, reading, home and library tabs",
    title: "Settings and background",
    body: "Keep it running in the tray so refreshes carry on, start at login, and get a notification when new articles arrive. All off until you turn them on.",
    points: ["Storage shows what the library takes, and frees it", "A release check you can switch off", "Animations you can switch off"],
  },
  {
    id: "keyboard",
    shot: "shortcuts",
    alt: "The keyboard shortcut sheet",
    title: "Keyboard first",
    body: "Every action has a key, and ? shows them all. Ctrl K searches feeds, folders and articles from anywhere.",
    points: ["j and k move between articles", "s stars, m marks read, f loads the full text", "r refreshes every feed"],
  },
];

export const RUST_TEST = `#[test]
fn geolocation_cannot_survive_sanitising() {
    let hostile = r#"<p>a <geolocation> b</p><script>alert(1)</script>"#;
    let out = sanitise(hostile, None);
    assert!(!out.contains("<geolocation"));
    assert!(!out.contains("<script"));
}`;
