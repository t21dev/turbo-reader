# Turbo Reader website

This is the `landing` branch of [t21dev/turbo-reader](https://github.com/t21dev/turbo-reader). It holds **only** the website at <https://turbo-reader.t21.dev>. The app lives on `main`.

This branch is an orphan. Never merge it with `main`.

## Stack

- React 19 + TypeScript + Vite, prerendered to static HTML at build time (`src/entry-server.tsx` → `scripts/prerender.mjs`), then hydrated.
- Plain CSS with tokens in `src/styles/tokens.css`, taken from the app's dark theme in `DESIGN.md` on `main`. Geist and Geist Mono are bundled, so the page makes no third-party requests.
- Cloudflare Workers static assets (`wrangler.jsonc`), custom domain `turbo-reader.t21.dev`.

## Commands

```bash
npm install
npm run dev       # local dev server
npm run build     # fetch latest release, typecheck, build, prerender
npm run check     # verify SEO tags, OG image, sitemap, alt text in dist/
npm run og        # re-render public/og.png from the release data
npm run sync      # copy CHANGELOG.md from main (feeds /latest.json)
npm run deploy    # build and `wrangler deploy` (needs `wrangler login`)
```

## Content that comes from the app

- **Release data.** `scripts/release.mjs` asks the GitHub API for the latest release at build time and writes `src/release.json`: the version, date, and every download link and size. The hero's installer size comes from there. If GitHub is unreachable, the committed `release.json` is used.
- **Update check.** `scripts/prerender.mjs` writes `dist/latest.json` (`version`, `published`, `url`, `notes`) from the newest released section of `content/CHANGELOG.md`. The app's update check asks <https://turbo-reader.t21.dev/latest.json> alongside GitHub's API, which limits requests per address, and the newer answer wins. `content/CHANGELOG.md` is a copy of `CHANGELOG.md` on `main`: never edit it here. `npm run sync` copies it from `origin/main` (`npm run sync -- v0.34.0` from a tag), and the Website workflow on `main` does that, refreshes `src/release.json` and pushes here whenever a release is published, which redeploys the site.
- **Numbers.** Every other figure is from the README's "Fast and small" table on `main`, measured on one Windows machine. Do not add a number that is not measured there.
- **Screenshots.** `public/screenshots/*.webp` are WebP copies of `docs/screenshot-*.png` on `main` (2000px and 1000px wide). When those change, re-export them with ffmpeg:
  `ffmpeg -i screenshot-home.png -vf "scale='min(2000,iw)':-2" -c:v libwebp -quality 82 home.webp`

## Deploying

Workers Builds: connect this repository, set the production branch to `landing`, build command `npm run build`, deploy command `npx wrangler deploy`. A push here deploys. When a release is published, the Website workflow on `main` pushes the synced changelog and release data here, so the version, download links and `latest.json` follow without a manual deploy.

## SEO

`index.html` carries the title, description, canonical, Open Graph and Twitter tags and a JSON-LD `SoftwareApplication`; `scripts/prerender.mjs` fills in the version and size, and writes `404.html` and `sitemap.xml`. `public/robots.txt` points at the sitemap. `npm run check` fails if any of that is missing.
