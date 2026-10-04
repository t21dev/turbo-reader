# Turbo Reader design

This file records how Turbo Reader looks and behaves today, taken from the code. New UI must follow it. If the code and this file disagree, fix one of them on purpose; do not let them drift.

Sources of truth: `src/index.css` (tokens, utilities, motion), `tailwind.config.js` (token mapping, fonts, radii, shadows), `src/lib/theme.tsx` (modes, accent, density, reading prefs), `src/lib/scale.ts` (interface size), `index.html` (first paint).

## Principles

- **Content first, chrome quiet.** The UI is greyscale. Colour is reserved for the accent (`system`), unread, starred and destructive. Article text is the loudest thing on screen.
- **Small and dense, but legible.** UI text sits between 10.5px and 13.5px. Controls are 28px (`h-7`) or 32px (`h-8`) tall. No large buttons, no hero type outside empty and welcome screens.
- **Hairlines, not boxes.** Panes are separated by one 1px `border-border` line. Surfaces differ by a few percent of lightness, not by shadow, except floating layers.
- **Rows never move on hover.** Hover changes colour only (`.row`, `src/index.css:162`). Lift on hover is kept for cards and the welcome choices.
- **Lean by default.** Background features start off and are switchable (Welcome "All off to start", `src/components/Welcome.tsx:161`). Animations can be turned off entirely.
- **Plain copy.** Labels are short sentences in sentence case. Helper text explains consequences ("Nothing about your feeds is sent."), never sells.

## Colour tokens

All colours are HSL triples on CSS variables, consumed as `hsl(var(--x))` through Tailwind names (`tailwind.config.js:33`). Opacity modifiers (`bg-system/10`, `border-border/60`) work because the triples have no `hsl()` wrapper.

Three palettes exist. `:root` is light, `.paper` overrides light on top of it, `.dark` replaces it. Paper inherits `--destructive`, `--unread`, `--starred`, `--system` and density from `:root`.

| Token | Light (`:root`) | Paper (`.paper`) | Dark (`.dark`) | Use |
|---|---|---|---|---|
| `background` | `0 0% 98.4%` | `40 33% 93.5%` | `0 0% 5.1%` | App and pane background |
| `foreground` | `0 0% 9%` | `30 18% 17%` | `0 0% 93%` | Primary text, titles, unread headlines |
| `card` | `0 0% 100%` | `42 38% 96.5%` | `0 0% 7.3%` | Card grid tiles, welcome choices, home search |
| `popover` | `0 0% 100%` | `42 40% 97%` | `0 0% 8.6%` | Dialogs, menus, settings panel, toasts |
| `elevated` | `0 0% 94.5%` | `38 26% 87.5%` | `0 0% 12%` | Selected row, active segment, scrollbar thumb, switch track off |
| `primary` | `0 0% 9%` | `30 18% 17%` | `0 0% 93%` | Confirm button fill only (Prompt) |
| `primary-foreground` | `0 0% 98%` | `42 40% 97%` | `0 0% 6%` | Text on primary |
| `secondary` | `0 0% 95%` | `38 28% 89.5%` | `0 0% 11%` | Hover fill, input fill, code blocks |
| `muted` | `0 0% 95%` | `38 28% 89.5%` | `0 0% 11%` | Same value as secondary; rarely used directly |
| `muted-foreground` | `0 0% 40%` | `30 12% 36%` | `0 0% 58%` | Secondary text, idle icons, read headlines |
| `subtle` | `0 0% 58%` | `32 9% 50%` | `0 0% 40%` | Tertiary text: meta lines, section labels, helper text, placeholders |
| `accent` | `0 0% 95.5%` | `38 28% 90%` | `0 0% 10.5%` | Neutral hover for title bar window buttons. Not the accent colour |
| `destructive` | `345 82% 42%` | (light) | `347 77% 58%` | Rose red. Errors, delete, destructive confirm and destructive buttons |
| `destructive-foreground` | `0 0% 98%` | (light) | `0 0% 98%` | Text on destructive |
| `border` | `0 0% 90%` | `37 22% 82%` | `0 0% 12.5%` | Every hairline. Applied globally via `* { @apply border-border }` |
| `input` | `0 0% 88%` | `37 20% 78%` | `0 0% 15%` | Input borders, unchecked checkbox, scrollbar hover |
| `ring` | `0 0% 45%` | `30 10% 42%` | `0 0% 55%` | Overwritten at runtime by the accent (see below) |
| `unread` | `215 78% 50%` | (light) | `215 90% 68%` | Overwritten at runtime by the accent |
| `starred` | `38 92% 44%` | (light) | `38 92% 60%` | Star icon fill (`fill-starred text-starred`). Not tied to accent |
| `system` | `215 78% 50%` | (light) | `215 90% 68%` | The accent. Overwritten at runtime |

Other root variables: `--radius: 0.625rem`, density variables (see Spacing), reading variables (`--reader-font`, `--reader-size`, `--reader-width`), and easings `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)`, `--ease-in: cubic-bezier(0.7, 0, 0.84, 0)`, `--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1)` (`src/index.css:54`).

Text selection is `hsl(var(--foreground) / 0.18)` (`src/index.css:135`).

Shadows (`tailwind.config.js:63`): `shadow-float` for anything that floats above panes (dialogs, menus, settings panel, toasts, the reader note); `shadow-card` for card tiles at rest. Both are fixed black-alpha values and are the same in every theme.

## Accent

The accent token is `--system`. Use it as `text-system`, `bg-system`, `border-system`, `border-system/50`, `bg-system/10`.

- Presets live in `ACCENTS` (`src/lib/theme.tsx:7`): blue (default), violet, teal, green, amber, rose, mono. Each has a `light` and a `dark` HSL triple. Paper uses the light one.
- Custom accent: any hex. `accentHsl()` (`src/lib/theme.tsx:57`) keeps hue and saturation and clamps lightness to 28 to 52% on light and 55 to 82% on dark so it stays readable.
- `ThemeProvider` writes the result to `--system`, `--unread` and `--ring` on `<html>` (`src/lib/theme.tsx:183`). So unread dots and focus rings always match the accent, and the CSS values for those three are only the pre-mount defaults.
- Where the accent appears: active row indicator bar, unread dot, focused input border, on switch, selected radio card border, checked checkbox, links in articles, the update pill, success icons, the first chevron of the logo (`TurboMark`, `src/components/TitleBar.tsx:182`).
- The accent is a signal, never a large fill. The biggest accent fill is the 36x20 switch track. Buttons that need emphasis use `border-system bg-elevated`, not a solid accent background.

## Typography

**UI face.** `font-sans` is Geist Variable with system and colour emoji fallbacks; `font-mono` is Geist Mono Variable (`tailwind.config.js:10`). Body sets `font-feature-settings: "rlig" 1, "calt" 1, "ss01" 1`, antialiased, `user-select: none` except inputs (`src/index.css:121`).

**UI scale actually in use** (arbitrary px sizes, not Tailwind's `text-sm` and friends):

| Size | Role | Example |
|---|---|---|
| `text-[10.5px]` | Key hints, mono metadata, font notes, `kbd` | `Menu.tsx:149`, `Shortcuts.tsx:108` |
| `text-[11px] font-medium uppercase tracking-wider text-subtle` | Section labels | `SettingsPanel.tsx:58`, `Sidebar.tsx:154` |
| `text-[11px]` | Meta lines (source, time), helper text, counts | `ArticleList.tsx:120` |
| `text-[11.5px]` | Row detail text, reader note, errors in settings | `BackgroundPrefs.tsx:163` |
| `text-[12px]` | Default control and body text: buttons, inputs, field labels, snippets | `SettingsPanel.tsx:134` |
| `text-[12.5px]` | Row titles in settings, menu items, dialog inputs | `BackgroundPrefs.tsx:160`, `Menu.tsx:140` |
| `text-[13px]` | Sidebar rows, list headlines, app name | `Sidebar.tsx:59`, `ArticleList.tsx:157` |
| `text-[13.5px] font-semibold tracking-tight` | Dialog titles | `Prompt.tsx:101` |
| `text-[14px] font-semibold tracking-tight` | Panel titles (Settings, Shortcuts) | `SettingsPanel.tsx:370` |
| `text-[1.45rem]` or `text-[1.6rem]`, `font-semibold leading-tight tracking-tight` | Page titles: Home, Welcome, article title | `Home.tsx:263`, `Reader.tsx:354` |

Weights: 400 for body, `font-medium` for labels and unread headlines, `font-semibold` for titles. Headings get `tracking-tight`. Read headlines drop to `font-normal text-muted-foreground`.

Numbers that change or line up (counts, times, versions, sizes) get `.tabular` (`src/index.css:158`).

**Reading.** Article bodies use `.prose-feed` (`src/index.css:180`): `var(--reader-font)`, `var(--reader-size)`, `leading-[1.7]`, `text-foreground/90`, links `text-system` with `decoration-system/40`. The column is `max-width: var(--reader-width)` with `px-7 py-8` (`Reader.tsx:350`).

- Fonts (`READER_FONTS`, `src/lib/theme.tsx:87`): Geist (default), Libron, Literata, Source Serif 4, Merriweather, Atkinson Hyperlegible Next, System serif (Georgia), Geist Mono. All bundled OFL fonts, Latin only, declared in `src/reading-fonts.css`.
- Sizes (rem): `0.86, 0.94 (default), 1.02, 1.12, 1.24`.
- Line widths: narrow `58ch`, normal `68ch` (default), wide `84ch`.
- Direction: ltr or rtl.

Reading prefs affect the article only. The UI chrome is scaled separately.

## Spacing and layout

- Window: custom title bar `h-10` (`TitleBar.tsx:67`), then three panes: sidebar `w-[260px]` (`Sidebar.tsx:120`), article list `w-[380px]` (`ArticleList.tsx:39`), reader `flex-1`. Panes are separated by `border-r border-border`.
- The sidebar collapses by animating width to 0 with `-translate-x-3 opacity-0` over 280ms (`App.tsx:618`).
- Pane headers: `border-b border-border px-3 py-2` (reader), `px-2 py-2` (list).
- Page content (Home, Welcome): centred column, `max-w-[1180px] px-6 pt-7` for Home, `max-w-[640px] px-6 pt-14` for Welcome.
- Side panel (Settings): `w-[380px]`, sections `px-5 py-5` with `border-t` between them.
- Dialogs: `max-w-[380px]` (Prompt, Add feed), `max-w-[620px]` (Shortcuts); body `px-5 pt-4 pb-4`, footer `border-t px-4 py-3`.
- Gaps: `gap-0.5` between icon buttons, `gap-1.5` between paired buttons and grid choices, `gap-2` icon to label, `gap-4` between a settings row's text and its control.
- Field rhythm: label `mb-2`, fields `mt-4`, helper text `mt-1.5`.

**Interface size** (`src/lib/scale.ts`): webview zoom 0.9, 1 (default), 1.15, 1.3, stepped with Ctrl/Cmd `+`, `-`, `0`. Never build a separate font-size setting for chrome.

**Density** (`:root[data-density="compact"]`, `src/index.css:240`):

| Variable | Comfortable | Compact |
|---|---|---|
| `--row-h` | 2rem | 1.75rem |
| `--card-min` | 255px | 215px |
| `--card-gap` | 1rem | 0.625rem |
| `--card-pad` | 1.25rem | 0.75rem |
| `--card-inset` | 0.875rem | 0.625rem |

Compact also hides `.snippet`, shrinks `.thumb` to 2.5rem, and sets list `article h3` to 12.5px. New list surfaces must size from these variables (`h-[var(--row-h)]`, `gap-[var(--card-gap)]`) and mark their secondary prose `.snippet`.

## Shape and borders

- Radii from `--radius` (10px): `rounded-sm` 6px, `rounded-md` 8px, `rounded-lg` 10px, `rounded-xl` 14px.
- `rounded-md`: inputs, small swatches, segmented items, thumbnails, `kbd`.
- `rounded-lg`: `.row` (every hoverable row and icon button), segmented track, dialog inputs.
- `rounded-xl`: dialogs, menus, toasts, cards, the Home search field.
- `rounded-full`: switches, pills (update, counts), dots, the reader note.
- Borders are always 1px `border-border` (or `border-input` on form fields). Lists use `border-border/60` between items. Selected choices swap to `border-system`. Swatches use `border-2`.
- Modal scrims: `bg-black/50` for centred dialogs, `bg-black/40` for the settings side panel.

## Iconography

- Library: `lucide-react` only, default stroke width.
- Sizes: 13 in buttons with text, menu items and section actions; 14 in toolbar icon buttons, sidebar rows and status lines; 15 for the reader back and more buttons and the welcome choices; 12 for meta-line icons (star, hide, feed icon); 10 to 11 for pins and the toast close.
- Icons inherit colour. Tint only for meaning: `text-system` (active, success), `text-destructive` (error), `fill-starred text-starred` (starred).
- Spinners: `Loader2` or `RefreshCw` with `animate-spin`.

## Motion

- Animate transform, opacity and colour. The one height animation uses `.collapse-grid` (`grid-template-rows`, `src/index.css:168`); do not animate `height`.
- Entrances use `--ease-out`; exits use `--ease-in`, run faster, and end with `forwards`.

| Class | Duration | Use |
|---|---|---|
| `animate-rise` | 260ms | Content appearing: panes, notes, errors, empty states. Stagger with `animationDelay` 40 to 120ms |
| `animate-card` | 300ms | First 18 cards, delay `min(i, 12) * 18ms` (`CardGrid.tsx:71`) |
| `animate-menu` / `animate-menu-out` | 140 / 110ms | Dropdowns and context menus |
| `animate-pop` / `animate-pop-out` | 220 / 150ms | Centred dialogs |
| `animate-fade` / `animate-fade-out` | 160 / 150ms, linear | Scrims |
| `animate-slide-in` / `animate-slide-out` | 220 / 180ms | Settings side panel |

- Transitions: `duration-150` for colour, `duration-200 ease-out` for transforms and toggles, `duration-100` for menu item hover.
- Press feedback: `active:scale-[0.96]` (segments), `0.97` (dialog buttons), `0.94` (swatches).
- Hover lift: cards `hover:-translate-y-[3px] hover:shadow-float`; welcome choices `-translate-y-[2px]`.
- Exits are driven by `useDismissible(onClose, ms)` (`src/lib/presence.ts`), which keeps the element mounted for the exit animation.
- **Animations off:** `:root[data-motion="none"]` cuts every animation and transition to 1ms (`src/index.css:398`). `prefers-reduced-motion` caps them at 150ms. State must still land correctly at 1ms.

## Components

Reuse these class strings. Line numbers point at the reference implementation.

**Icon button** (`Reader.tsx:393`, ToolButton). `row grid h-7 w-7 place-items-center text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-35 disabled:hover:bg-transparent`. Always `type="button"`, `title`, and `aria-label` when icon-only. Toggled on: `bg-elevated text-system` (`ArticleList.tsx:67`), or `bg-secondary text-foreground` for an open trigger (`Reader.tsx:216`). Smaller variant in section headers: `h-6 w-6 text-subtle` (`Sidebar.tsx:160`).

**Secondary button** (`SettingsPanel.tsx:622`). `row flex h-9 items-center justify-center gap-2 border border-border text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50`, icon size 13.

**Emphasised button** (`SettingsPanel.tsx:709`, `Welcome.tsx:147`). `row flex h-9 items-center gap-2 border border-system bg-elevated px-4 text-[12.5px] font-medium text-foreground hover:bg-secondary disabled:border-border disabled:opacity-50`.

**Dialog buttons** (`Prompt.tsx:136`, `Prompt.tsx:144`). Cancel: `row h-8 px-3 text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground`. Confirm: `row h-8 px-3 text-[12px] font-medium active:scale-[0.97] bg-primary text-primary-foreground hover:bg-primary/90`, or `bg-destructive text-destructive-foreground` when destructive. This is the only place solid fills are used.

**Destructive outline button** (`StorageSettings.tsx`, `Action` with `tone="destructive"`). For an in-pane action that deletes something or cannot be undone, before its confirmation dialog: `row h-8 border px-3 text-[12px] font-medium border-destructive/40 text-destructive hover:border-destructive/70 hover:bg-destructive/10`. Never solid; the solid fill stays for the confirm button in the dialog.

**Text input** (`Prompt.tsx:120`, `AddFeedDialog.tsx:149`). `h-9 w-full rounded-lg border border-input bg-secondary px-2.5 text-[12.5px] outline-none transition-colors duration-150 ease-out placeholder:text-subtle focus:border-system`. Compact search: `h-7 rounded-md border-transparent bg-secondary pl-7 text-[12px]` with a 13px `Search` icon at `left-2` (`ArticleList.tsx:60`). URLs, hex codes and ports use `font-mono`. Invalid state: `border-destructive` (`SettingsPanel.tsx:119`).

**Section and field** (`SettingsPanel.tsx`). Section: `border-t border-border py-5 first:border-t-0 first:pt-0`; the uppercase 11px label only when a tab holds more than one section, since the tab name is already the heading. Field: `mt-4 first:mt-0`, label `mb-2 text-[12px] text-muted-foreground`. Helper text below: `mt-1.5 text-[11px] leading-relaxed text-subtle`.

**Setting row with control** (`BackgroundPrefs.tsx:156`). `flex items-start justify-between gap-4`; title `text-[12.5px] font-medium text-foreground` with an `id`; detail `mt-0.5 text-[11.5px] leading-relaxed text-subtle`; control on the right, labelled by the title id.

**Switch** (`BackgroundPrefs.tsx:170`). `role="switch"`, `aria-checked`, `aria-labelledby`. Track `relative mt-0.5 h-5 w-9 rounded-full border transition-colors duration-200 ease-out`, on `border-system bg-system`, off `border-border bg-elevated`. Knob `h-3.5 w-3.5 rounded-full`, on `translate-x-4 bg-background`, off `bg-muted-foreground`.

**Segmented control** (`SettingsPanel.tsx:141`). Track `role="radiogroup"`, `grid gap-0.5 rounded-lg border border-border bg-background p-[3px]`, equal columns. Item `role="radio"` with `aria-checked`, `flex h-8 items-center justify-center gap-1.5 rounded-md px-2 text-[12px] font-medium`; selected `bg-elevated text-foreground`, idle `text-subtle hover:text-muted-foreground`; `focus-visible:ring-2 focus-visible:ring-ring/50`. Use it for every either/or setting. Inline compact variant beside a row: `p-[2px]`, items `h-7 text-[11.5px]` (`BackgroundPrefs.tsx:117`).

**Radio cards** (`SettingsPanel.tsx:489`). `role="radiogroup"` grid `grid-cols-2 gap-1.5`; each `row flex border px-2.5 py-2 text-left`, selected `border-system bg-elevated text-foreground`, idle `border-border text-muted-foreground hover:bg-secondary`. Title 12px medium, note `text-[10.5px] text-subtle`.

**Checkbox cards** (`Welcome.tsx:113`). Same card shape with `role="checkbox"`; the box is `h-4 w-4 rounded-[4px] border`, checked `border-system bg-system text-background` with `Check size={11} strokeWidth={3}`.

**Sidebar row** (`Sidebar.tsx:28`). `row relative flex w-full items-center gap-2 pr-2 text-[13px] h-[var(--row-h)]`; active `bg-elevated font-medium text-foreground` plus a 3px `bg-system` bar that grows from `h-0` to `h-4`; idle `text-muted-foreground hover:bg-secondary hover:text-foreground`. Counts: `tabular text-[11px] text-subtle`, capped at `999+`.

**Article list item** (`ArticleList.tsx:104`). `border-b border-border/60 px-3 py-2.5`; active `bg-elevated` plus a 2px `bg-system` left bar; hover `bg-secondary/70`; read `opacity-[0.78]`. Meta line 11px subtle with `·` separators; unread dot `h-1.5 w-1.5 rounded-full bg-system`; secondary actions `opacity-0 group-hover:opacity-70`.

**Card** (`CardGrid.tsx:63`). `rounded-xl border border-border bg-card shadow-card`, 16:10 cover, hover lift to `shadow-float`, read `opacity-[0.72]`.

**Menu** (`Menu.tsx:104`). Panel `rounded-xl border border-border bg-popover p-1 shadow-float` with `animate-menu`; items `flex h-8 items-center gap-2.5 rounded-lg px-2 text-[12.5px] text-muted-foreground hover:bg-secondary hover:text-foreground`, icon in a `w-4` slot, shortcut hint `tabular text-[10.5px] text-subtle`; separator `my-1 h-px bg-border`. A label inside a menu uses the uppercase 11px style (`ArticleList.tsx:221`). Context menus share the panel classes (`ContextMenu.tsx:106`).

**Dialog** (`Prompt.tsx:78`). Scrim `absolute inset-0 grid place-items-center bg-black/50 p-6` with fade; panel `role="dialog" aria-modal="true" aria-labelledby`, `w-full max-w-[380px] overflow-hidden rounded-xl border border-border bg-popover shadow-float` with pop. Escape and scrim click dismiss. The confirm button gets focus.

**Tabbed modal** (`SettingsPanel.tsx`). For settings and anything else with several sections. Centred on the dialog scrim, `h-[min(680px,100%)] w-[min(880px,100%)] rounded-xl border border-border bg-popover shadow-float`, `animate-pop`. A 200px left rail (`border-r bg-background/40 p-2`) holds the title and a vertical `role="tablist"`: each tab `row flex h-8 items-center gap-2.5 px-2.5 text-[12.5px]`, a 14px icon in `text-subtle` (`text-system` when selected), selected `bg-elevated font-medium text-foreground`. Up and Down move between tabs. The right side has a 52px header (`border-b px-6`, the tab name as a 14px semibold heading, actions and close on the right) over a scrolling `px-6 py-5` body. Only the selected tab renders. The tab last used is reopened.

**About dialog** (`AboutDialog.tsx`). `max-w-[440px]` dialog from the title bar's Info button: the mark in a 48px bordered tile, name and the running version (read from the app, never typed in), then hairline-separated blocks for the update check and links.

**Toast** (`Toaster.tsx:10`). Bottom-right stack, `rounded-xl border bg-popover px-3 py-2.5 text-[12px] shadow-float animate-rise`; `role="status"` with a `text-system` check, or `role="alert"` with `border-destructive/40` and `AlertCircle`.

**Transient note** (`Reader.tsx:376`). Centred pill at the bottom of a pane: `rounded-full border border-border bg-popover px-3 py-1.5 text-[11.5px] shadow-float`, `role="status"`.

**Inline messages.** Success: 14px icon in `text-system` plus 12px text (`SettingsPanel.tsx:716`). Error: `role="alert"`, `text-[12px] leading-relaxed text-destructive` with `AlertCircle size={14}` (`Prompt.tsx:125`).

**Empty states.** One quiet line, centred, `animate-rise text-[12px] text-subtle` (`ArticleList.tsx:186`), or `text-[13px]` in the reader (`Reader.tsx:69`). Point to the next action in words, with the key in `text-foreground` (`Sidebar.tsx:246`). No illustrations.

**Keyboard hints.** In titles: `title="Refresh all feeds (r)"`. In prose: `<kbd className="font-mono text-foreground">` (`Welcome.tsx:176`). In the shortcuts sheet: `kbd` with `min-w-[2.1rem] rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-[10.5px]` (`Shortcuts.tsx:108`).

**Pills.** Update pill `h-6 rounded-full border border-system/40 px-2.5 text-[11px] font-medium text-system hover:bg-system/10` (`TitleBar.tsx:99`). Count pill `tabular rounded-full bg-secondary px-1.5 text-[10px] font-medium text-muted-foreground` (`TitleBar.tsx:89`).

## Theming rules

- Every colour goes through a token. No raw hex, `rgb()`, `hsl()` or Tailwind palette colours (`bg-gray-*`, `text-white`) in components. Known exceptions are listed under Do / Don't.
- "Accent" means `system`. The Tailwind `accent` token is a neutral hover grey; do not use it for a brand colour.
- Check every new surface in light, paper and dark, with at least two accents (blue, plus mono or amber). Paper is warm, so anything that assumes neutral grey shows up there.
- Layering, back to front: `background`, `card`, `popover`. Hover and selection sit on top as `secondary` and `elevated`.
- A new token goes in all three blocks of `src/index.css` (paper only if it should differ from light) and in `tailwind.config.js`.
- If a first-paint background changes, update `index.html` too, which hardcodes it.

## Accessibility

- Icon-only buttons have `title` and `aria-label`. Shortcut letters go in the title.
- Custom controls use real roles: `radiogroup`/`radio` with `aria-checked`, `switch` with `aria-labelledby`, `checkbox`, `menu`/`menuitem`, `aria-expanded` on submenus, `dialog` with `aria-modal` and `aria-labelledby`.
- Errors use `role="alert"`; passive confirmations use `role="status"`.
- Decorative glyphs and indicator bars are `aria-hidden`.
- Focus: inputs show `focus:border-system`; segmented items show `focus-visible:ring-2 focus-visible:ring-ring/50`, and `--ring` follows the accent. Most other buttons rely on the browser's default outline. New controls should add the segmented ring pattern, and never `outline-none` without a replacement.
- Escape closes every overlay. Every action has a keyboard path, listed in `Shortcuts.tsx`.
- The custom accent is lightness-clamped for contrast. `subtle` is the lowest-contrast text; keep it for secondary information, never for the only copy of something important.
- Respect both the Animations setting and `prefers-reduced-motion`.

## Do / Don't

Do:
- Use `.row` for anything hoverable that sits in a list or toolbar.
- Use the px type scale above and `tracking-tight` on headings.
- Use `border-system bg-elevated` to mark a selected or recommended choice.
- Use `.tabular` on numbers, `font-mono` on codes, URLs and keys.
- Ship new features off by default, with a switch in Settings.

Don't:
- Fill large areas with the accent, or use gradients.
- Add shadows to in-pane elements; shadows are for floating layers and cards.
- Move rows on hover, or animate `height` or `width` (the sidebar rail is the one exception).
- Use Tailwind's named text sizes (`text-sm`) for chrome; they only appear inside `.prose-feed`.
- Add another icon set, emoji in UI text, or a second sans face.

Existing exceptions, not precedents: the Windows close button red `#e81123` and `#c50f1f` (`TitleBar.tsx:173`), the custom-swatch rainbow (`SettingsPanel.tsx:78`), white behind the QR code (`Reader.tsx:339`), black and white video chrome (`VideoBlock.tsx:32`), generated hues in `CoverFallback.tsx:49`, and print styles.

## Checklist for new UI

1. Colours only from tokens; checked in light, paper and dark, and with a non-blue accent.
2. Text sizes from the scale; section labels uppercase 11px `tracking-wider text-subtle`.
3. Controls `h-7` (icon) or `h-8`/`h-9` (text); icons 13 or 14.
4. Hover is colour only; motion uses the `animate-*` classes with `ease-out`, and works with animations off.
5. Lists size from the density variables; snippets carry `.snippet`.
6. Roles, `aria-*`, a `title` with the shortcut, Escape to close, visible focus.
7. Empty and error states written as one plain sentence.
8. An existing pattern from Components was reused before a new one was written.
