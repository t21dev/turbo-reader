# Changelog

All notable changes to Turbo Reader are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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

[Unreleased]: https://github.com/t21dev/turbo-reader/compare/v0.8.0...HEAD
[0.8.0]: https://github.com/t21dev/turbo-reader/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/t21dev/turbo-reader/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/t21dev/turbo-reader/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/t21dev/turbo-reader/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/t21dev/turbo-reader/releases/tag/v0.4.0
[0.3.0]: https://github.com/t21dev/turbo-reader/releases/tag/v0.3.0
[0.2.0]: https://github.com/t21dev/turbo-reader/releases/tag/v0.2.0
[0.1.0]: https://github.com/t21dev/turbo-reader/releases/tag/v0.1.0
