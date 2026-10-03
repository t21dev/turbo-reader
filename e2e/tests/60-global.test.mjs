// F. Global: refresh, failing feeds, conditional GET, auto-refresh, the
// shortcut sheet, the sidebar toggle and interface scaling.
import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { launch, withShot } from "../lib/harness.mjs"
import { sleep } from "../lib/webdriver.mjs"

let ctx
const shot = (name, fn) => withShot(() => ctx, `global-${name}`, fn)

before(async () => {
  ctx = await launch()
  await ctx.s.invoke("add_source", { url: ctx.url("/grow.xml"), groupId: null })
  await ctx.s.invoke("add_source", { url: ctx.url("/etag.xml"), groupId: null })
  await ctx.reloadUi()
})
after(async () => {
  await ctx?.stop()
})

const grows = async () => (await ctx.items()).filter((x) => x.title.startsWith("Grow item")).length
const serverStats = async () => (await fetch(ctx.url("/__stats"))).json()

/* -------------------------------------------------------------------------- */

test("F1 refresh with r and with the button brings in new articles", shot("F1", async () => {
  const before = await grows()
  await ctx.s.exec(`document.activeElement?.blur()`)
  await ctx.s.press("r")
  await ctx.s.waitFor(async () => (await grows()) === before + 1, "r to fetch a new item")
  await ctx.waitNoText("Refreshing", "the busy state to clear")

  await (await ctx.s.byLabel("Refresh all feeds")).click()
  await ctx.s.waitFor(async () => (await grows()) === before + 2, "the button to fetch another")
  await ctx.waitNoText("Refreshing")
  await ctx.s.waitFor(
    async () => (await ctx.titles()).some((t) => t === `Grow item ${before + 2}`) ||
      (await ctx.pageText()).includes(`Grow item ${before + 2}`),
    "the new article on screen without a reload",
  )
}))

test("F2 a failing feed shows its error and the rest still refresh", shot("F2", async () => {
  const opml = `<?xml version="1.0"?><opml version="2.0"><body>
    <outline text="Broken" type="rss" xmlUrl="${ctx.url("/broken.xml")}"/></body></opml>`
  await ctx.s.invoke("import_opml", { xml: opml })
  await ctx.reloadUi()
  const before = await grows()
  await ctx.s.exec(`document.activeElement?.blur()`)
  await ctx.s.press("r")
  await ctx.s.waitFor(async () => (await grows()) === before + 1, "healthy feeds to refresh anyway")
  const broken = (await ctx.sources()).find((s) => s.url.endsWith("/broken.xml"))
  assert.ok(broken.lastError, "the error recorded")
  const title = await ctx.s.exec(
    `return [...document.querySelectorAll('aside button')].find(b => b.textContent.includes('Broken'))?.title ?? null`,
  )
  assert.ok(title && title.length > 0, "and visible on the feed in the rail")
}))

test("F3 an unchanged feed costs a 304, not a re-parse", shot("F3", async () => {
  const before = (await serverStats()).counters["/etag.xml:304"] ?? 0
  await ctx.s.exec(`document.activeElement?.blur()`)
  await ctx.s.press("r")
  await ctx.waitNoText("Refreshing")
  await sleep(300)
  const after = (await serverStats()).counters["/etag.xml:304"] ?? 0
  assert.ok(after > before, "the conditional request was honoured")
  assert.equal((await ctx.items()).filter((x) => x.title === "Etag item").length, 1, "and nothing duplicated")
}))

test("F4 the schedule refreshes on its own, and the window updates", { timeout: 150000 }, shot("F4", async () => {
  const before = await grows()
  const hits = async () => (await serverStats()).counters["/grow.xml"] ?? 0
  const startHits = await hits()
  // One minute: the shortest interval the backend will honour. The schedule
  // runs in Rust, so nothing in the page has to be faked.
  await ctx.s.invoke("set_setting", { key: "refresh_minutes", value: 1 })
  await ctx.s.waitFor(async () => (await hits()) > startHits, "a scheduled fetch", { timeout: 130000, every: 2000 })
  await ctx.s.waitFor(async () => (await grows()) > before, "the new article stored")
  await ctx.s.waitFor(
    async () => (await ctx.pageText()).includes(`Grow item ${before + 1}`),
    "the window to show it without being asked",
    { timeout: 10000 },
  )
}))

test("F4b reopening does not refetch feeds that were just checked", { timeout: 120000 }, shot("F4b", async () => {
  await ctx.s.invoke("set_setting", { key: "refresh_minutes", value: 30 })
  await ctx.s.exec(`document.activeElement?.blur()`)
  await ctx.s.press("r")
  await ctx.waitNoText("Refreshing")
  await sleep(500)
  const hits = async () => (await serverStats()).counters["/grow.xml"] ?? 0
  const before = await hits()
  ctx = await ctx.restart()
  await sleep(70000)
  assert.equal(await hits(), before, "no fetch within a minute of reopening")
}))

test("F5 the shortcut sheet opens with ? and closes with Escape", shot("F5", async () => {
  await ctx.s.exec(`document.activeElement?.blur()`)
  await ctx.s.press("?", { shift: true })
  await ctx.s.waitFor(() => ctx.s.exec(`return !!document.getElementById('shortcuts-title')`), "the sheet")
  await ctx.s.press("Escape")
  await ctx.s.waitFor(() => ctx.s.exec(`return !document.getElementById('shortcuts-title')`), "it to close")
}))

test("F6 Ctrl+B hides and shows the sidebar, and it is remembered", shot("F6", async () => {
  const width = () => ctx.s.exec(`return document.querySelector('aside').parentElement.getBoundingClientRect().width`)
  assert.ok((await width()) > 100, "precondition: open")
  await ctx.s.exec(`document.activeElement?.blur()`)
  await ctx.s.press("b", { ctrl: true })
  await ctx.s.waitFor(async () => (await width()) < 2, "collapsed")
  await ctx.reloadAndCheck()
  assert.ok((await width()) < 2, "still collapsed after reopening")
  await ctx.s.press("b", { ctrl: true })
  await ctx.s.waitFor(async () => (await width()) > 100, "open again")
}))

test("F7 Ctrl + and - step the interface size, Ctrl 0 resets it", shot("F7", async () => {
  const scale = () => ctx.s.exec(`return Number(localStorage.getItem('turbo-ui-scale') || 1)`)
  await ctx.s.exec(`document.activeElement?.blur()`)
  await ctx.s.press("=", { ctrl: true })
  await ctx.s.waitFor(async () => (await scale()) > 1, "bigger")
  await ctx.s.press("-", { ctrl: true })
  await ctx.s.press("-", { ctrl: true })
  await ctx.s.waitFor(async () => (await scale()) < 1, "smaller")
  await ctx.s.press("0", { ctrl: true })
  await ctx.s.waitFor(async () => (await scale()) === 1, "reset")
}))
