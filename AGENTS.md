# Working on this repo

## Design

Every UI change follows [DESIGN.md](DESIGN.md): its colour tokens, type
scale, spacing, components and motion. Colours come only from the tokens,
never raw hex or hsl in components. Reuse a pattern listed under Components
before writing a new one, and check new UI in every theme the app has.

If a change needs something DESIGN.md does not cover, add it to DESIGN.md in
the same change, so the two never disagree.

## Commits

Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`.
