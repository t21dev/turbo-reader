// E. Settings: appearance and its persistence, reading, refresh, YouTube,
// library stats, update check, reset, and closing.
import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { launch, withShot } from "../lib/harness.mjs"
import { sleep } from "../lib/webdriver.mjs"

let ctx
const shot = (name, fn) => withShot(() => ctx, `settings-${name}`, fn)

before(async () => {
  ctx = await launch()
  await ctx.s.invoke("add_source", { url: ctx.url("/rss.xml"), groupId: null })
  await ctx.reloadUi()
})
after(async () => {
  await ctx?.stop()
})

const segment = async (label) => {
  const b = await ctx.s.waitFor(
    () => ctx.s.exec(`return [...document.querySelectorAll('[role=dialog] button')].find(b => b.textContent.trim() === arguments[0]) ?? null`, label),
    `the "${label}" option`,
  )
  await ctx.s.exec(`arguments[0].click()`, b)
  await sleep(200)
}
/** An option inside a specific field, for labels that repeat ("Off"). */
const segmentIn = async (field, label) => {
  const b = await ctx.s.waitFor(
    () => ctx.s.exec(
      `const [field, label] = arguments;
       const p = [...document.querySelectorAll('[role=dialog] p')].find(p => p.textContent.trim().startsWith(field));
       return p ? [...p.parentElement.querySelectorAll('button')].find(b => b.textContent.trim() === label) ?? null : null`,
      field, label),
    `"${label}" under "${field}"`,
  )
  await ctx.s.exec(`arguments[0].click()`, b)
  await sleep(200)
}
const root = () =>
  ctx.s.exec(`const r = document.documentElement; return {
    dark: r.classList.contains('dark'), density: r.dataset.density, motion: r.dataset.motion,
    system: getComputedStyle(r).getPropertyValue('--system').trim(),
    font: getComputedStyle(r).getPropertyValue('--reader-font').trim(),
    size: getComputedStyle(r).getPropertyValue('--reader-size').trim(),
    width: getComputedStyle(r).getPropertyValue('--reader-width').trim(),
  }`)

/* -------------------------------------------------------------------------- */

test("E1 appearance applies at once and survives a restart", shot("E1", async () => {
  await ctx.settings()
  await segment("Light")
  assert.equal((await root()).dark, false, "light applied")
  await segment("Compact")
  assert.equal((await root()).density, "compact")
  await segmentIn("Animations", "Off")
  assert.equal((await root()).motion, "none", "animations off")
  const violet = await ctx.s.exec(`return document.querySelector('[role=dialog] button[title="Violet"]')`)
  await ctx.s.exec(`arguments[0].click()`, violet)
  await sleep(200)
  const accent = (await root()).system
  assert.match(accent, /^262 /, "violet accent applied")
  await ctx.closeSettings()

  await ctx.reloadAndCheck()
  const r = await root()
  assert.equal(r.dark, false, "still light")
  assert.equal(r.density, "compact", "still compact")
  assert.equal(r.motion, "none", "still no animations")
  assert.match(r.system, /^262 /, "still violet")
  // and the first frame was painted light, not dark then light
  const bg = await ctx.s.exec(`return getComputedStyle(document.body).backgroundColor`)
  assert.notEqual(bg, "rgb(13, 13, 13)", "no dark first paint in light mode")
}))

test("E2 reading preferences reach the article", shot("E2", async () => {
  await ctx.settings()
  await segment("Serif")
  await segment("Wide")
  await segment("Right to left")
  const r = await root()
  assert.match(r.font, /Georgia/)
  assert.equal(r.width, "84ch")
  await ctx.closeSettings()
}))

test("E3 the refresh interval is saved and the last check is shown", shot("E3", async () => {
  await ctx.settings()
  await segmentIn("Check for new articles", "15m")
  const saved = await ctx.s.exec(`return JSON.parse(localStorage.getItem('turbo-prefs')).refreshMinutes`)
  assert.equal(saved, 15)
  const text = await ctx.pageText()
  assert.match(text, /Last checked/i)
  await segmentIn("Check for new articles", "Off")
  assert.match(await ctx.pageText(), /Manual only/)
  await segmentIn("Check for new articles", "30m")
  await ctx.closeSettings()
}))

test("E5 the YouTube preference is saved", shot("E5", async () => {
  await ctx.settings()
  await segment("Play here")
  assert.equal(await ctx.s.exec(`return JSON.parse(localStorage.getItem('turbo-prefs')).youtubeInline`), true)
  await segment("Open in browser")
  await ctx.closeSettings()
}))

test("E6 library stats agree with the sidebar", shot("E6", async () => {
  const items = await ctx.items()
  await ctx.s.invoke("set_hidden", { ids: [items[0].id], hidden: true })
  await ctx.reloadUi()
  const sidebarUnread = (await ctx.sources()).reduce((n, s) => n + s.unread, 0)
  const stats = await ctx.stats()
  assert.equal(stats.unread, sidebarUnread, "unread counts match")
  assert.equal(stats.items, (await ctx.items()).length, "article counts match what you can see")
}))

test("E7 check for updates reports something", shot("E7", async () => {
  await ctx.settings()
  const btn = await ctx.s.waitFor(() => ctx.s.byText("[role=dialog] button", "Check for updates"), "the button")
  await btn.click()
  await ctx.s.waitFor(
    async () => /Up to date|is out|GitHub|reach/i.test(await ctx.s.exec(`return document.querySelector('[role=dialog]').innerText`)),
    "a result",
    { timeout: 20000 },
  )
  await ctx.closeSettings()
}))

test("E8 reset appearance", shot("E8", async () => {
  await ctx.settings()
  await (await ctx.s.byLabel("Reset appearance")).click()
  await ctx.confirmDialog()
  await sleep(300)
  const r = await root()
  assert.equal(r.density, "comfortable")
  assert.equal(r.motion, "full")
  assert.match(r.system, /^215 /, "default blue")
  await ctx.closeSettings()
}))

test("E9 Escape and the backdrop both close settings", shot("E9", async () => {
  await ctx.settings()
  await ctx.s.press("Escape")
  await ctx.s.waitFor(() => ctx.s.exec(`return !document.getElementById('settings-title')`), "Escape to close")
  await ctx.settings()
  await ctx.s.exec(`document.querySelector('[role=dialog]').parentElement.click()`)
  await ctx.s.waitFor(() => ctx.s.exec(`return !document.getElementById('settings-title')`), "the backdrop to close")
}))
