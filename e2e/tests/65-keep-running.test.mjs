// Turning on AI agents offers to keep the app running in the tray, since
// agents can only reach a running app. Optional, and "Not now" sticks.
import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { launch, withShot } from "../lib/harness.mjs"
import { sleep } from "../lib/webdriver.mjs"

let ctx
const shot = (name, fn) => withShot(() => ctx, `keep-running-${name}`, fn)
const PORT = 7898

before(async () => {
  ctx = await launch()
  await ctx.s.invoke("add_source", { url: ctx.url("/rss.xml"), groupId: null })
  await ctx.s.invoke("mcp_configure", { config: { enabled: false, port: PORT, lan: false } })
  await ctx.reloadUi()
  await ctx.leaveHome()
})
after(async () => {
  await ctx?.s.invoke("mcp_configure", { config: { enabled: false, port: PORT, lan: false } }).catch(() => {})
  await ctx?.stop()
})

const offer = () => ctx.s.exec(`return !!document.querySelector('[data-keep-running-offer]')`)
const agentsSwitch = () => ctx.s.exec(`document.querySelector('[role=switch][aria-labelledby=mcp-enabled]').click()`)
const clickIn = (label) =>
  ctx.s.exec(
    `const b = [...document.querySelectorAll('[data-keep-running-offer] button')].find((x) => x.textContent.trim() === arguments[0]); b?.click(); return !!b`,
    label,
  )

test("K1 no offer while agents are off", shot("K1", async () => {
  await ctx.settings("AI agents")
  await ctx.s.waitFor(() => ctx.s.exec(`return !!document.querySelector('[data-agent-settings]')`), "the agents panel")
  await sleep(300)
  assert.equal(await offer(), false)
}))

test("K2 turning agents on offers the tray, and Keep running turns it on", shot("K2", async () => {
  await agentsSwitch()
  await ctx.s.waitFor(offer, "the offer once agents are on")
  assert.ok(await clickIn("Keep running"))
  await ctx.s.waitFor(() => ctx.s.exec(`return !!document.querySelector('[data-keep-running-done]')`), "the confirmation")
  const bg = await ctx.s.invoke("get_background")
  assert.equal(bg.closeToTray, true, "the tray setting is on")
  await ctx.closeSettings()
}))

test("K3 Not now hides the offer and it stays hidden", shot("K3", async () => {
  await ctx.s.invoke("set_background", { prefs: { ...(await ctx.s.invoke("get_background")), closeToTray: false } })
  await ctx.settings("AI agents")
  await ctx.s.waitFor(offer, "the offer again with the tray off")
  assert.ok(await clickIn("Not now"))
  await ctx.s.waitFor(async () => !(await offer()), "hidden")
  assert.equal((await ctx.s.invoke("get_background")).closeToTray, false, "nothing changed")
  await ctx.closeSettings()
  await ctx.settings("AI agents")
  await sleep(500)
  assert.equal(await offer(), false, "still hidden when Settings opens again")
  await ctx.closeSettings()
}))
