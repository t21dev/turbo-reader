# Changelog

All notable changes to Turbo Reader are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- Home on a new day no longer sits blank until the first refresh finishes.
  While a refresh runs on an empty page it shows placeholder cards, and when
  there is still nothing it says so, naming the window: "Nothing published
  today yet."

## [0.25.0] - 2026-10-06

### Added
- Share in the article's More menu opens the system share sheet with the
  article's title and link: Windows' Share, or the Mac's. It shows only where
  the system has one.

## [0.24.1] - 2026-10-05

### Changed
- On Windows the right-click menu is the webview's own again, which opens
  right at the pointer, trimmed to what helps: Copy for selected text, the
  editing items in text fields, Copy link on links, and Copy image, Copy image
  address and Save image as on pictures. Back, Reload, Print, Open link in new
  window and More tools are gone, and empty space opens no menu. On macOS and
  Linux the native menu now opens at the pointer instead of drifting when the
  interface is zoomed.

## [0.24.0] - 2026-10-05

### Changed
- Right click opens a native menu with what fits the spot: Copy for selected
  text, Cut, Copy and Paste in text fields, Open in browser and Copy link on
  links, and Copy image, Copy image address and Save image as on pictures.
  The webview's own browser menu, with Reload and its developer tools, no
  longer appears anywhere in the app.

### Fixed
- A right click on a picture in an article no longer opens the lightbox.
  Pictures show a pointer, since a click opens them.

## [0.23.0] - 2026-10-05

### Added
- Search in long Settings lists: the pinned feeds picker finds a feed by a
  loose name, and recent agent activity filters by key or tool. Each box
  shows once the list passes six entries, and Escape clears it before it
  closes Settings.

### Changed
- Cards no longer lift on hover. Only the picture inside eases in, and the
  border brightens.

## [0.22.1] - 2026-10-05

### Changed
- Retry every feed is an icon at the right of the bell's Needs attention
  heading, named on hover, instead of a row of its own.

### Fixed
- When a site will not hand its full article to an app (Cloudflare's
  "Verify you are human" check answers 403), Load full content says the site
  only shows it in a browser and that `o` opens it there, instead of printing
  the address and "403 Forbidden".
- View all in notifications shows what needs attention too, such as a new
  version or a failing feed, instead of "No notifications" while the bell
  showed a count.

## [0.22.0] - 2026-10-05

### Changed
- The list and card view switch is back in the title bar, beside search, and
  hidden on Home, where there is no list for it to change. `v` does nothing
  on Home either.

## [0.21.0] - 2026-10-05

### Added
- Clicking a picture in an article opens it in a lightbox. Zoom with the
  buttons, the mouse wheel, a double click or `+`, `-` and `0`, and drag to
  look around once zoomed in. Download saves the picture, and when it linked
  somewhere, that page opens in your browser. Escape, the close button or a
  click outside closes it.
- A privacy policy, [PRIVACY.md](PRIVACY.md): what stays on your computer and
  the few times the app goes online.

### Changed
- The title bar has three controls on the right: search, notifications and a
  menu holding Settings, the view switch, keyboard shortcuts and About.
  Refresh sits next to the unread count.

### Fixed
- Clicking a picture or a link inside an article no longer replaces the app
  with that page and no way back. Links open in your browser, and the window
  refuses to navigate anywhere outside the app.
- A failure in the reader, such as "Could not find a fuller article", shows as
  a warning instead of with a success check.
- The new-version pill in the title bar can be clicked.

## [0.20.0] - 2026-10-05

### Added
- The welcome screen comes in three short steps: bring in your feeds, pick a
  look (each theme shown in its own colours), and choose how the app runs.
  Back and Next move between them, every step can be skipped, and it stays
  until you finish, even after the first feed is added.
- A notification bell in the title bar. A number on it means something needs
  you: a feed that keeps failing, or a new version. A dot means something new
  landed: refreshes that found articles while you were away, and changes AI
  agents made, under the agent's name. The panel shows what needs attention
  and the latest entries; View all opens the full history a page at a time,
  where entries can be removed or cleared. The last 200 are kept, on your
  computer only.
- The search box (`Ctrl+K`) finds every setting too, and opens the right tab.
  Feed, folder and setting names match loosely: "drk mod" finds Dark mode.
- Search inside Settings: type in the box above the tabs, and choosing a match
  opens its tab and points at the setting.
- Back and forward, as in a browser: `Alt+Left` and `Alt+Right` (`Cmd+[` and
  `Cmd+]` on macOS) or the mouse's side buttons step through the places you
  visited, with the article that was open in each.
- The card view's header can switch unread only, hide duplicates and newest or
  oldest first, as the list does.
- Article text can be selected and copied, in the reader and in reading mode.
- An About button (the i in the title bar) shows the version you are running,
  checks for a newer one, and holds the check-at-launch switch.

- Mark all as unread, in the same menu as mark all as read. It asks first and
  says how many, and hidden articles stay hidden.
- The card view has a header with the list's name and the mark-all menu, so
  marking everything read or unread works there too, not only in the list.

### Changed
- Customize on the home page sits under the clock, as a quiet action, instead
  of a bordered button beside it.
- The title bar no longer has a Home button; Home is in the sidebar, and `g`
  still goes there.
- Destructive actions use a deeper rose.
- Settings is a tabbed window instead of one long panel: Appearance, Reading,
  Home, Feeds, Storage, Background and AI agents. Up and Down move between
  tabs, and it reopens on the tab you used last. Customize on the home page
  opens it on Home.
- Turbo Reader is now free and open source under the MIT licence, replacing
  the non-commercial licence. Anyone can use it for anything, commercial use
  included, as long as the copyright notice stays.
- Every release carries `SHA256SUMS.txt`, the SHA-256 checksum of each
  download.
- Built with Tailwind CSS v4 instead of v3. The app looks the same. Two
  motions now run as designed: the sidebar slides away over 280ms (v3 quietly
  dropped that duration and used 150ms), and the first cards in the card view
  lift on hover like the rest.
- Class names are joined and merged by the `cn` package, replacing clsx and
  tailwind-merge.

### Fixed
- A window left maximized opens maximized again, and goes back to its last
  normal size and position when restored. Only the normal size was saved
  before.
- Clicking the title bar could maximize the window. A press handed the window
  straight to the system to move it, so the app never saw that click finish,
  and the next click soon after counted as a double-click. The window now
  starts moving only once the mouse moves with the button held, as a native
  title bar does.

## [0.10.0] - 2026-10-04

### Added
- Search everything from one box: the search button in the title bar or
  `Ctrl+K` (`Cmd+K` on macOS) finds feeds and folders by name or address, and
  articles through the full-text index. Enter opens the result, and the last
  row hands the words to the list search.
- Settings > Storage, with the size of each part and a way to free it:
  - Compact the database, which gives back the space left by deleted
    articles. Nothing is deleted.
  - Remove downloaded full articles, which puts back the text the feed sent.
  - Delete read articles older than 30, 90 or 180 days. Starred and unread
    articles stay, and deleted ones do not come back on the next refresh.
  - Clear the webview cache (images and page files), done at the next start
    because the webview holds it open. Settings are kept.

### Changed
- Destructive actions and errors use a rose red instead of a pure red.
- Search matches the last word as you type it, so "kuber" finds
  "kubernetes", in the list search and for AI agents too.
- Loading the full article keeps the feed's own text aside, so the download
  can be removed later.

### Fixed
- The Paper theme no longer flashes white while the app starts.

## [0.9.0] - 2026-10-04

### Added
- Six reading fonts, all open source (SIL OFL) and bundled so they work
  offline: Libron, Literata, Source Serif 4, Merriweather and Atkinson
  Hyperlegible Next, alongside Geist, the system serif and a mono. Only Latin
  glyphs are bundled to keep the app small; other scripts and emoji fall back
  to the system's fonts, with each platform's colour emoji font.
- A Paper theme: a warm, low-contrast page for long reading.
- Reading mode (`z`, or the book button in the reader): the article alone,
  with the sidebar and list out of the way. `Esc` brings them back.
- AI agents can use Turbo Reader as a news source, over the Model Context
  Protocol (MCP). Off by default; turn it on in Settings > AI agents or on the
  welcome screen.
  - A local HTTP server inside the app, for Claude Code, Cursor and others,
    with API keys that are read-only or read and write, shown once and stored
    only as a hash. Bearer, Basic and X-API-Key all work.
  - `turbo-reader --mcp`, which agents such as Codex and Claude Desktop start
    themselves. Read-only unless started with `--allow-write`.
  - 13 tools: get_stats, list_folders, list_feeds, get_latest,
    search_articles, get_article, get_digest, preview_feed, and with write
    access subscribe, unsubscribe, mark_read, star and refresh_feeds.
  - This computer only by default; other computers on your network only when
    you allow it. Requests from web pages are refused.
  - Settings shows ready-to-copy setup for Claude Code, Codex, Claude Desktop
    and Cursor, and the last 50 agent calls.
  - The full guide is in docs/mcp.md.
- Background mode, all off by default and offered on the welcome screen as
  well as in Settings > Background:
  - Keep running in the tray when the window closes, so scheduled refreshes
    carry on. The tray menu opens the window, refreshes now, or quits.
  - Start at login, quietly in the tray when the tray is on.
  - New-article notifications after a background refresh, for all feeds or
    pinned feeds only. The system asks for permission first where it needs to.
- On macOS, clicking the Dock icon brings back a window hidden to the menu bar.

### Changed
- The build checks run on Windows, macOS and Linux on every push.

## [0.8.0] - 2026-10-04

### Added
- A welcome screen for a library with no feeds: add a feed, import an OPML
  file, or subscribe to a few starters (Hacker News, The Verge, Ars Technica,
  BBC News, Smashing Magazine, xkcd) in one go. It used to open on an empty
  home page.

## [0.7.0] - 2026-10-04

### Added
- Turbo Reader checks for a new release when it opens and shows "Update to"
  in the title bar when there is one, which opens the release page. Turn it off
  under Settings > Updates, where the manual check still lives.

### Changed
- Articles without an image show a faint picture outline instead of the feed
  icon in a frosted chip, which looked like a video's play button.

## [0.6.0] - 2026-10-04

### Added
- A portable version for Windows: a zip that runs without installing. While a
  `portable` file sits next to the exe, the library, settings and window
  position live in a `data` folder beside it.
- `docker/linux-build.Dockerfile` builds the Linux `.deb`, `.rpm` and
  `.AppImage` in Docker, so they can be made on any machine.

## [0.5.0] - 2026-10-03

### Added
- A custom accent colour. The last swatch opens the colour picker, and a hex
  box takes a typed or pasted code. If the colour would be hard to see on the
  current background, it is lightened or darkened a little.

### Fixed
- Large libraries are fast again. With 500 feeds and 20,000 articles the
  sidebar took over 30 seconds to load, because every feed's unread count
  walked the whole article table. It now takes a few milliseconds.
- Refreshing no longer waits for favicons. Articles appear as soon as they are
  stored and icons follow in the background; a site without an icon is not
  asked again on every refresh. A first refresh of 500 local feeds went from
  over four minutes to about two seconds.
- Favicons for sites on a non-standard port were looked up on port 80.
- A web page served in place of a favicon is no longer saved as the icon.
- Storing a refresh is one database transaction instead of one per article,
  and the write-ahead log is trimmed afterwards rather than left at the size of
  the largest refresh (95 MB after a 20,000 article import).

## [0.4.0] - 2026-10-03

### Added
- Arrange home your way. In Settings > Home, move sections (Glance, Search,
  Pinned, Categories) up or down, and put categories in a home order of their
  own without touching the sidebar.
- A card size setting for home: small, medium or large.
- A Customize button on home opens the home settings on their own, with a
  link through to all settings.
- Adding a feed opens a dialog with a Check button. It shows the feed's title,
  how many articles it has and the latest three before you subscribe, and
  tells you if you already follow it.
- Paste a website instead of a feed and Turbo Reader finds the feed, from the
  page's own links or the usual places (`/feed`, `/rss.xml` and so on).
- Destructive actions ask first: deleting a feed or folder, hiding an article,
  marking everything read, lowering how many articles a feed keeps, and
  resetting appearance.
- Errors show as a note in the corner instead of failing silently.
- An end to end test suite that drives the real app (`npm run e2e`).

### Fixed
- Only the first dialog in a session worked. Later ones opened invisible and
  blocked every click.
- Moving a feed to another folder always failed.
- Sort order and home settings were read back wrong and fell back to defaults.
- Automatic refresh stalled while the window was minimised and restarted its
  clock on every launch. It now runs in the background and does not refetch
  feeds that were checked a minute ago.
- Feeds that answer "not modified" were treated as never checked.
- Unread counts included hidden feeds.
- Quick edits to interests and mutes could be lost.
- Clicking a menu button while its menu closed left it shut.
- Escape clears the search box.
- Imported feeds are fetched straight away.
- The layout picker for a category always said Auto, even after you chose one.

## [0.3.0] - 2026-10-03

### Added
- Feed and folder management. Right-click a feed to rename it, move it between
  folders, pin it to home, set how many articles it keeps, open its website,
  copy its URL or delete it. Right-click a folder to rename or delete it, and
  there is a new folder button beside the add feed button. The commands behind
  all of this shipped in 0.1 with nothing calling them, so until now the only
  way to organise anything was to import an OPML file.
- Automatic refresh, every 15 minutes, 30, an hour, three hours, or off, with
  a line saying when it last checked. Before this the app fetched once at
  launch and then not again until you pressed `r`.
- Feeds and folders can be sorted alphabetically instead of in the order they
  were imported (#539).
- YouTube feeds show the video. A poster that opens in the browser by default,
  or the player inline if you turn that on in Settings, in which case the
  privacy-enhanced domain is used and nothing loads until you press play
  (#211, #663).
- YouTube entries carry their text under `media:group` rather than in the body,
  so those feeds used to read as a list of titles with nothing behind them.
  The description is now used when there is no body.

### Changed
- The README and the in-app About lead with what Turbo Reader is rather than
  with a comparison to another reader.


## [0.2.0] - 2026-10-02

### Added
- A home page: the date, a clock, and one optional line, either a quote from a
  file you can edit or the top story. Counts for today, this week and this
  month, each a button that scopes the page, with a fourteen-day sparkline.
  Search over the same index the article list uses. Pinned feeds as a row. A
  band per category.
- Five layouts per category: cards, mosaic, magazine, compact and headlines,
  chosen per category or left on auto, which decides from whether that
  category's feeds actually carry images.
- Ranking that needs no API key: freshness on an eighteen hour half-life,
  unread, how often you open a feed, pinned feeds, your own interest and mute
  lists, and a penalty for a story three feeds all ran. A line wrapped in
  slashes is a regular expression, anything else a substring. Every card says
  why it is there.
- Pinned feeds, which both get their own row and lift that feed's articles
  through the rest of the page.
- Check for updates, in Settings.
- A placeholder for articles with no cover image, tinted from the source so a
  grid keeps its shape instead of punching holes in itself.

### Fixed
- The window remembers its size and position. It did not before, and the two
  obvious fixes both made it worse: `tauri-plugin-window-state` grew the window
  43px per launch, and a hand-rolled version built on Tauri's `inner_size()`
  shrank it by the same amount, because that number disagrees with the real
  client rect on an undecorated window and lags a launch behind. Geometry is
  now read from the OS, stored in physical pixels so a fractional scale factor
  cannot round it, and corrected once the window is on screen.
- The white flash while the app started. The window now opens hidden behind a
  centred mark and is shown once there is something to look at.
- Dismissing a dialog, a menu or a toast animated in and then vanished on one
  frame. They all animate out now.

## [0.1.0] - 2026-10-02

First public release.

### Added
- Three-pane reader (feeds, articles, reader) with card and list views
- Custom title bar with window controls, matching the rest of the t21 apps
- Source favicons, fetched and cached locally
- Full-text search across every article, backed by SQLite FTS5
- Unread, starred and all filters; per-feed and per-group scoping
- Newest-first and oldest-first ordering
- Cross-feed duplicate collapsing, keyed on the destination URL with tracking
  parameters stripped
- Per-feed retention limits
- OPML import and export, folder nesting preserved both ways
- Light, dark and system appearance with seven accent colours and two densities
- Keyboard shortcuts throughout, with a sheet on `?`
- Window dragging, double-click to maximize, and working window controls
- Collapsible sidebar on `Ctrl+B`
- Four interface sizes on `Ctrl` `+` / `-` / `0`, and a working density switch
- Article font, text size, line width and text direction
- Load full content for feeds that publish only a teaser
- Copy link, save as Markdown, save as PDF, and a QR code for the article link
- Hide an article, and mark all as read from 1, 3 or 7 days back
- Animation throughout, with an off switch and `prefers-reduced-motion` support
- Conditional GET, so an unchanged feed costs one `304` and no parsing

### Changed
- Licence is now free for non-commercial use; commercial use needs a separate
  licence from t21 dev

### Fixed
- Window controls, dragging and "open in browser" did nothing, because the app
  shipped without a Tauri capability file and so had no permissions at all
- Switching feed or filter kept the old scroll position, dropping you into the
  middle of articles you had not seen

### Security
- Feed HTML is fetched, parsed and sanitised in Rust against an allowlist before
  it reaches the webview. An article cannot introduce an element the renderer has
  to reason about, which is a failure mode browser engines do not let a page
  recover from.

[Unreleased]: https://github.com/t21dev/turbo-reader/compare/v0.25.0...HEAD
[0.25.0]: https://github.com/t21dev/turbo-reader/compare/v0.24.1...v0.25.0
[0.24.1]: https://github.com/t21dev/turbo-reader/compare/v0.24.0...v0.24.1
[0.24.0]: https://github.com/t21dev/turbo-reader/compare/v0.23.0...v0.24.0
[0.23.0]: https://github.com/t21dev/turbo-reader/compare/v0.22.1...v0.23.0
[0.22.1]: https://github.com/t21dev/turbo-reader/compare/v0.22.0...v0.22.1
[0.22.0]: https://github.com/t21dev/turbo-reader/compare/v0.21.0...v0.22.0
[0.21.0]: https://github.com/t21dev/turbo-reader/compare/v0.20.0...v0.21.0
[0.20.0]: https://github.com/t21dev/turbo-reader/compare/v0.10.0...v0.20.0
[0.10.0]: https://github.com/t21dev/turbo-reader/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/t21dev/turbo-reader/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/t21dev/turbo-reader/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/t21dev/turbo-reader/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/t21dev/turbo-reader/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/t21dev/turbo-reader/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/t21dev/turbo-reader/releases/tag/v0.4.0
[0.3.0]: https://github.com/t21dev/turbo-reader/releases/tag/v0.3.0
[0.2.0]: https://github.com/t21dev/turbo-reader/releases/tag/v0.2.0
[0.1.0]: https://github.com/t21dev/turbo-reader/releases/tag/v0.1.0
