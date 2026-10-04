<div align="center">

<img src="app-icon.png" width="96" alt="Turbo Reader" />

# Turbo Reader

**A modern RSS reader that is actually fast and actually small.**

<sub>A 5 MB installer that opens in under a second and holds 20,000 articles in a 14 MB core process. Rust core, React shell, built with Tauri 2.</sub>

<br />

By **[t21 dev](https://github.com/t21dev)** and **[TriptoAfsin](https://github.com/TriptoAfsin)**

[![Release](https://img.shields.io/github/v/release/t21dev/turbo-reader?style=flat-square&label=release)](https://github.com/t21dev/turbo-reader/releases/latest)
[![Build](https://img.shields.io/github/actions/workflow/status/t21dev/turbo-reader/build.yml?branch=main&style=flat-square)](https://github.com/t21dev/turbo-reader/actions)
[![Licence](https://img.shields.io/badge/licence-non--commercial-blue?style=flat-square)](LICENSE)

</div>

---

## Install

Download from the [latest release](https://github.com/t21dev/turbo-reader/releases/latest).

| Platform | File |
| --- | --- |
| Windows | `_x64-setup.exe` or `.msi`, or `_x64_portable.zip` to run without installing |
| macOS | `_aarch64.dmg` for Apple silicon, `_x64.dmg` for Intel |
| Linux | `.AppImage`, `.deb` or `.rpm` |

**Portable on Windows.** Unzip the portable zip anywhere, a USB stick included,
and run `Turbo Reader.exe`. The `portable` file beside it keeps your library,
settings and window position in a `data` folder next to the exe, so the whole
reader moves with the folder. Delete the `portable` file to use the normal
per-user data folder instead. It needs the Microsoft Edge WebView2 Runtime,
which Windows 10 and 11 already have.

The builds are not code-signed, so Windows SmartScreen and macOS Gatekeeper
warn on first run. On macOS, right-click the app and choose Open, or run
`xattr -cr "/Applications/Turbo Reader.app"`.

## Screenshots

![The home page: counts, search, pinned feeds and a band per category](docs/screenshot-home.png)

| Feed management | The reader |
| --- | --- |
| ![Rename, pin, move, retention, delete](docs/screenshot-feed-menu.png) | ![An article with its full text loaded](docs/screenshot-reader.png) |

| Article actions | Light |
| --- | --- |
| ![Copy link, Markdown, PDF, font, QR code](docs/screenshot-menu.png) | ![Home in light](docs/screenshot-light.png) |

| Settings | Shortcuts |
| --- | --- |
| ![Appearance, reading, home and library settings](docs/screenshot-settings.png) | ![The keyboard shortcut sheet](docs/screenshot-shortcuts.png) |

---

## What makes it different

**A home page, not a backlog.** Most readers open on everything you have not
read, which is the same question again rather than an answer. Turbo Reader
opens on what happened since you last looked: counts for today, this week and
this month, your pinned feeds first, and a section per category.

**Ranking that needs no account and no API key.** Freshness, what you have
read, which feeds you actually open, the feeds you pinned, and two keyword
lists you write yourself. It runs locally, makes no network calls, and every
card tells you why it is there.

**Five layouts, per category.** Cards, mosaic, magazine, compact or headlines,
chosen per folder or left on auto, which decides from whether that folder's
feeds carry images rather than guessing.

**It cannot be taken down by an article.** Feed HTML is fetched, parsed and run
through an allowlist sanitiser in Rust before the webview ever sees it. Browser
engines terminate the renderer outright on certain malformed markup, and that
is not an exception any `try/catch` or error boundary can catch, so the only
real defence is never handing it over in the first place.

```rust
#[test]
fn geolocation_cannot_survive_sanitising() {
    let hostile = r#"<p>a <geolocation> b</p><script>alert(1)</script>"#;
    let out = sanitise(hostile, None);
    assert!(!out.contains("<geolocation"));
    assert!(!out.contains("<script"));
}
```

## Features

**Home**
- The date, a clock, and one optional line: a quote from a file you can edit,
  or the top story
- Counts for today, this week and this month, each one a filter, with a
  fourteen-day sparkline
- Search across everything, pinned feeds as a row, and a band per category
- Five layouts per category: cards, mosaic, magazine, compact and headlines,
  or auto, which decides from whether that category's feeds carry images
- Put the sections in any order, hide the ones you do not use, give categories
  a home order separate from the sidebar, and choose small, medium or large cards,
  all from the Customize button on home
- Ranking with no API key and no network: freshness, unread, how often you
  open a feed, the feeds you pinned, and your own interest and mute lists.
  A line in slashes is a regular expression, anything else a substring
- Every card says why it is there

**Reading**
- Two views: a dense three-pane list, or a card grid with cover art
- Unread, starred and all filters, scoped per feed or per group
- Newest-first or oldest-first ordering
- Full-text search across every article, backed by SQLite FTS5
- Load full content for feeds that only publish a teaser
- Reading mode on `z`: the article alone, with the sidebar and list out of the way
- Copy link, save as Markdown, save as PDF, QR code to a phone
- Hide an article, or mark all as read from 1, 3 or 7 days back
- Keyboard first, with a shortcut sheet on `?`
- Checks for a new release at launch and shows it in the title bar (can be switched off), plus a manual check in Settings

**Appearance**
- Light, dark, paper (a warm, low-contrast page for long reading), or follow the system
- Seven accent colours, or any colour you pick
- Comfortable and compact density
- Four interface sizes, on `Ctrl` `+` / `-` / `0`
- Six open-source reading fonts, bundled so they work offline: Geist, [Libron](https://github.com/nicoverbruggen/libron), Literata, Source Serif 4, Merriweather and Atkinson Hyperlegible Next, plus the system serif and a mono. Other scripts and emoji fall back to the system's own fonts
- Article text size, line width and text direction
- Animations you can switch off

**Feeds**
- RSS 0.9x, 1.0 and 2.0, Atom, and JSON Feed, detected automatically
- Right-click a feed to rename, move, pin, set retention or delete it, and a
  folder to rename or delete it
- Automatic refresh on a timer, or manual only
- Sorted as imported or alphabetically
- YouTube feeds show the video, in the browser or inline
- OPML import and export, with folder nesting preserved both ways
- Conditional GET, so an unchanged feed costs one `304` and no parsing
- Per-feed retention limits
- Duplicate collapsing across feeds, keyed on the destination URL with tracking parameters stripped, so a story syndicated through three feeds shows up once

**Background** (all off until you switch them on, on the welcome screen or in Settings)
- Keep running in the tray when the window closes, so refreshes carry on: the notification area on Windows, the menu bar on macOS, the system tray on Linux (GNOME needs the AppIndicator extension)
- Start at login, quietly in the tray
- A notification when a background refresh brings new articles, for all feeds or pinned feeds only

## Use it with AI agents

Turbo Reader can be a news source for Claude Code, Codex, Claude Desktop,
Cursor and any other agent that speaks the
[Model Context Protocol](https://modelcontextprotocol.io). Ask "what's new in
my feeds today?" or "summarise this week's articles about Kubernetes, with
links", and the agent reads your own library.

- **Two ways in.** A local server inside the app, with API keys, or
  `turbo-reader --mcp`, which an agent starts itself with the app closed.
- **Off by default**, and local to this computer unless you allow your network.
- **Read-only unless you say otherwise**, per key.
- 13 tools: latest articles, full-text search, full articles as Markdown,
  digests, feeds and folders, and (with write access) subscribe, star and
  mark read.

Turn it on in Settings > AI agents, where the setup for each agent is ready to
copy. The full guide, with every tool and real example answers, is in
[docs/mcp.md](docs/mcp.md).

## Long-requested, finally shipped

The feature set is not guesswork. These are the most-upvoted open requests in
the desktop RSS community, several of them open for years, and where each one
stands here.

| Request | Votes | Status |
| --- | --- | --- |
| [#246](https://github.com/yang991178/fluent-reader/issues/246), [#554](https://github.com/yang991178/fluent-reader/issues/554) Sort oldest to newest | 8, 4 | Shipped |
| [#144](https://github.com/yang991178/fluent-reader/issues/144), [#334](https://github.com/yang991178/fluent-reader/issues/334), [#533](https://github.com/yang991178/fluent-reader/issues/533) Hide duplicate articles | 8, 7, 3 | Shipped |
| [#334](https://github.com/yang991178/fluent-reader/issues/334) Post limit per feed | 7 | Shipped |
| [#347](https://github.com/yang991178/fluent-reader/issues/347), [#397](https://github.com/yang991178/fluent-reader/issues/397) UI scaling, larger fonts | 5, 5 | Shipped as density |
| [#335](https://github.com/yang991178/fluent-reader/issues/335) Theme customisation | 7 | Shipped as accents |
| [#256](https://github.com/yang991178/fluent-reader/issues/256) Identify articles by `guid` | 2 | Shipped |
| [#629](https://github.com/yang991178/fluent-reader/issues/629) FeedBurner returns 403 | 4 | Shipped, browser User-Agent |
| [#592](https://github.com/yang991178/fluent-reader/issues/592) Keyboard shortcuts | 2 | Shipped, with a shortcut sheet |
| [#539](https://github.com/yang991178/fluent-reader/issues/539) Sort groups and feeds alphabetically | 4 | Shipped |
| [#316](https://github.com/yang991178/fluent-reader/issues/316), [#100](https://github.com/yang991178/fluent-reader/issues/100) Tray and background notifications | 21, 16 | Planned |
| [#169](https://github.com/yang991178/fluent-reader/issues/169) Use the site's favicon | 9 | Shipped |
| [#190](https://github.com/yang991178/fluent-reader/issues/190) Nested folders | 4 | Planned |
| [#464](https://github.com/yang991178/fluent-reader/issues/464) HTTP Basic Auth feeds | 7 | Planned |
| [#211](https://github.com/yang991178/fluent-reader/issues/211), [#663](https://github.com/yang991178/fluent-reader/issues/663) YouTube content and previews | 9, 4 | Shipped |
| [#69](https://github.com/yang991178/fluent-reader/issues/69) Podcast feeds | 3 | Planned |
| [#4](https://github.com/yang991178/fluent-reader/issues/4), [#23](https://github.com/yang991178/fluent-reader/issues/23) Feedly and sync services | 87, 39 | Under consideration |

Sync (the Google Reader API, Fever, Miniflux, Nextcloud, Feedly) is the most
requested feature by a wide margin and also the largest body of work. It is out
of scope rather than half built, because a sync that loses your read state once
is worse than none at all.

## Architecture

```
src-tauri/src/
  feed.rs       fetch, parse, sanitise. The security boundary.
  readable.rs   full-content extraction, scored and sanitised
  markdown.rs   HTML to Markdown for the export
  db.rs         SQLite schema, FTS5 index, retention
  opml.rs       OPML import and export, folders preserved
  commands.rs   the Tauri command surface
src/
  lib/api.ts    typed client over those commands
  lib/theme.tsx light and dark modes, accent tokens
  components/   Sidebar, ArticleList, Reader, SettingsPanel
```

Two choices worth explaining.

**SQLite instead of an in-memory store.** Articles stay on disk, queries are paged, and search goes through FTS5, so a library of a hundred thousand articles costs the same at startup as a library of ten.

**Bounded-concurrency fetching.** Refresh polls up to 12 feeds at once on a Tokio semaphore. Unbounded would hammer the connection pool. Serial would be slow.

## Development

```bash
npm install
npm run app          # dev, with hot reload
npm run app:build    # production bundle
cd src-tauri && cargo test
```

End to end tests drive the real app through WebDriver, with its own data
folder so your feeds are never touched. They need
[tauri-driver](https://v2.tauri.app/develop/tests/webdriver/) on your path and
an `msedgedriver.exe` matching your WebView2 version in `e2e/.bin/`.

```bash
npm run e2e:build    # build the test copy of the app
npm run e2e          # run the suite
```

You need Rust (stable) and the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your platform.

**Linux packages without the toolchain.** Docker can build the `.deb`, `.rpm`
and `.AppImage` on any machine, Windows and macOS included:

```bash
docker build -f docker/linux-build.Dockerfile --output dist-linux .
```

The packages land in `dist-linux/`. The image builds on Ubuntu 22.04, the same
base as the release builds, so the AppImage runs on the same distributions.

## Attribution

Turbo Reader is an independent implementation. Thanks to
[Fluent Reader](https://github.com/yang991178/fluent-reader) by Haoyuan Liu,
whose feature design informed parts of this one.

Built with [Tauri](https://tauri.app), [feed-rs](https://github.com/feed-rs/feed-rs), [ammonia](https://github.com/rust-ammonia/ammonia) and [rusqlite](https://github.com/rusqlite/rusqlite). Type is [Geist](https://vercel.com/font). Reading fonts, all under the SIL Open Font License: [Libron](https://github.com/nicoverbruggen/libron) by Nico Verbruggen, [Literata](https://github.com/googlefonts/literata) by TypeTogether, [Source Serif 4](https://github.com/adobe-fonts/source-serif) by Adobe, [Merriweather](https://github.com/SorkinType/Merriweather) by Sorkin Type, and [Atkinson Hyperlegible Next](https://www.brailleinstitute.org/freefont/) by the Braille Institute.

## Fast and small

| | |
| --- | --- |
| Windows installer | **4.7 MB** |
| Installed on disk | **11 MB** |
| Memory, 500 feeds and 20,000 articles | **14 MB** app process, **~270 MB** with the system webview |
| Refresh 500 feeds from a local test server | **0.2 s** |
| Cold start to usable | **under half a second** |

Measured, not estimated, on one Windows machine.

**Where the memory goes.** The Rust process that holds your library, the
database and the fetcher uses about 14 MB, and that number barely moves as the
library grows. Most of the rest belongs to WebView2, the system webview that
draws the window, which runs its own processes: about half of the total is its
GPU process, the hardware-accelerated drawing every Chromium-based window pays
for, and the page itself takes about 60 MB. The app's own JavaScript heap is
under 5 MB. With nothing loaded the whole app sits around 220 MB; Task
Manager's figure is lower, because about half of the GPU process's share is
graphics memory rather than RAM.

Two decisions buy most of that. Tauri uses the webview the operating system
already ships instead of bundling a second copy of a browser, and articles stay
in SQLite with paged queries and an FTS5 index rather than being loaded into
the renderer at startup, so memory does not climb with the size of your
library.

## What is coming

The [AI assistant](docs/ai-assistant-spec.md) is specified and not yet built:
bring your own key, OpenAI-shaped so Claude, Gemini, Kimi, DeepSeek, Groq,
OpenRouter and a local Ollama all work, with summaries, clustering, a
connection test and a token ledger.

The home page already ranks without it, on local scoring and your own interest
and mute lists. The assistant is meant to make that better, not to be the thing
that makes it work.

## Licence

Free for personal, educational and other non-commercial use. Commercial use
needs a separate licence, so [get in touch](https://github.com/t21dev).

Turbo Reader is by [t21 dev](https://github.com/t21dev) and
[TriptoAfsin](https://github.com/TriptoAfsin). See [LICENSE](LICENSE) for the
full terms.
