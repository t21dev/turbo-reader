// Long lists in Settings have a search box: pinned feeds on the Home tab.
import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { launch, withShot } from "../lib/harness.mjs"
import { sleep } from "../lib/webdriver.mjs"

let ctx
const shot = (name, fn) => withShot(() => ctx, `settings-lists-${name}`, fn)
const NAMES = ["Alpha Daily", "Bravo Weekly", "Charlie Tech", "Delta Science", "Echo Games", "Foxtrot Design", "Golf Linux"]

before(async () => {
  ctx = await launch()
  // OPML import adds the feeds by name without needing each one to answer.
  const outlines = NAMES.map((n, i) => `<outline text="${n}" type="rss" xmlUrl="${ctx.url(`/rss.xml?n=${i}`)}"/>`).join("")
  await ctx.s.invoke("import_opml", { xml: `<?xml version="1.0"?><opml version="2.0"><body>${outlines}</body></opml>` })
  await ctx.reloadUi()
})
after(async () => {
  await ctx?.stop()
})

const pinNames = () =>
  ctx.s.exec(`return [...document.querySelectorAll('[data-pin-list] button')].map((b) => b.textContent.trim())`)

test("L1 the pinned feeds picker finds a feed by a loose name", shot("L1", async () => {
  await ctx.settings("Home")
  await ctx.s.waitFor(
    () => ctx.s.exec(`const b = [...document.querySelectorAll('button')].find((x) => /None pinned|\\d+ pinned/.test(x.textContent)); b?.click(); return !!b`),
    "the pinned feeds picker",
  )
  const box = await ctx.s.waitFor(
    () => ctx.s.exec(`return document.querySelector('input[aria-label="Find a feed to pin"]')`),
    "a search box over a long list",
  )
  assert.equal((await pinNames()).length, NAMES.length, "every feed before searching")
  await ctx.s.exec(`arguments[0].focus()`, box)
  await ctx.s.type("chrlie")
  await ctx.s.waitFor(async () => (await pinNames()).length === 1, "one match for a misspelt name")
  assert.deepEqual(await pinNames(), ["Charlie Tech"])
  await ctx.s.press("Escape")
  await ctx.s.waitFor(async () => (await pinNames()).length === NAMES.length, "Escape clears the search")
  assert.ok(await ctx.s.exec(`return !!document.getElementById('settings-title')`), "and leaves Settings open")
  await ctx.s.exec(`arguments[0].focus()`, box)
  await ctx.s.type("zzzz")
  await ctx.waitText("No feed matches.")
  await ctx.s.press("Escape")
  await sleep(200)
  await ctx.closeSettings()
}))
