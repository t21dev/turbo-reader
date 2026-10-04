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

const dialogMotion = () =>
  ctx.s.exec(`const d = document.querySelector('[role=dialog][aria-labelledby=settings-title]');
    const cs = getComputedStyle(d);
    return { name: cs.animationName, duration: parseFloat(cs.animationDuration) * 1000 }`)

test("E0 Settings animates in, and opens at once with Animations off", shot("E0", async () => {
  await ctx.settings("Appearance")
  const on = await dialogMotion()
  assert.notEqual(on.name, "none", "the dialog has an entrance animation")
  assert.ok(on.duration >= 100, `the entrance runs for a visible time (${on.duration}ms)`)
  await segmentIn("Animations", "Off")
  await ctx.closeSettings()
  await ctx.settings()
  const off = await dialogMotion()
  assert.ok(off.duration <= 1, `with Animations off the entrance is instant (${off.duration}ms)`)
  await segmentIn("Animations", "On")
  await ctx.closeSettings()
}))

test("E1 appearance applies at once and survives a restart", shot("E1", async () => {
  await ctx.settings("Appearance")
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
  await ctx.settings("Reading")
  await ctx.s.exec(`[...document.querySelectorAll('[aria-label="Article font"] [role=radio]')].find(b => b.textContent.includes("System serif")).click()`)
  await sleep(200)
  await segment("Wide")
  await segment("Right to left")
  const r = await root()
  assert.match(r.font, /Georgia/)
  assert.equal(r.width, "84ch")
  await ctx.closeSettings()
}))

test("E3 the refresh interval is saved and the last check is shown", shot("E3", async () => {
  await ctx.settings("Feeds")
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
  await ctx.settings("Feeds")
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
  await ctx.about()
  const btn = await ctx.s.waitFor(() => ctx.s.byText("[role=dialog] button", "Check for updates"), "the button")
  await btn.click()
  await ctx.s.waitFor(
    async () => /Up to date|is out|GitHub|reach/i.test(await ctx.s.exec(`return document.querySelector('[role=dialog]').innerText`)),
    "a result",
    { timeout: 20000 },
  )
  assert.match(await ctx.s.exec(`return document.querySelector('[data-version]').textContent`), /Version \d+\.\d+\.\d+/, "the running version")
  await ctx.closeAbout()
}))

test("E8 reset appearance", shot("E8", async () => {
  await ctx.settings("Appearance")
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

test("E10 a custom accent from the picker or a typed hex code", shot("E10", async () => {
  await ctx.settings("Appearance")
  await segment("Dark")
  const accent = async () => (await root()).system
  const picker = await ctx.s.waitFor(() => ctx.s.byLabel("Custom accent colour"), "the colour picker")
  // Opening the native picker would block the session, so set it as the
  // picker would and fire the same event.
  await ctx.s.exec(
    `const el = arguments[0];
     Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '#ff8800');
     el.dispatchEvent(new Event('input', { bubbles: true }))`,
    picker,
  )
  await ctx.s.waitFor(async () => (await accent()).startsWith("32 100% "), "orange from the picker")

  const hex = await ctx.s.waitFor(() => ctx.s.byLabel("Accent hex code"), "the hex box")
  assert.equal((await hex.prop("value")).toLowerCase(), "#ff8800", "the box follows the picker")
  await hex.click()
  await ctx.s.press("a", { ctrl: true })
  await ctx.s.type("#3a7")
  await ctx.s.waitFor(async () => (await accent()).startsWith("154 54% "), "the short hex code applied")

  await ctx.s.press("a", { ctrl: true })
  await ctx.s.type("zz")
  await ctx.waitText("Use six hex digits")
  assert.ok((await accent()).startsWith("154 54% "), "a half-typed code changes nothing")

  // near black on a dark background is lifted so it can still be seen
  await ctx.s.press("a", { ctrl: true })
  await ctx.s.type("#111111")
  await ctx.s.waitFor(async () => (await accent()) === "0 0% 55%", "near black lifted to readable")

  await ctx.closeSettings()
  await ctx.reloadAndCheck()
  assert.equal(await accent(), "0 0% 55%", "kept after reopening")

  // a preset still wins when picked, and the custom colour is remembered
  await ctx.settings("Appearance")
  await ctx.s.exec(`document.querySelector('[role=dialog] button[title="Teal"]').click()`)
  await ctx.s.waitFor(async () => (await accent()).startsWith("172 "), "teal")
  const saved = await ctx.s.exec(`return JSON.parse(localStorage.getItem('turbo-theme')).customAccent`)
  assert.equal(saved, "#111111")
  await ctx.closeSettings()
}))

test("E11 update check: a note in the title bar, a setting to stop it, and the manual check", shot("E11", async () => {
  const pill = () => ctx.s.exec(`return [...document.querySelectorAll('button')].find(b => /Update to/.test(b.textContent))?.textContent.trim() ?? null`)
  // A check that already found a newer release: the note shows after a reload.
  await ctx.s.exec(`localStorage.setItem('turbo-update-check', JSON.stringify({ at: Date.now(), latest: '99.0.0', url: 'https://github.com/t21dev/turbo-reader/releases/tag/v99.0.0' }))`)
  await ctx.reloadUi()
  await ctx.s.waitFor(async () => /Update to 99\.0\.0/.test((await pill()) ?? ""), "the update note in the title bar")

  // Switched off, the note goes away.
  await ctx.about()
  const launch = `document.querySelector('[role=switch][aria-labelledby=about-launch]')`
  assert.equal(await ctx.s.exec(`return ${launch}.getAttribute('aria-checked')`), "true", "on by default")
  await ctx.s.exec(`${launch}.click()`)
  await ctx.s.waitFor(async () => (await pill()) === null, "the note to go when checking is off")
  const saved = await ctx.s.exec(`return JSON.parse(localStorage.getItem('turbo-prefs')).updateCheck`)
  assert.equal(saved, false, "the setting is saved")
  await ctx.s.exec(`${launch}.click()`)
  await ctx.s.waitFor(async () => (await pill()) !== null, "back on")

  // A manual check that finds nothing newer clears the note, in both places.
  await ctx.trap("check_for_updates", { current: "0.6.0", latest: "0.6.0", newer: false, url: "https://github.com/t21dev/turbo-reader/releases/tag/v0.6.0", published: "2026-10-04" })
  await (await ctx.s.byText("[role=dialog] button", "Check for updates")).click()
  await ctx.waitText("Up to date on")
  await ctx.s.waitFor(async () => (await pill()) === null, "the note to clear after an up-to-date check")
  await ctx.closeAbout()
}))
