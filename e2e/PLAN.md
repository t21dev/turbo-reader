# End-to-end test plan

Every user-facing flow, exercised against the real release binary, with the
real Rust backend and a real SQLite database. No mocks.

## How

| Piece | Choice | Why |
| --- | --- | --- |
| Driver | `tauri-driver` + `msedgedriver` 154 | Matches the installed WebView2 runtime exactly, so the DOM under test is the one users get |
| Client | ~150 lines of W3C WebDriver over `fetch`, no dependencies | Nothing to install, nothing to keep current |
| Isolation | Built with identifier `dev.t21.turbo-reader.e2e` | Its own database and its own WebView2 profile. A test can never touch real feeds, real settings or real window state |
| Feeds | A local fixture server | Deterministic content, controllable failures, no network |
| Assertions | DOM state **and** backend state | After a UI action, read the database back through `invoke` to prove it persisted, not just that the screen changed |

Things outside the DOM are tested at the command layer behind them: the
native open and save dialogs, the print dialog, and opening the system
browser. The clipboard is read back through the OS.

### Fixture server

`rss.xml` RSS 2.0, five items, spread over a week, two with images ·
`atom.xml` Atom · `feed.json` JSON Feed · `youtube.xml` YouTube-shaped Atom,
no body, text under `media:group` · `teaser.xml` one-line items whose links
point at full article pages · `dupe-a.xml` and `dupe-b.xml` the same story in
two feeds with different tracking parameters · `hostile.xml` `<geolocation>`
and `<script>` · `broken.xml` returns 500 · `site.html` an HTML page with an
RSS autodiscovery link · `grow.xml` gains an item on every request · `etag.xml`
answers 304 to a matching `If-None-Match`

## Flows

### A. Feeds and folders
- A1 Add a feed by URL, it appears with its title, favicon and articles
- A2 Add a feed with a bad URL, a clear error, nothing added
- A3 Add a site URL rather than a feed URL
- A4 Add a URL without `https://`
- A5 Add a feed that is already subscribed
- A6 Cancel adding with Escape; `n` opens the field
- A7 Rename a feed
- A8 Pin and unpin a feed, the pin shows in the rail and on home
- A9 Move a feed into a folder, and back out to no folder
- A10 Set a feed's retention limit, older articles are removed, starred survive
- A11 Copy a feed's URL
- A12 Open a feed's website
- A13 Delete a feed, its articles go, the view does not point at a ghost
- A14 Create a folder from the button, from a folder's menu, from empty rail
- A15 Rename a folder
- A16 Delete a folder, its feeds survive outside it
- A17 Expand and collapse a folder, and it stays that way after a restart
- A18 Alphabetical ordering applies to feeds and folders

### B. Lists and navigation
- B1 Each scope shows the right articles: Home, All, Unread, Starred, folder, feed
- B2 Card and list view toggle, remembered across restarts
- B3 Opening an article marks it read and the unread counts drop everywhere
- B4 `j` and `k` move through articles
- B5 Star and unstar from the list, a card and the reader, counts agree
- B6 Mark read and unread from the reader and with `m`
- B7 Hide an article from the list, a card, the reader menu and with `h`
- B8 Mark all read: all, and older than 1, 3 and 7 days, within scope only
- B9 Search, from the field, `/` and `Ctrl+F`, and Escape clears it
- B10 Unread only, hide duplicates and sort order toggles
- B11 Switching scope resets the scroll position
- B12 The duplicate story shows once with duplicates hidden, twice without

### C. Reader
- C1 Load full content replaces a teaser with the article body
- C2 Load full content on a page with nothing better says so
- C3 Copy link
- C4 Save as Markdown produces a valid document
- C5 Save as PDF opens the print dialog without an error
- C6 Open in browser
- C7 Font, size, line width and direction apply to the article
- C8 QR code shows and hides
- C9 Back to the list with the button and Escape in card view
- C10 A YouTube entry shows its description and a video poster
- C11 Hostile markup is stripped and the window survives

### D. Home
- D1 Opens on home by default; `g` toggles it
- D2 Today, week and month counts are correct and each one scopes the page
- D3 Search on home
- D4 Pinned feed chips open that feed
- D5 See all opens the folder
- D6 Opening an article from home goes to the reader
- D7 Interests lift and mutes sink articles
- D8 Hiding a section and a category in Settings removes it from home
- D9 Category layout override sticks

### E. Settings
- E1 Theme, accent, density, animations, interface size, and each persists
- E2 Reading font, size, width and direction
- E3 Refresh interval and the last checked line
- E4 Feed order
- E5 YouTube playback preference
- E6 Library stats agree with what the sidebar shows
- E7 Check for updates reports a result
- E8 Reset appearance
- E9 Escape and the backdrop close it

### F. Global
- F1 Refresh with `r` and the button, new articles arrive, busy state clears
- F2 A feed that fails shows its error and the others still refresh
- F3 Conditional GET: an unchanged feed is not re-parsed
- F4 Auto-refresh fires on its interval
- F5 Shortcut sheet opens with `?` and closes with Escape
- F6 Sidebar collapses with `Ctrl+B`
- F7 Interface size with `Ctrl` `+` `-` `0`

### G. Import and export
- G1 Export produces OPML that lists every feed in its folder
- G2 Import adds feeds and folders, skips ones already present
- G3 Imported feeds have articles without a manual refresh
- G4 Round trip: export, wipe, import, same structure

## Suspected from reading the code, to confirm first

1. **Move to folder is broken.** The client sends `groupId: [3]`; the command
   expects `Option<Option<i64>>`, which serde will not read from an array. The
   UI ignores the rejected promise, so it fails silently.
2. **Settings strings never match.** `set_setting` stores JSON, so `alpha` is
   saved as `"alpha"` with its quotes, and the readers compare against the bare
   word. Alphabetical sort and the interest and mute lists would never apply.
3. **Errors are swallowed.** Most actions are `void api.x()` with no `catch`,
   so a failure looks identical to success.
4. Adding a site URL fails: there is no feed autodiscovery.
5. A URL without a scheme fails.
6. Re-adding a subscribed feed silently overwrites a name you chose.
7. Imported feeds stay empty until a manual refresh.
8. Library stats count hidden articles, so they disagree with the sidebar.

## Results

86 tests across 9 files, all passing against the real app (about four and a
half minutes). Every flow above has at least one test.

Bugs the suite found, all fixed:

- Every dialog after the first opened invisible. The shared dialog stayed in
  its closing state, so its transparent backdrop swallowed every click until
  the app was restarted.
- Move to folder always failed. The command took `Option<Option<i64>>`, which
  serde cannot fill from a plain number or null, and the error was swallowed.
- Settings stored as JSON strings were read back with their quotes, so the
  sort order and home settings silently fell back to defaults.
- Automatic refresh ran on a webview timer that was throttled when the window
  was hidden, reset on every state change and started over on each launch.
  It now runs in Rust against `last_fetched` in the database.
- A feed answering 304 never updated `last_fetched`, so it looked stale forever
  and was refetched on every launch.
- Unread counts and stats included hidden feeds.
- Editing interests then mutes quickly lost the first edit, and closing
  Settings mid-edit lost the second.
- Clicking a menu button while its menu was closing left it shut.
- Escape in the search box did nothing.
- Importing OPML added feeds with no articles until the next refresh.
- Failed actions (move, pin, star, rename, delete) looked like success.

Changes asked for during the pass:

- Every destructive action asks first: delete feed, delete folder, hide,
  mark all read (with the count), lowering how many articles a feed keeps
  (with how many would go), and reset appearance.
- Adding a feed is a dialog with a Check step that previews the feed, finds
  the feed behind a website address, and spots existing subscriptions.

Limits of the harness: WebDriver gives every session a fresh WebView2 profile,
so persistence of `localStorage` is tested with a page reload rather than a
real restart. Native file dialogs (OPML import and export) are driven through
their commands rather than the dialogs themselves.
