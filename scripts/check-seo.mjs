// Fails if a required SEO tag is missing from the built page or a placeholder leaked.
import { readFile, access } from "node:fs/promises";

const html = await readFile("dist/index.html", "utf8");
const need = [
  ["title (20-80 chars)", /<title>[^<]{20,80}<\/title>/],
  ["description (80-170 chars)", /<meta name="description" content="[^"]{80,170}"/],
  ["canonical", /<link rel="canonical" href="https:\/\/[^"]+\/"/],
  ["og:title", /property="og:title"/],
  ["og:description", /property="og:description"/],
  ["og:image", /property="og:image" content="https:\/\/[^"]+\.png"/],
  ["og:url", /property="og:url"/],
  ["twitter:card", /name="twitter:card" content="summary_large_image"/],
  ["json-ld", /<script type="application\/ld\+json">\{"@context"/],
  ["h1", /<h1[\s>]/],
  ["prerendered content", /<div id="root">(<link[^>]*>)?<a class="skip"/],
];
const errors = [];
for (const [name, re] of need) if (!re.test(html)) errors.push(`missing: ${name}`);
if (/%[A-Z_]+%/.test(html)) errors.push("placeholder left in output");
for (const f of ["og.png", "robots.txt", "sitemap.xml", "404.html", "favicon.ico"]) {
  try {
    await access(`dist/${f}`);
  } catch {
    errors.push(`missing file: dist/${f}`);
  }
}
const imgs = [...html.matchAll(/<img [^>]*>/g)].map((m) => m[0]);
for (const i of imgs) if (!/ alt="/.test(i)) errors.push(`img without alt: ${i.slice(0, 80)}`);
const h1s = (html.match(/<h1[\s>]/g) || []).length;
if (h1s !== 1) errors.push(`expected one h1, found ${h1s}`);

if (errors.length) {
  for (const e of errors) console.error(e);
  process.exit(1);
}
console.log(`seo: ok (${imgs.length} images, all with alt)`);
