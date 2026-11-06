// Renders public/og.png (1200x630) from an SVG with resvg: the real home
// screenshot plus the live installer size. Run `npm run og` after a release.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";
import wawoff2 from "wawoff2";

const require = createRequire(import.meta.url);
const root = new URL("..", import.meta.url);
const release = JSON.parse(await readFile(new URL("src/release.json", root), "utf8"));
const size = (release.assets.windows.size / 1048576).toFixed(1);

// resvg needs TTF; fontsource ships WOFF2.
const dir = join(tmpdir(), "turbo-og-fonts");
await mkdir(dir, { recursive: true });
const fonts = [];
for (const f of [
  "geist/files/geist-latin-500-normal",
  "geist/files/geist-latin-600-normal",
  "geist-mono/files/geist-mono-latin-400-normal",
]) {
  const src = require.resolve(`@fontsource/${f}.woff2`);
  const out = join(dir, f.split("/").pop() + ".ttf");
  await writeFile(out, await wawoff2.decompress(await readFile(src)));
  fonts.push(out);
}

const shot = (await readFile(new URL("scripts/assets/og-shot.jpg", root))).toString("base64");
const unitX = 64 + size.length * 104;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <clipPath id="c"><rect x="600" y="120" width="820" height="560" rx="18"/></clipPath>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.5" stop-color="#0d0d0d" stop-opacity="0"/>
      <stop offset="1" stop-color="#0d0d0d" stop-opacity="1"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="#0d0d0d"/>
  <image x="600" y="120" width="820" height="533" clip-path="url(#c)" xlink:href="data:image/jpeg;base64,${shot}" preserveAspectRatio="xMinYMin slice"/>
  <rect x="600" y="120" width="820" height="560" rx="18" fill="none" stroke="#ffffff" stroke-opacity="0.08"/>
  <rect x="580" y="300" width="640" height="330" fill="url(#fade)"/>
  <g transform="translate(70 70)" fill="none" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="m4 26 10-10-10-10" stroke="#64a1f7"/>
    <path d="m17 26 10-10-10-10" stroke="#ededed"/>
  </g>
  <text x="114" y="96" font-family="Geist" font-weight="600" font-size="28" fill="#ededed" letter-spacing="-0.3">Turbo Reader</text>
  <text x="60" y="360" font-family="Geist" font-weight="600" font-size="210" fill="#ededed" letter-spacing="-13">${size}</text>
  <text x="${unitX}" y="360" font-family="Geist" font-weight="500" font-size="72" fill="#949494" letter-spacing="-2">MB</text>
  <text font-family="Geist" font-weight="500" font-size="38" fill="#ededed" letter-spacing="-1">
    <tspan x="70" y="446">An RSS reader that is</tspan>
    <tspan x="70" y="492">actually fast and</tspan>
    <tspan x="70" y="538">actually small.</tspan>
  </text>
  <text x="70" y="590" font-family="Geist Mono" font-size="19" fill="#949494">turbo-reader.t21.dev · Windows · macOS · Linux</text>
</svg>`;

const png = new Resvg(svg, {
  fitTo: { mode: "width", value: 1200 },
  font: { fontFiles: fonts, loadSystemFonts: false, defaultFontFamily: "Geist" },
})
  .render()
  .asPng();
await writeFile(new URL("public/og.png", root), png);
console.log(`og: public/og.png (${(png.length / 1024).toFixed(0)} KB, ${size} MB)`);
