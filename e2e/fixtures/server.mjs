// Deterministic feeds for the end-to-end suite.
//
// Every feed the tests subscribe to comes from here, so results never depend
// on the network, and failure modes (a 500, a 304, hostile markup) can be
// produced on demand. Dates are relative to "now" so the today/week/month
// counts on the home page are predictable.

import http from "node:http"

const HOUR = 3600 * 1000
const DAY = 24 * HOUR

// A 1x1 PNG, served as every favicon.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
)

const PROSE =
  "Sanitising in Rust means the webview never parses feed markup on its own. " +
  "That is the whole argument for the architecture, and this paragraph exists so " +
  "the readability extractor has a real body of text to find and score above the " +
  "navigation, the footer and the related links that surround it on the page. "

let counters = {}
let growCount = 0

function bump(key) {
  counters[key] = (counters[key] ?? 0) + 1
}

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function rssItem({ guid, title, link, date, html, image }) {
  return `
    <item>
      <guid isPermaLink="false">${guid}</guid>
      <title>${esc(title)}</title>
      <link>${esc(link)}</link>
      <pubDate>${new Date(date).toUTCString()}</pubDate>
      <description>${esc(html)}</description>
      ${image ? `<enclosure url="${image}" type="image/png" length="68"/>` : ""}
    </item>`
}

function rss(base, title, items) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${esc(title)}</title>
    <link>${base}/</link>
    <description>${esc(title)} fixture</description>
    ${items.join("\n")}
  </channel>
</rss>`
}

function routes(base) {
  const now = Date.now()

  return {
    "/": () => [
      200,
      "text/html",
      `<!doctype html><html><head><title>Fixture site</title>
       <link rel="icon" href="/favicon.png"></head><body>fixture</body></html>`,
    ],

    "/favicon.png": () => [200, "image/png", PNG],
    "/favicon.ico": () => [200, "image/png", PNG],

    // RSS 2.0: five items spread across ten days, two with images.
    "/rss.xml": () => [
      200,
      "application/rss+xml",
      rss(base, "Fixture RSS", [
        rssItem({ guid: "rss-1", title: "Alpha arrives within the hour", link: `${base}/a/1`,
          date: now - 1 * HOUR, html: `<p>Alpha body. ${PROSE}</p>`, image: `${base}/favicon.png` }),
        rssItem({ guid: "rss-2", title: "Bravo about kubernetes clusters", link: `${base}/a/2`,
          date: now - 5 * HOUR, html: `<p>Bravo body mentions kubernetes. ${PROSE}</p>` }),
        rssItem({ guid: "rss-3", title: "Charlie from two days ago", link: `${base}/a/3`,
          date: now - 2 * DAY, html: `<p>Charlie body. ${PROSE}</p>`, image: `${base}/favicon.png` }),
        rssItem({ guid: "rss-4", title: "Delta about crypto prices", link: `${base}/a/4`,
          date: now - 4 * DAY, html: `<p>Delta body mentions crypto. ${PROSE}</p>` }),
        rssItem({ guid: "rss-5", title: "Echo from ten days ago", link: `${base}/a/5`,
          date: now - 10 * DAY, html: `<p>Echo body. ${PROSE}</p>` }),
      ]),
    ],

    "/atom.xml": () => [
      200,
      "application/atom+xml",
      `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Fixture Atom</title>
  <link href="${base}/"/>
  <id>urn:fixture:atom</id>
  <updated>${new Date(now).toISOString()}</updated>
  <entry>
    <title>Atom one</title>
    <id>urn:fixture:atom:1</id>
    <link href="${base}/atom/1"/>
    <updated>${new Date(now - 3 * HOUR).toISOString()}</updated>
    <content type="html">${esc(`<p>Atom one body. ${PROSE}</p>`)}</content>
  </entry>
  <entry>
    <title>Atom two</title>
    <id>urn:fixture:atom:2</id>
    <link href="${base}/atom/2"/>
    <updated>${new Date(now - 30 * HOUR).toISOString()}</updated>
    <content type="html">${esc(`<p>Atom two body.</p>`)}</content>
  </entry>
</feed>`,
    ],

    "/feed.json": () => [
      200,
      "application/feed+json",
      JSON.stringify({
        version: "https://jsonfeed.org/version/1.1",
        title: "Fixture JSON",
        home_page_url: `${base}/`,
        items: [
          { id: "json-1", url: `${base}/json/1`, title: "Json one",
            content_html: `<p>Json one body. ${PROSE}</p>`,
            date_published: new Date(now - 2 * HOUR).toISOString() },
        ],
      }),
    ],

    // Shaped like a real YouTube channel feed: no body, text under media:group.
    "/youtube.xml": () => [
      200,
      "application/atom+xml",
      `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
  <title>Fixture Channel</title>
  <link rel="alternate" href="https://www.youtube.com/channel/UCfixture"/>
  <id>yt:channel:UCfixture</id>
  <entry>
    <id>yt:video:dQw4w9WgXcQ</id>
    <yt:videoId>dQw4w9WgXcQ</yt:videoId>
    <title>A fixture video</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"/>
    <published>${new Date(now - 6 * HOUR).toISOString()}</published>
    <updated>${new Date(now - 6 * HOUR).toISOString()}</updated>
    <media:group>
      <media:title>A fixture video</media:title>
      <media:thumbnail url="https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" width="480" height="360"/>
      <media:description>First line of the description.
Second line of it.

A new paragraph about the video.</media:description>
    </media:group>
  </entry>
</feed>`,
    ],

    // One-line teasers whose links lead to full article pages.
    "/teaser.xml": () => [
      200,
      "application/rss+xml",
      rss(base, "Fixture Teasers", [
        rssItem({ guid: "teaser-1", title: "A teaser with a full page", link: `${base}/article/full`,
          date: now - 2 * HOUR, html: "<p>Just the first line.</p>" }),
        rssItem({ guid: "teaser-2", title: "A teaser with nothing behind it", link: `${base}/article/empty`,
          date: now - 3 * HOUR, html: "<p>Only this.</p>" }),
      ]),
    ],

    "/article/full": () => [
      200,
      "text/html",
      `<!doctype html><html><head><title>Full</title></head><body>
        <nav><a href="/">home</a><a href="/x">elsewhere</a></nav>
        <article class="post-content">
          <h2>The full article</h2>
          <p>${PROSE}</p><p>${PROSE}</p><p>FULL-BODY-MARKER ${PROSE}</p>
        </article>
        <footer><a href="/y">footer link</a></footer>
      </body></html>`,
    ],

    "/article/empty": () => [200, "text/html", "<!doctype html><html><body><p>Short.</p></body></html>"],

    // The same story in two feeds, with different tracking parameters.
    "/dupe-a.xml": () => [
      200,
      "application/rss+xml",
      rss(base, "Dupe A", [
        rssItem({ guid: "dupe-a-1", title: "Shared story everyone ran", link: `${base}/story?utm_source=a`,
          date: now - 4 * HOUR, html: "<p>Shared.</p>" }),
      ]),
    ],
    "/dupe-b.xml": () => [
      200,
      "application/rss+xml",
      rss(base, "Dupe B", [
        rssItem({ guid: "dupe-b-1", title: "Shared story everyone ran", link: `${base}/story?utm_source=b&fbclid=x`,
          date: now - 4 * HOUR, html: "<p>Shared.</p>" }),
      ]),
    ],

    "/hostile.xml": () => [
      200,
      "application/rss+xml",
      rss(base, "Hostile", [
        rssItem({ guid: "hostile-1", title: "Hostile markup", link: `${base}/h/1`, date: now - HOUR,
          html: `<p>before <geolocation>inside</geolocation> after</p>
                 <script>window.__pwned = true</script>
                 <img src="x" onerror="window.__pwned = true">
                 <a href="javascript:window.__pwned=true">link</a>` }),
      ]),
    ],

    "/broken.xml": () => [500, "text/plain", "server error"],

    // A site, not a feed: it advertises its feed in the head.
    "/site.html": () => [
      200,
      "text/html",
      `<!doctype html><html><head><title>A site</title>
        <link rel="alternate" type="application/rss+xml" title="Site feed" href="/rss.xml">
      </head><body>a site</body></html>`,
    ],

    // Sixty articles, enough for a retention limit of 50 to remove some.
    "/big.xml": () => {
      const items = []
      for (let i = 1; i <= 60; i++) {
        items.push(rssItem({ guid: `big-${i}`, title: `Big item ${i}`, link: `${base}/big/${i}`,
          date: now - i * HOUR, html: `<p>Big ${i}.</p>` }))
      }
      return [200, "application/rss+xml", rss(base, "Big Feed", items)]
    },

    // Gains one item per request.
    "/grow.xml": () => {
      growCount += 1
      const items = []
      for (let i = 1; i <= growCount; i++) {
        items.push(rssItem({ guid: `grow-${i}`, title: `Grow item ${i}`, link: `${base}/g/${i}`,
          date: now - (growCount - i) * HOUR, html: `<p>Grow ${i}.</p>` }))
      }
      return [200, "application/rss+xml", rss(base, "Growing", items)]
    },
  }
}

export function startFixtureServer(port = 0) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, "http://localhost")
      const base = `http://127.0.0.1:${server.address().port}`
      bump(url.pathname)

      if (url.pathname === "/__stats") {
        res.writeHead(200, { "content-type": "application/json" })
        return res.end(JSON.stringify({ counters, growCount }))
      }
      if (url.pathname === "/__reset") {
        counters = {}
        growCount = 0
        res.writeHead(204)
        return res.end()
      }

      // Conditional GET: an unchanged feed is one 304 and no body.
      if (url.pathname === "/etag.xml") {
        if (req.headers["if-none-match"] === '"v1"') {
          bump("/etag.xml:304")
          res.writeHead(304, { etag: '"v1"' })
          return res.end()
        }
        res.writeHead(200, { "content-type": "application/rss+xml", etag: '"v1"' })
        return res.end(
          rss(base, "Etag", [
            rssItem({ guid: "etag-1", title: "Etag item", link: `${base}/e/1`,
              date: Date.now() - HOUR, html: "<p>Etag.</p>" }),
          ]),
        )
      }

      const route = routes(base)[url.pathname]
      if (!route) {
        res.writeHead(404, { "content-type": "text/plain" })
        return res.end("not found")
      }
      const [status, type, body] = route()
      res.writeHead(status, { "content-type": type })
      res.end(body)
    })
    server.listen(port, "127.0.0.1", () => {
      const base = `http://127.0.0.1:${server.address().port}`
      resolve({ server, base, close: () => new Promise((r) => server.close(r)) })
    })
  })
}

// Run directly for poking at the fixtures by hand.
if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const { base } = await startFixtureServer(Number(process.env.PORT) || 4600)
  console.log(`fixtures on ${base}`)
}
