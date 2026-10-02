# Changelog

All notable changes to Turbo Reader are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
  to reason about, which is the failure mode that made Fluent Reader open blank.

[Unreleased]: https://github.com/t21dev/turbo-reader/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/t21dev/turbo-reader/releases/tag/v0.1.0
