// The notification bell, and finding settings from the search bar.
import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { launch, withShot } from "../lib/harness.mjs"
import { sleep } from "../lib/webdriver.mjs"
import { HttpClient } from "../lib/mcp.mjs"

let ctx
const shot = (name, fn) => withShot(() => ctx, `notify-${name}`, fn)
const MCP_PORT = 7896

before(async () => {
  ctx = await launch()
  await ctx.s.invoke("add_source", { url: ctx.url("/rss.xml"), groupId: null })
  await ctx.s.invoke("import_opml", {
    xml: `<?xml version="1.0"?><opml version="2.0"><body>
      <outline text="Broken" type="rss" xmlUrl="${ctx.url("/broken.xml")}"/></body></opml>`,
  })
  await ctx.s.invoke("fetch_all")
  await ctx.reloadUi()
  await ctx.leaveHome()
})
after(async () => {
  await ctx?.s.invoke("mcp_configure", { config: { enabled: false, port: MCP_PORT, lan: false } }).catch(() => {})
  await ctx?.stop()
})

const panelText = () => ctx.s.exec(`return document.querySelector('[data-bell-panel]')?.innerText ?? ''`)
async function openBell() {
  await (await ctx.s.waitFor(() => ctx.s.byLabel("Notifications"), "the bell")).click()
  await ctx.s.waitFor(() => ctx.s.exec(`return !!document.querySelector('[data-bell-panel]')`), "the bell panel")
}
const closeBell = async () => {
  await ctx.s.press("Escape")
  await ctx.s.waitFor(() => ctx.s.exec(`return !document.querySelector('[data-bell-panel]')`), "the panel to close")
}

test("N1 a failing feed shows as a count on the bell and opens from the panel", shot("N1", async () => {
  await ctx.s.waitFor(
    () => ctx.s.exec(`return document.querySelector('[data-bell-count]')?.textContent === '1'`),
    "a count of one on the bell",
  )
  await openBell()
  assert.match(await panelText(), /Broken is failing/)
  assert.match(await panelText(), /Nothing yet/, "no history yet")
  assert.equal(
    await ctx.s.exec(`return document.querySelector('[data-bell-panel] [aria-label="Retry every feed"]')?.title ?? null`),
    "Retry every feed",
    "retry is an icon beside the heading, named on hover",
  )
  await (await ctx.s.byText("[data-failing-feed] button", "Broken is failing")).click()
  await ctx.s.waitFor(
    () => ctx.s.exec(`return !document.querySelector('[data-bell-panel]')`),
    "the panel closes on the way to the feed",
  )
}))

test("N2 agent changes land in the history; View all pages, removes and clears", shot("N2", async () => {
  await ctx.s.invoke("mcp_configure", { config: { enabled: true, port: MCP_PORT, lan: false } })
  const key = await ctx.s.invoke("mcp_create_key", { name: "Test agent", write: true })
  const mcp = new HttpClient(`http://127.0.0.1:${MCP_PORT}/mcp`, { authorization: `Bearer ${key}` })
  await mcp.initialize()
  const item = (await ctx.s.invoke("list_items", { filter: { scope: "all" } }))[0]
  for (let i = 0; i < 25; i++) {
    const r = await mcp.call("star", { article_id: item.id, starred: i % 2 === 0 })
    assert.equal(r.status, 200)
  }
  await ctx.s.waitFor(() => ctx.s.exec(`return !!document.querySelector('[data-bell-count]')`), "the bell still counting the failing feed")

  await openBell()
  await ctx.s.waitFor(async () => /Test agent (un)?starred/.test(await panelText()), "the agent's change in Recent")
  assert.equal(await ctx.s.exec(`return document.querySelectorAll('[data-bell-panel] [data-notification]').length`), 5, "the five latest")
  await ctx.s.exec(`[...document.querySelectorAll('[data-bell-panel] button')].find(b => b.textContent.trim() === 'View all').click()`)

  const rows = () => ctx.s.exec(`return document.querySelectorAll('[role=dialog][aria-labelledby=notifications-title] [data-notification]').length`)
  await ctx.s.waitFor(async () => (await rows()) === 20, "the first page of twenty")
  const dialogHeight = await ctx.s.exec(`return document.querySelector('[aria-labelledby=notifications-title]').getBoundingClientRect().height`)
  assert.ok(dialogHeight > 300, `the window is actually visible (${dialogHeight}px tall)`)
  // Clicked in the page: WebDriver's own scroll-into-view would also scroll
  // the app's clipped root and push the window's header off screen.
  const loadMore = await ctx.s.byText("[role=dialog] button", "Load more")
  await ctx.s.exec(`arguments[0].click()`, loadMore)
  await ctx.s.waitFor(async () => (await rows()) === 25, "all twenty-five after Load more")
  assert.equal(await ctx.s.byText("[role=dialog] button", "Load more"), null, "no more to load")

  await ctx.s.exec(`document.querySelector('[role=dialog] [data-notification] button[aria-label="Remove"]').click()`)
  await ctx.s.waitFor(async () => (await rows()) === 24, "one removed")
  await ctx.s.waitFor(
    () => ctx.s.exec(`const b = [...document.querySelectorAll('[aria-labelledby=notifications-title] button')].find(b => b.textContent.trim() === 'Clear all'); b?.click(); return !!b`),
    "Clear all",
  )
  await ctx.waitText("No history yet.")
  const dialogText = await ctx.s.exec(`return document.querySelector('[aria-labelledby=notifications-title]').innerText`)
  assert.match(dialogText, /needs attention[\s\S]*Broken is failing/i, "View all shows what needs attention, as the bell does")
  const page = await ctx.s.invoke("notifications_page", {})
  assert.equal(page.items.length, 0, "cleared in the database too")
  await ctx.s.press("Escape")
  await sleep(300)
}))

test("N3 the search bar finds settings by fuzzy name and opens the right tab", shot("N3", async () => {
  await (await ctx.s.waitFor(() => ctx.s.byLabel("Search feeds, articles and settings"), "the search bar")).click()
  await ctx.s.waitFor(() => ctx.s.exec(`return !!document.getElementById('turbo-palette')`), "the palette")
  await ctx.s.type("drk mod")
  const first = () => ctx.s.exec(`return document.querySelector('#turbo-palette-list [role=option]')?.textContent ?? ''`)
  await ctx.s.waitFor(async () => /Dark mode/.test(await first()), "Dark mode first for a fuzzy query")
  await ctx.s.press("Enter")
  await ctx.s.waitFor(
    () => ctx.s.exec(`return document.querySelector('[data-settings-heading]')?.textContent === 'Appearance'`),
    "Settings open on Appearance",
  )
  await ctx.s.waitFor(() => ctx.s.exec(`return !document.getElementById('turbo-palette')`), "the palette gone")
  await ctx.closeSettings()
}))
