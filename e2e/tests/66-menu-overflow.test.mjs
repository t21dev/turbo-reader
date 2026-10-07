// Menus stay inside the window: a right-click menu whose group expands moves
// back up, and long menus scroll inside themselves rather than run off.
import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { launch, withShot } from "../lib/harness.mjs"
import { sleep } from "../lib/webdriver.mjs"

let ctx
const shot = (name, fn) => withShot(() => ctx, `menu-overflow-${name}`, fn)

before(async () => {
  ctx = await launch()
  // A short window and many folders: the case that ran off the bottom.
  await ctx.s.cmd("POST", "/window/rect", { width: 1100, height: 600 })
  for (let i = 1; i <= 14; i++) await ctx.s.invoke("create_group", { name: `Folder ${String(i).padStart(2, "0")}` })
  await ctx.s.invoke("add_source", { url: ctx.url("/rss.xml"), groupId: null })
  await ctx.reloadUi()
  await ctx.leaveHome()
})
after(async () => {
  await ctx?.stop()
})

const inside = (sel) =>
  ctx.s.exec(
    `const m = document.querySelector(arguments[0]); if (!m) return null
     const r = m.getBoundingClientRect()
     return { top: r.top, bottom: r.bottom, h: innerHeight, scrolls: m.scrollHeight > m.clientHeight }`,
    sel,
  )

test("O1 expanding Move to keeps the right-click menu inside the window", shot("O1", async () => {
  await ctx.railMenu("Fixture RSS", "Move to")
  await sleep(500)
  const box = await inside('[role="menu"]')
  assert.ok(box, "the menu is open")
  assert.ok(box.top >= 0, `top ${box.top} is on screen`)
  assert.ok(box.bottom <= box.h + 1, `bottom ${box.bottom} fits a ${box.h}px window`)
  // Every folder is reachable: the last one scrolls into view inside the menu.
  const reach = await ctx.s.exec(
    `const b = [...document.querySelectorAll('[role="menu"] button')].find((x) => x.textContent.trim() === 'Folder 14')
     if (!b) return false
     b.scrollIntoView({ block: 'nearest' })
     const r = b.getBoundingClientRect()
     return r.bottom <= innerHeight + 1 && r.top >= 0`,
  )
  assert.equal(reach, true, "the last folder can be reached")
  await ctx.s.press("Escape")
  await sleep(300)
}))

test("O2 a dropdown with an expanded group stays inside the window", shot("O2", async () => {
  await ctx.view("list")
  await (await ctx.railOrFail("All articles")).click()
  await sleep(300)
  await ctx.open("Alpha arrives within the hour")
  await (await ctx.s.waitFor(() => ctx.s.byLabel("More"), "the More button")).click()
  for (const label of ["Font", "Font size"]) {
    await ctx.s.exec(
      `const b = [...document.querySelectorAll('[role="menu"] button')].find((x) => x.textContent.trim() === arguments[0]); b?.click()`,
      label,
    )
    await sleep(350)
  }
  const box = await inside('[role="menu"]')
  assert.ok(box, "the menu is open")
  assert.ok(box.top >= 0 && box.bottom <= box.h + 1, `menu ${box.top}..${box.bottom} fits a ${box.h}px window`)
  await ctx.s.press("Escape")
}))
