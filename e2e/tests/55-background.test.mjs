// Background mode: off by default, offered on the welcome screen, and closing
// to the tray when switched on. Start at login is not exercised here: it
// writes a real login entry, which could clash with an installed copy.
import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { launch, withShot } from "../lib/harness.mjs"
import { sleep } from "../lib/webdriver.mjs"

let ctx
const shot = (name, fn) => withShot(() => ctx, `background-${name}`, fn)

before(async () => {
  ctx = await launch()
})
after(async () => {
  await ctx?.stop()
})

const visible = () => ctx.s.invoke("plugin:window|is_visible", { label: "main" })

test("K1 everything is off by default, and the welcome screen offers it", shot("K1", async () => {
  const prefs = await ctx.s.invoke("get_background")
  assert.deepEqual(prefs, { closeToTray: false, notify: "off" })
  // the third welcome step
  for (let i = 0; i < 2; i++) {
    await ctx.s.waitFor(
      () => ctx.s.exec(`const b = [...document.querySelectorAll('[data-welcome] footer button')].find(b => /Next|Skip for now/.test(b.textContent)); b?.click(); return !!b`),
      "the next step button",
    )
    await sleep(350)
  }
  await ctx.s.waitFor(() => ctx.s.exec(`return !!document.querySelector('[data-background-prefs]')`), "the background choices on the welcome screen")
  const text = await ctx.pageText()
  assert.ok(text.includes("How it runs"))
  assert.ok(text.includes("Keep running in the tray"))
  const switches = await ctx.s.exec(`return [...document.querySelectorAll('[data-background-prefs] [role=switch]')].map(s => s.getAttribute('aria-checked'))`)
  assert.ok(switches.every((s) => s === "false"), `switches ${switches}`)
}))

test("K2 with the tray on, closing the window hides it instead of quitting", shot("K2", async () => {
  await ctx.s.exec(`document.querySelector('[role=switch][aria-labelledby=bg-tray]').click()`)
  await ctx.s.waitFor(async () => (await ctx.s.invoke("get_background")).closeToTray === true, "the tray setting saved")
  // close the window the way the title bar's close button does
  await ctx.s.exec(`window.__TAURI_INTERNALS__.invoke('plugin:window|close', { label: 'main' }).catch(() => null)`)
  await sleep(800)
  assert.equal(await visible(), false, "the window is hidden")
  // still running: the backend still answers
  const stats = await ctx.s.invoke("stats")
  assert.ok(stats, "the app is still running")
  await ctx.s.exec(`window.__TAURI_INTERNALS__.invoke('plugin:window|show', { label: 'main' })`)
  await ctx.s.waitFor(async () => (await visible()) === true, "the window back")
}))

test("K3 notifications can be chosen, and the tray switched off again", shot("K3", async () => {
  await ctx.s.exec(`[...document.querySelectorAll('[data-background-prefs] [role=radio]')].find(b => b.textContent.trim() === 'Pinned').click()`)
  await ctx.s.waitFor(async () => (await ctx.s.invoke("get_background")).notify === "pinned", "pinned-only notifications saved")
  await ctx.s.exec(`document.querySelector('[role=switch][aria-labelledby=bg-tray]').click()`)
  await ctx.s.waitFor(async () => (await ctx.s.invoke("get_background")).closeToTray === false, "the tray switched off")
  // the choice survives a reload, read back from the backend
  await ctx.reloadUi()
  const prefs = await ctx.s.invoke("get_background")
  assert.deepEqual(prefs, { closeToTray: false, notify: "pinned" })
}))
