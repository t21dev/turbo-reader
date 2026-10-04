// Reading: the paper theme, the bundled reading fonts, and reading mode.
import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { launch, withShot } from "../lib/harness.mjs"
import { sleep } from "../lib/webdriver.mjs"

let ctx
const shot = (name, fn) => withShot(() => ctx, `reading-${name}`, fn)

before(async () => {
  ctx = await launch()
  await ctx.s.invoke("add_source", { url: ctx.url("/rss.xml"), groupId: null })
  await ctx.reloadUi()
  await ctx.leaveHome()
  await ctx.view("list")
})
after(async () => {
  await ctx?.stop()
})

const root = () =>
  ctx.s.exec(`const r = document.documentElement; return {
    paper: r.classList.contains('paper'), dark: r.classList.contains('dark'),
    bg: getComputedStyle(r).getPropertyValue('--background').trim(),
    font: getComputedStyle(r).getPropertyValue('--reader-font').trim(),
  }`)

test("R1 the paper theme is warm, light, and survives reopening", shot("R1", async () => {
  await ctx.settings("Appearance")
  await (await ctx.s.waitFor(() => ctx.s.byText("[role=dialog] button", "Paper"), "the Paper option")).click()
  await ctx.s.waitFor(async () => (await root()).paper, "paper applied")
  const r = await root()
  assert.equal(r.dark, false, "paper is a light theme")
  assert.equal(r.bg, "40 33% 93.5%", "the warm page colour")
  await ctx.closeSettings()
  await ctx.reloadAndCheck()
  assert.equal((await root()).paper, true, "still paper after reopening")
}))

test("R2 every bundled reading font loads from inside the app", shot("R2", async () => {
  const loaded = await ctx.s.execAsync(
    `const done = arguments[arguments.length - 1];
     const fams = ['Libron', 'Literata Variable', 'Source Serif 4 Variable', 'Merriweather Variable', 'Atkinson Hyperlegible Next Variable', 'Geist Variable'];
     Promise.all(fams.map(f => document.fonts.load('16px "' + f + '"', 'Aa').then(faces => [f, faces.length])))
       .then(r => done(Object.fromEntries(r)), e => done(String(e)))`,
  )
  for (const [family, faces] of Object.entries(loaded)) assert.ok(faces > 0, `${family} loaded (${faces} faces)`)
}))

test("R3 picking a font changes the article's font", shot("R3", async () => {
  await ctx.settings("Reading")
  const fonts = await ctx.s.exec(`return [...document.querySelectorAll('[role=radiogroup][aria-label="Article font"] [role=radio]')].map(b => b.textContent)`)
  assert.equal(fonts.length, 8, "six reading fonts, system serif and mono")
  await ctx.s.exec(`[...document.querySelectorAll('[aria-label="Article font"] [role=radio]')].find(b => b.textContent.includes('Libron')).click()`)
  await ctx.s.waitFor(async () => (await root()).font.startsWith('"Libron"'), "Libron as the article font")
  assert.match((await root()).font, /Segoe UI Emoji.*Noto Color Emoji/, "emoji fall back to the system's colour font")
  await ctx.closeSettings()
}))

test("R4 reading mode leaves the article alone, and Esc brings the rest back", shot("R4", async () => {
  await (await ctx.railOrFail("Fixture RSS")).click()
  await sleep(300)
  await ctx.open("Alpha arrives within the hour")
  const sidebar = () => ctx.s.exec(`return document.querySelector('aside')?.parentElement?.getBoundingClientRect().width ?? 0`)
  const list = () => ctx.s.exec(`return !!document.getElementById('turbo-search')`)
  assert.ok((await sidebar()) > 100 && (await list()), "sidebar and list showing")
  await ctx.s.exec(`document.activeElement?.blur()`)
  await ctx.s.press("z")
  await ctx.s.waitFor(async () => (await sidebar()) < 2 && !(await list()), "the article alone")
  assert.equal(await ctx.readerTitle(), "Alpha arrives within the hour")
  await ctx.s.press("Escape")
  await ctx.s.waitFor(async () => (await sidebar()) > 100 && (await list()), "back to the list and sidebar")
  assert.equal(await ctx.readerTitle(), "Alpha arrives within the hour", "the first Esc only leaves reading mode")
  // the toolbar button does the same
  await (await ctx.s.byLabel("Reading mode")).click()
  await ctx.s.waitFor(async () => (await sidebar()) < 2, "reading mode from the button")
  await (await ctx.s.byLabel("Leave reading mode")).click()
  await ctx.s.waitFor(async () => (await sidebar()) > 100, "and back")
}))
