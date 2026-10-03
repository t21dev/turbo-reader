// D. Home: the default view, glance counts, search, pinned chips, see all,
// opening articles, interest and mute ranking, sections and layouts.
import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { launch, withShot } from "../lib/harness.mjs"
import { sleep } from "../lib/webdriver.mjs"

let ctx
const shot = (name, fn) => withShot(() => ctx, `home-${name}`, fn)
let gid

before(async () => {
  ctx = await launch()
  gid = await ctx.s.invoke("create_group", { name: "News" })
  await ctx.s.invoke("add_source", { url: ctx.url("/rss.xml"), groupId: gid })
  await ctx.s.invoke("add_source", { url: ctx.url("/atom.xml"), groupId: null })
  await ctx.reloadUi()
})
after(async () => {
  await ctx?.stop()
})

const atHome = () => ctx.s.exec(`return !!document.getElementById('turbo-home-search')`)
const goHome = async () => {
  if (!(await atHome())) await (await ctx.railOrFail("Home")).click()
  await ctx.s.waitFor(atHome, "home")
  await sleep(300)
}

/* -------------------------------------------------------------------------- */

test("D1 opens on home, and g toggles it", shot("D1", async () => {
  assert.ok(await atHome(), "home on launch")
  await ctx.s.exec(`document.activeElement?.blur()`)
  await ctx.s.press("g")
  await ctx.s.waitFor(async () => !(await atHome()), "g to leave home")
  await ctx.s.press("g")
  await ctx.s.waitFor(atHome, "g to come back")
}))

test("D2 the glance counts are right, and each one scopes the page", shot("D2", async () => {
  await goHome()
  const items = await ctx.items()
  const now = Date.now() / 1000
  const midnight = now - (now % 86400)
  const expected = {
    today: items.filter((x) => x.published >= midnight).length,
    week: items.filter((x) => x.published >= now - 7 * 86400).length,
    month: items.filter((x) => x.published >= now - 30 * 86400).length,
  }
  const shown = await ctx.s.exec(
    `const out = {};
     for (const [k, label] of [['today','Today'],['week','This week'],['month','This month']]) {
       const b = [...document.querySelectorAll('button')].find(b => b.textContent.toLowerCase().includes(label.toLowerCase()) && /\\d/.test(b.textContent));
       out[k] = b ? Number(b.querySelector('span').textContent.replace(/[^\\d]/g, '')) : null;
     }
     return out`,
  )
  assert.deepEqual(shown, expected)

  // "This week" widens the bands to include the four-day-old article
  const weekBtn = await ctx.s.byText("button", "This week")
  await weekBtn.click()
  await ctx.waitText("Delta about crypto prices", "week to include a four day old article")
  const todayBtn = await ctx.s.byText("button", "Today")
  await todayBtn.click()
  await ctx.waitNoText("Echo from ten days ago")
}))

test("D3 search on home", shot("D3", async () => {
  await goHome()
  const input = await ctx.s.find("#turbo-home-search")
  await input.click()
  await ctx.s.type("kubernetes")
  await ctx.waitText("1 result", "a single result")
  await ctx.waitText("Bravo about kubernetes clusters")
  await ctx.s.press("Escape")
  await ctx.waitNoText("1 result", "Escape to clear it")
}))

test("D4 a pinned chip opens its feed", shot("D4", async () => {
  const atom = await ctx.source("Fixture Atom")
  await ctx.s.invoke("set_pinned", { id: atom.id, pinned: true })
  await ctx.reloadUi()
  await goHome()
  const chip = await ctx.s.waitFor(
    () => ctx.s.exec(`return [...document.querySelectorAll('button')].find(b => b.textContent.includes('Fixture Atom') && !b.closest('aside')) ?? null`),
    "the pinned chip",
  )
  await ctx.s.exec(`arguments[0].click()`, chip)
  await ctx.s.waitFor(async () => !(await atHome()), "to leave home")
  await ctx.s.waitFor(async () => (await ctx.titles()).every((t) => t.startsWith("Atom")), "only that feed's articles")
}))

test("D5 See all opens the folder", shot("D5", async () => {
  await goHome()
  const btn = await ctx.s.waitFor(() => ctx.s.byText("button", "See all"), "See all")
  await btn.click()
  await ctx.s.waitFor(async () => !(await atHome()), "to leave home")
  await ctx.s.waitFor(async () => {
    const t = await ctx.titles()
    return t.length > 0 && t.every((x) => !x.startsWith("Atom"))
  }, "the folder's articles only")
}))

test("D6 opening an article from home goes to the reader", shot("D6", async () => {
  await goHome()
  const card = await ctx.s.waitFor(() => ctx.s.byText("article, li > div", "Alpha arrives within the hour"), "the card")
  await card.click()
  await ctx.s.waitFor(async () => (await ctx.readerTitle()) === "Alpha arrives within the hour", "the reader")
  const item = (await ctx.items()).find((x) => x.title.startsWith("Alpha"))
  assert.equal(item.read, true, "marked read")
}))

test("D7 interests lift an article and mutes sink one", shot("D7", async () => {
  await ctx.s.invoke("set_read", { ids: (await ctx.items()).map((x) => x.id), read: false })
  await ctx.reloadUi()
  await goHome()
  // widen to the month so every RSS article competes for the band
  await (await ctx.s.byText("button", "This month")).click()
  await sleep(400)

  await ctx.settings()
  const areas = await ctx.s.findAll("[role=dialog] textarea")
  await areas[0].click()
  await ctx.s.type("kubernetes")
  await areas[1].click()
  await ctx.s.type("crypto")
  await sleep(800)
  await ctx.closeSettings()

  const home = await ctx.home({ window: "month", perBand: 8 })
  const band = home.bands.find((b) => b.name === "News")
  const order = band.items.map((x) => x.title)
  assert.equal(order[0], "Bravo about kubernetes clusters", `interest first: ${order.join(" | ")}`)
  assert.equal(order[order.length - 1], "Delta about crypto prices", `mute last: ${order.join(" | ")}`)
  assert.match(band.items[0].why, /interest/i, "the tooltip says why")
}))

test("D7b editing both lists quickly keeps both, and closing mid-edit still saves", shot("D7b", async () => {
  await ctx.settings()
  const areas = await ctx.s.findAll("[role=dialog] textarea")
  await areas[0].click()
  await ctx.s.press("a", { ctrl: true })
  await ctx.s.type("alpha-keyword")
  await areas[1].click()
  await ctx.s.press("a", { ctrl: true })
  await ctx.s.type("beta-keyword")
  // close immediately, well inside the debounce
  await ctx.closeSettings()
  await sleep(600)
  const settings = await ctx.s.invoke("get_settings")
  assert.equal(settings.home_interests, "alpha-keyword", "the first list survived the second edit")
  assert.equal(settings.home_mutes, "beta-keyword", "the edit made just before closing was saved")
}))

test("D8 sections and categories switched off leave home", shot("D8", async () => {
  await goHome()
  await ctx.settings()
  const search = await ctx.s.waitFor(
    () => ctx.s.exec(`return [...document.querySelectorAll('[role=dialog] button')].find(b => b.textContent.trim() === 'Search') ?? null`),
    "the Search section toggle",
  )
  await ctx.s.exec(`arguments[0].click()`, search)
  await ctx.closeSettings()
  await ctx.s.waitFor(() => ctx.s.exec(`return !document.getElementById('turbo-home-search')`), "the search box gone")

  await ctx.settings()
  const back = await ctx.s.exec(`return [...document.querySelectorAll('[role=dialog] button')].find(b => b.textContent.trim() === 'Search')`)
  await ctx.s.exec(`arguments[0].click()`, back)
  const eye = await ctx.s.exec(
    `const row = [...document.querySelectorAll('[role=dialog] span')].find(s => s.textContent.trim() === 'News')?.parentElement;
     return row?.querySelector('button') ?? null`,
  )
  await ctx.s.exec(`arguments[0].click()`, eye)
  await ctx.closeSettings()
  await ctx.s.waitFor(
    () => ctx.s.exec(`return ![...document.querySelectorAll('h2')].some(h => h.textContent.trim() === 'News')`),
    "the News band gone",
  )
}))

test("D9 a category layout override sticks", shot("D9", async () => {
  // restore the band from D8, then force headlines
  await ctx.s.exec(`const k='turbo-home'; const p = JSON.parse(localStorage.getItem(k) || '{}'); p.hiddenGroups = []; localStorage.setItem(k, JSON.stringify(p))`)
  await ctx.s.invoke("set_group_layout", { id: gid, layout: "headlines" })
  await ctx.reloadUi()
  await goHome()
  await ctx.s.waitFor(
    () => ctx.s.exec(`const h = [...document.querySelectorAll('h2')].find(h => h.textContent.trim() === 'News');
                      return !!h && !!h.closest('div.mt-9')?.querySelector('ol')`),
    "the News band as a numbered list",
  )
  ctx = await ctx.restart()
  const home = await ctx.home({ window: "today" })
  assert.equal(home.bands.find((b) => b.name === "News").layout, "headlines", "still headlines after restart")
}))
