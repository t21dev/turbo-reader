# Changelog

All notable changes to Turbo Reader are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/t21dev/turbo-reader/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/t21dev/turbo-reader/releases/tag/v0.2.0
[0.1.0]: https://github.com/t21dev/turbo-reader/releases/tag/v0.1.0
