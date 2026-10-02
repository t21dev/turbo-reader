# Home page

Status: spec, not built. Target 0.2, ahead of the assistant in
[ai-assistant-spec.md](./ai-assistant-spec.md).
Owner: t21 dev

## The problem

Turbo Reader currently opens on every unread article, newest first. With 37
feeds that is a wall of a thousand cards, and the thing you actually wanted is
somewhere in the middle of it. Fluent Reader has the same problem and never
solved it.

Home is the answer to one question: **what happened since I last looked?**

## Shape

A new first entry in the sidebar, above All articles, selected on launch. It is
a scroll of bands, not a grid. Each band is independent, each can be turned off,
and the order is the user's.

```
┌──────────────────────────────────────────────────────────┐
│  Thursday, 2 October              14:32                  │   Masthead
│  "A line the user chose, or nothing at all."             │
├──────────────────────────────────────────────────────────┤
│  Today 41   This week 318   This month 1,140             │   Glance
│  ▁▂▅▃▇▄▂  last 14 days                                   │
├──────────────────────────────────────────────────────────┤
│  Search everything                              ⌘K       │   Search
├──────────────────────────────────────────────────────────┤
│  Pinned          [Hacker News] [Simon Willison] [LWN]    │   Favourites
├──────────────────────────────────────────────────────────┤
│  AI · Dev · Engineering                     see all →    │   Category
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐             │
│  │ cover  │ │ cover  │ │ cover  │ │ cover  │             │
│  └────────┘ └────────┘ └────────┘ └────────┘             │
├──────────────────────────────────────────────────────────┤
│  Linux                                      see all →    │   Category
└──────────────────────────────────────────────────────────┘
```

## The bands

### 1. Masthead

Date on the left, a live clock on the right. The clock is on by default because
it is the one thing that is true without a network call and it makes the window
feel like a place rather than a list.

Underneath, an optional line. Three sources, user's pick:

- **Nothing.** The default for anyone who switches it off once.
- **A quote.** From a local file the user can edit, not a service. Ships with
  about sixty lines, one per day by date hash so it does not reshuffle on every
  render. No attribution invented; a line with no known author shows none.
- **A headline.** The single highest-scoring unread article, promoted to the
  masthead.

The quote file lives at `quotes.json` in the app data directory, created on
first run. Editing it is the feature. No download, no API.

### 2. Glance

Three counts and a sparkline. Today, this week, this month, each a button that
filters the rest of the page to that window.

The counts are `COUNT(*)` over `items` with a `published >= ?` bound, which the
existing indexes already serve. The sparkline is 14 daily buckets from one
grouped query. Both are cheap enough to recompute on every refresh rather than
cache.

The window selection persists, so someone who reads weekly gets a weekly page.

### 3. Search

A single field, focused by `/` or `Ctrl+K`, running the FTS5 index that already
backs the article list. Results appear inline, under the field, replacing the
bands while a query is live. Escape clears and the page comes back.

This is the same `list_items` call the list view makes, so there is no second
search path to keep correct.

### 4. Favourites

Pinned sources as a row of chips, each with its favicon and unread count.
Clicking one scopes the whole page to it. A source is pinned from its context
menu in the sidebar, which also gives the sidebar a right-click menu it does
not have yet.

Storage: a `pinned INTEGER NOT NULL DEFAULT 0` column on `sources` and a
`pinned_at` for ordering. Not a settings blob, because it belongs to the row.

### 5. Categories

One band per group, in the sidebar's own order, each showing its top articles
as cards with thumbnails. "See all" opens that group in the normal view.

The card is the one that already exists in `CardGrid`, at a fixed four-across
that reflows to two and then one. A band with no thumbnails anywhere falls back
to a dense text list rather than a row of empty frames, because a grid of
letter-tiles reads as broken rather than minimal.

Per-band layout is a user choice, stored per group: **cards**, **compact
cards** (no cover, title and source only), or **headlines** (a numbered text
list, the densest option). Default is cards for a group whose feeds carry
images and headlines for one whose feeds do not, decided from what is actually
in the database rather than guessed.

## Ranking: what gets shown

Each band shows the top N of its scope. The ranking has two implementations and
the same interface, so the page does not know which one ran.

### Without an API key, which is the default

A scoring pass in Rust, no network, no model. Nothing about this is hidden; the
"why this" tooltip on a card names the rule that lifted it.

```
score =  recency           ·  w1     // half-life of 18 hours
       + unread            ·  w2
       + source_affinity   ·  w3     // how often you open this feed
       + keyword_hits      ·  w4     // the user's own interest list
       + has_thumbnail     ·  w5     // small, breaks ties toward a nicer grid
       - duplicate_penalty ·  w6     // the dedupe hash already exists
       - muted_hits        ·  w7     // the user's own mute list
```

Interests and mutes are plain strings with optional `/regex/` syntax, checked
against title and snippet. A line is a regex when it is wrapped in slashes;
otherwise it is a case-insensitive substring, because most people want
"kubernetes" and not `(?i)\bkubernetes\b`.

Source affinity is derived from the existing read state. A feed whose articles
you open gets lifted; one whose articles you mark read in bulk gets pushed
down. No new tracking, no event log, just a ratio over `items`.

This is the whole product for anyone who never adds a key, and it has to be
good on its own. If the regex path feels like a degraded mode, the feature is
wrong.

### With a key

The assistant from [ai-assistant-spec.md](./ai-assistant-spec.md) re-ranks and
clusters the top 120 candidates the scorer produced. It never sees the whole
library, it never runs unprompted, and its answer is merged, not trusted
wholesale:

- An article the model returns that the scorer did not nominate is dropped
- A cluster with fewer than two members is dissolved back into its band
- A response that fails its schema is discarded and the scorer's order stands

The model's contribution is the clustering and the one-line "why this matters
today" on a band, not the right to decide what exists.

### The typed boundary

Model output crosses into the app through one gate, and the gate is typed.

```ts
// src/lib/ai/schema.ts
export const CurationSchema = z.object({
  clusters: z.array(z.object({
    title: z.string().min(3).max(60),
    why: z.string().max(240),
    itemIds: z.array(z.number().int().positive()).min(2).max(12),
  })).max(8),
  skip: z.array(z.number().int().positive()).max(40),
})
export type Curation = z.infer<typeof CurationSchema>
```

Rules that hold regardless of provider:

1. The schema is the contract. Parse, do not cast. A `as Curation` anywhere in
   this path is a bug.
2. Every ID the model returns is checked against the candidate set before it is
   used. An ID that was not sent is a hallucination, not a lookup.
3. Parse failure is a silent fallback to the scorer, logged in the usage
   ledger as a failed call, never an error dialog. The page still renders.
4. The request is built from a typed candidate list, so the prompt and the
   validator cannot drift apart.

The same gate covers the digest and the per-article summary, with their own
schemas.

## What the user controls

A Home section in Settings, and a quicker version in a menu on the page itself.

- Which bands show, and their order, by drag
- The glance window: today, week, month
- Masthead line: clock only, clock and quote, clock and top headline, bare date
- Per-group layout: cards, compact, headlines
- How many articles each band shows: 4, 8, 12
- Interests and mutes, one per line, with a live count of what each line
  currently matches so a bad regex is visible immediately
- Curation: scoring only, or scoring plus the assistant

Everything here is a row in `settings`, read once at startup.

## Design notes

The page follows the system already in `src/index.css`. Porter tokens, Geist,
the existing `--ease-out`, the radius scale. Nothing new is invented for this
surface.

- **Genre:** modern-minimal, the same as the rest of the app.
- **Macrostructure:** stacked bands, each with a left-aligned section head and
  a right-aligned action. Not a bento grid; the bands are different heights and
  a bento forces them into a lie about equal importance.
- **Section heads:** plain sentence case with a count beside them. No numbered
  eyebrows, no uppercase kickers above headings.
- **Motion:** three primitives and no more. Bands rise on first paint with a
  staggered delay capped at 12 steps, cards lift 3px on hover, the clock's
  minute change crossfades. Everything transform and opacity. The existing
  `data-motion="none"` switch turns all of it off.
- **Empty states:** a band with nothing in it collapses rather than showing a
  placeholder. A home page of empty frames is worse than a shorter one.
- **No invented numbers.** The glance counts are real queries. The sparkline is
  real buckets. If a count cannot be computed it is absent, not zero.

Eight states for every interactive element on the page, including the band
drag handles, which are the easiest to ship with hover only.

## Where the code goes

```
src-tauri/src/home/
  mod.rs        the home_summary command: counts, buckets, bands
  rank.rs       the scorer, with tests on the weights and the mute list
  interests.rs  string and /regex/ matching, compiled once per change
src/components/home/
  Home.tsx       the scroll of bands
  Masthead.tsx   date, clock, optional line
  Glance.tsx     counts and sparkline
  Favourites.tsx pinned chips
  Band.tsx       one category, three layouts
  HomeSettings.tsx
```

One command returns the whole page in one round trip. Seven queries inside a
single lock beats seven IPC calls, and the page should not paint in pieces.

## Schema changes

```sql
ALTER TABLE sources ADD COLUMN pinned     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sources ADD COLUMN pinned_at  INTEGER;
ALTER TABLE groups  ADD COLUMN home_layout TEXT;   -- cards | compact | headlines
CREATE INDEX idx_items_published_read ON items(published DESC, read);
```

Schema version 2. The existing migration path takes it.

## Open questions

- Whether the clock should be seconds-accurate. It costs a repaint a second and
  buys very little; a minute tick is probably right, with seconds as an option.
- Whether "today" means since midnight or the last 24 hours. Midnight matches
  how people talk, 24 hours matches how feeds behave at 23:50.
- Whether source affinity should decay. A feed you loved in March and ignore
  now should fall, and that needs a window rather than a lifetime ratio.
- Whether the interests list should seed itself from what the user has starred.
  Helpful, and it makes the first run less empty, but it guesses on the user's
  behalf in a place where being wrong is annoying.
