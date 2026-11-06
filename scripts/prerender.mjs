// Writes the server-rendered page into dist/index.html, fills the SEO
// placeholders from the release data, and writes 404.html and sitemap.xml.
import { readFile, writeFile, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const SITE = "https://turbo-reader.t21.dev";
const dist = (p) => resolve("dist", p);
const { render, meta } = await import(pathToFileURL(resolve("dist-ssr/entry-server.js")).href);
const template = await readFile(dist("index.html"), "utf8");
const { release, installerMB } = meta;

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE}/#app`,
      name: "Turbo Reader",
      description: "A fast, small, open-source RSS reader. Rust core, React shell, built with Tauri 2.",
      url: `${SITE}/`,
      applicationCategory: "NewsApplication",
      operatingSystem: "Windows 10, Windows 11, macOS, Linux",
      softwareVersion: release.version,
      datePublished: release.date,
      fileSize: `${installerMB} MB`,
      downloadUrl: release.page,
      installUrl: `${SITE}/#download`,
      license: "https://opensource.org/licenses/MIT",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      screenshot: ["home", "reader", "light", "settings"].map((s) => `${SITE}/screenshots/${s}.webp`),
      image: `${SITE}/og.png`,
      author: { "@id": `${SITE}/#org` },
    },
    {
      "@type": "Organization",
      "@id": `${SITE}/#org`,
      name: "t21 dev",
      url: "https://t21.dev",
      sameAs: ["https://github.com/t21dev"],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE}/#site`,
      url: `${SITE}/`,
      name: "Turbo Reader",
      publisher: { "@id": `${SITE}/#org` },
    },
  ],
};

const fill = (html) =>
  html
    .replaceAll("%INSTALLER_MB%", installerMB)
    .replace("%JSON_LD%", JSON.stringify(jsonLd).replace(/</g, "\\u003c"));

await writeFile(dist("index.html"), fill(template).replace("<!--app-html-->", render()));

// 404: same head and styles, no app, no hydration, not indexed.
const notFound = fill(template)
  .replace(/<title>[^<]*<\/title>/, "<title>Page not found · Turbo Reader</title>")
  .replace('content="index, follow, max-image-preview:large"', 'content="noindex"')
  .replace(/<link rel="canonical"[^>]*>\s*/, "")
  .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/, "")
  .replace(/<link rel="preload" as="image"[^>]*>\s*/, "")
  .replace(/<script type="module"[^>]*><\/script>/, "")
  .replace(
    "<!--app-html-->",
    `<main class="wrap notfound"><p class="mega" aria-hidden="true">404</p><h1>That page is not here.</h1><p><a class="btn btn-solid" href="/">Back to Turbo Reader</a></p></main>`,
  );
await writeFile(dist("404.html"), notFound);

await writeFile(
  dist("sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/</loc><lastmod>${release.date}</lastmod></url>
</urlset>
`,
);
await rm("dist-ssr", { recursive: true, force: true });
console.log(`prerender: index.html, 404.html, sitemap.xml (v${release.version})`);
