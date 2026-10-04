// Back and forward, the card view's sort and filters, search inside Settings,
// and selectable article text.
import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { launch, withShot } from "../lib/harness.mjs"
import { sleep } from "../lib/webdriver.mjs"

let ctx
const shot = (name, fn) => withShot(() => ctx, `nav-${name}`, fn)

before(async () => {
  ctx = await launch()
  for (const p of ["/rss.xml", "/teaser.xml"]) await ctx.s.invoke("add_source", { url: ctx.url(p), groupId: null })
  await ctx.reloadUi()
  await ctx.leaveHome()
  await ctx.view("cards")
})
after(async () => {
  await ctx?.stop()
})

const cardTitle = () => ctx.s.exec(`return document.querySelector('[data-card-title]')?.textContent ?? null`)
const altKey = async (key) => {
  await ctx.s.exec(`document.activeElement?.blur()`)
  await ctx.s.cmd("POST", "/actions", {
    actions: [{ type: "key", id: "kb", actions: [
      { type: "keyDown", value: "" }, { type: "keyDown", value: key },
      { type: "keyUp", value: key }, { type: "keyUp", value: "" },
    ] }],
  })
  await ctx.s.cmd("DELETE", "/actions")
}
const LEFT = ""
const RIGHT = ""

test("V1 Alt+Left and Alt+Right step back and forward through the places visited", shot("V1", async () => {
  await ctx.s.waitFor(async () => (await cardTitle()) === "All articles", "All articles")
  await (await ctx.railOrFail("Fixture RSS")).click()
  await ctx.s.waitFor(async () => (await cardTitle()) === "Fixture RSS", "the feed")
  await (await ctx.railOrFail("Fixture Teasers")).click()
  await ctx.s.waitFor(async () => (await cardTitle()) === "Fixture Teasers", "the second feed")

  await altKey(LEFT)
  await ctx.s.waitFor(async () => (await cardTitle()) === "Fixture RSS", "back to the first feed")
  await altKey(LEFT)
  await ctx.s.waitFor(async () => (await cardTitle()) === "All articles", "back to All articles")
  await altKey(RIGHT)
  await ctx.s.waitFor(async () => (await cardTitle()) === "Fixture RSS", "forward again")

  // going somewhere new drops what was ahead
  await (await ctx.railOrFail("Starred")).click()
  await ctx.s.waitFor(async () => (await cardTitle()) === "Starred", "Starred")
  await altKey(RIGHT)
  await sleep(300)
  assert.equal(await cardTitle(), "Starred", "nothing ahead after a new place")
}))

test("V2 the card view sorts and filters from its header", shot("V2", async () => {
  await (await ctx.railOrFail("Fixture RSS")).click()
  await ctx.s.waitFor(async () => (await cardTitle()) === "Fixture RSS", "the feed")
  const first = () => ctx.s.exec(`return document.querySelector('section article h3')?.textContent.trim() ?? null`)
  await ctx.s.waitFor(async () => (await first()) === "Alpha arrives within the hour", "newest first")
  await (await ctx.s.byLabel("Newest first")).click()
  await ctx.s.waitFor(async () => (await first()) === "Echo from ten days ago", "oldest first from the card header")
  await (await ctx.s.byLabel("Oldest first")).click()
  await ctx.s.waitFor(async () => (await first()) === "Alpha arrives within the hour", "and back")
}))

test("V3 search inside Settings finds a setting, opens its tab and points at it", shot("V3", async () => {
  await ctx.settings("Appearance")
  const input = await ctx.s.find("#settings-search")
  await input.click()
  await ctx.s.type("tray")
  await ctx.s.waitFor(
    () => ctx.s.exec(`return document.querySelector('[data-settings-results] [role=option]')?.textContent.includes('Keep running in the tray')`),
    "the tray setting first",
  )
  await ctx.s.press("Enter")
  await ctx.s.waitFor(
    () => ctx.s.exec(`return document.querySelector('[data-settings-heading]')?.textContent === 'Background'`),
    "the Background tab",
  )
  await ctx.s.waitFor(() => ctx.s.exec(`return !!document.querySelector('.settings-flash')`), "the setting pointed out")
  // Escape with text in the box clears it first
  await input.click()
  await ctx.s.type("zzz")
  await ctx.waitText("No setting matches.")
  await ctx.s.press("Escape")
  await ctx.s.waitFor(() => ctx.s.exec(`return document.getElementById('settings-search').value === ''`), "cleared")
  assert.ok(await ctx.s.exec(`return !!document.getElementById('settings-title')`), "Settings still open")
  await ctx.closeSettings()
}))

test("V4 article text can be selected", shot("V4", async () => {
  await ctx.view("list")
  await ctx.open("Alpha arrives within the hour")
  const selectable = await ctx.s.exec(`return getComputedStyle(document.querySelector('article.reader-column .prose-feed p')).userSelect`)
  assert.notEqual(selectable, "none", "the body text selects")
  const picked = await ctx.s.exec(`const p = document.querySelector('article.reader-column .prose-feed p');
    const r = document.createRange(); r.selectNodeContents(p); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    return s.toString().slice(0, 11)`)
  assert.equal(picked, "Alpha body.")
}))
