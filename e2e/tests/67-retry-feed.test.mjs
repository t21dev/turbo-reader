// Retrying one failing feed, from the feed's menu, the sidebar and the bell,
// without refreshing every other feed along with it.
import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { launch, withShot } from "../lib/harness.mjs"

let ctx
const shot = (name, fn) => withShot(() => ctx, `retry-${name}`, fn)

before(async () => {
  ctx = await launch()
  await ctx.s.invoke("add_source", { url: ctx.url("/rss.xml"), groupId: null })
  await ctx.s.invoke("import_opml", {
    xml: `<?xml version="1.0"?><opml version="2.0"><body>
      <outline text="Flaky" type="rss" xmlUrl="${ctx.url("/flaky.xml")}"/></body></opml>`,
  })
  await ctx.s.invoke("fetch_all")
  await ctx.reloadUi()
  await ctx.leaveHome()
})
after(async () => {
  await ctx?.stop()
})

const hits = async (path) => (await (await fetch(ctx.url("/__stats"))).json()).counters[path] ?? 0
const toastSays = (re, what) => ctx.s.waitFor(async () => re.test((await ctx.toast()) ?? ""), what)

test("R1 a failing feed's menu offers Retry feed, and only that feed is fetched", shot("R1", async () => {
  const rssBefore = await hits("/rss.xml")
  const flakyBefore = await hits("/flaky.xml")
  await ctx.railMenu("Flaky", "Retry feed")
  await toastSays(/Flaky is still failing/, "a note that it still fails")
  assert.equal(await hits("/flaky.xml"), flakyBefore + 1, "the failing feed was fetched once")
  assert.equal(await hits("/rss.xml"), rssBefore, "the healthy feed was left alone")

  // A feed that works has nothing to retry.
  const healthy = (await ctx.sources()).find((s) => s.url.endsWith("/rss.xml"))
  const row = await ctx.railOrFail(healthy.name)
  await row.rightClick()
  await ctx.s.waitFor(() => ctx.s.byText('[role="menu"] button', "Rename"), "the healthy feed's menu")
  assert.equal(await ctx.s.byText('[role="menu"] button', "Retry feed"), null, "no Retry on a working feed")
  await ctx.s.press("Escape")
}))

test("R2 the sidebar row of a failing feed has its own retry button", shot("R2", async () => {
  assert.equal(
    await ctx.s.exec(`return document.querySelectorAll('aside [data-failing-row]').length`),
    1,
    "only the failing feed's row gets one",
  )
  const before = await hits("/flaky.xml")
  const retry = await ctx.s.waitFor(() => ctx.s.byLabel("Retry Flaky"), "the retry button in the sidebar")
  await ctx.s.exec(`arguments[0].click()`, retry)
  await ctx.s.waitFor(async () => (await hits("/flaky.xml")) === before + 1, "one more fetch of the feed")
  await toastSays(/Flaky is still failing/, "still failing")
}))

test("R3 retry from the bell, once the feed is back, clears it everywhere", shot("R3", async () => {
  await fetch(ctx.url("/__heal"))
  await (await ctx.s.waitFor(() => ctx.s.byLabel("Notifications"), "the bell")).click()
  const retry = await ctx.s.waitFor(
    () => ctx.s.exec(`return document.querySelector('[data-bell-panel] [data-failing-feed] button[aria-label="Retry Flaky"]')`),
    "Retry beside the failing feed in the bell",
  )
  await ctx.s.exec(`arguments[0].click()`, retry)
  await toastSays(/Flaky is working again, with 1 new article/, "a note that it works again")
  await ctx.s.waitFor(
    () => ctx.s.exec(`return !document.querySelector('[data-bell-panel] [data-failing-feed]')`),
    "the feed gone from Needs attention",
  )
  await ctx.s.waitFor(
    () => ctx.s.exec(`return !document.querySelector('aside [data-failing-row]')`),
    "the sidebar retry button gone",
  )
  const flaky = await ctx.source("Flaky")
  assert.equal(flaky.lastError, null, "the error is cleared in the database")
  assert.ok((await ctx.items({ scope: "source", id: flaky.id })).some((i) => i.title === "Back online"), "its article arrived")
  await ctx.s.press("Escape")
}))
