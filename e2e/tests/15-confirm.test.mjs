// Every destructive action asks first, cancelling changes nothing, and the
// dialogs keep working however many times they are used. Also the regressions
// this suite was written to catch.
import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { launch, withShot } from "../lib/harness.mjs"
import { sleep } from "../lib/webdriver.mjs"

let ctx
const shot = (name, fn) => withShot(() => ctx, `confirm-${name}`, fn)

before(async () => {
  ctx = await launch()
  await ctx.s.invoke("add_source", { url: ctx.url("/rss.xml"), groupId: null })
  await ctx.s.invoke("create_group", { name: "Keep Me" })
  await ctx.reloadUi()
  await ctx.leaveHome()
  await ctx.view("list")
})
after(async () => {
  await ctx?.stop()
})

const dialogTitle = () =>
  ctx.s.waitFor(() => ctx.s.exec(`return document.getElementById('prompt-title')?.textContent ?? null`), "a confirmation")
const visibleIds = async () => (await ctx.items()).map((x) => x.id).sort()
const unread = async () => (await ctx.items()).filter((x) => !x.read).length

/* -------------------------------------------------------------------------- */

test("every destructive action asks, and cancelling changes nothing", shot("asks", async () => {
  // delete feed
  await ctx.railMenu("Fixture RSS", "Delete feed")
  assert.match(await dialogTitle(), /Delete Fixture RSS/)
  await ctx.cancelDialog()
  assert.ok(await ctx.source("Fixture RSS"), "feed kept")

  // delete folder
  await ctx.railMenu("Keep Me", "Delete folder")
  assert.match(await dialogTitle(), /Delete the folder Keep Me/)
  await ctx.cancelDialog()
  assert.ok((await ctx.groups()).some((g) => g.name === "Keep Me"), "folder kept")

  // hide, from the keyboard
  const ids = await visibleIds()
  await (await ctx.railOrFail("Fixture RSS")).click()
  await sleep(300)
  await ctx.open("Alpha arrives within the hour")
  await ctx.s.exec(`document.activeElement?.blur()`)
  await ctx.s.press("h")
  assert.match(await dialogTitle(), /Hide this article/)
  await ctx.cancelDialog()
  assert.deepEqual(await visibleIds(), ids, "nothing hidden")

  // mark all read
  const before = await unread()
  await ctx.tool("Mark all as read")
  await (await ctx.s.waitFor(() => ctx.s.byText('[role="menu"] button', "All articles"), "All articles")).click()
  assert.match(await dialogTitle(), /Mark \d+ articles? as read/)
  await ctx.cancelDialog()
  assert.equal(await unread(), before, "nothing marked read")

  // reset appearance
  await ctx.settings("Appearance")
  await ctx.s.exec(`document.querySelector('[role=dialog] button[title="Violet"]').click()`)
  await (await ctx.s.byLabel("Reset appearance")).click()
  assert.match(await dialogTitle(), /Reset appearance/)
  await ctx.cancelDialog()
  const accent = await ctx.s.exec(`return getComputedStyle(document.documentElement).getPropertyValue('--system').trim()`)
  assert.match(accent, /^262 /, "violet kept")
  await ctx.closeSettings()
}))

test("confirming each one does what it says", shot("confirms", async () => {
  await (await ctx.railOrFail("Fixture RSS")).click()
  await sleep(300)
  await ctx.open("Alpha arrives within the hour")
  await ctx.s.exec(`document.activeElement?.blur()`)
  await ctx.s.press("h")
  await dialogTitle()
  // Enter confirms, because the dialog focuses its own button
  await sleep(150)
  await ctx.s.press("Enter")
  await ctx.s.waitFor(async () => !(await ctx.items()).some((x) => x.title.startsWith("Alpha")), "Enter to hide it")

  await ctx.tool("Mark all as read")
  await (await ctx.s.waitFor(() => ctx.s.byText('[role="menu"] button', "All articles"), "All articles")).click()
  await dialogTitle()
  await ctx.confirmDialog()
  await ctx.s.waitFor(async () => (await unread()) === 0, "everything read")

  await ctx.tool("Mark all as read")
  await (await ctx.s.waitFor(() => ctx.s.byText('[role="menu"] button', "All articles"), "All articles")).click()
  await ctx.s.waitFor(async () => /Nothing here is unread/.test((await ctx.toast()) ?? ""), "no empty confirmation, a note instead")
  assert.equal(await ctx.s.exec(`return !!document.getElementById('prompt-title')`), false)
}))

test("dialogs keep working after the first one closes", shot("repeat", async () => {
  // This is the regression: the shared dialog used to stay in its closing
  // state after its first use, so the second opened invisible and its
  // transparent backdrop swallowed every click.
  for (let i = 1; i <= 4; i++) {
    await ctx.railMenu("Fixture RSS", "Rename")
    // It fades in, so give it its 220ms. The bug held it at 0 forever.
    await ctx.s.waitFor(
      async () => Number(await ctx.s.exec(`return getComputedStyle(document.querySelector('[role=dialog]')).opacity`)) > 0.95,
      `dialog ${i} to become fully visible`,
      { timeout: 2000 },
    )
    await ctx.cancelDialog()
  }
  // and the app still takes clicks afterwards
  await (await ctx.railOrFail("Starred")).click()
  await ctx.s.waitFor(() => ctx.s.exec(`return [...document.querySelectorAll('aside button')].find(b => b.textContent.includes('Starred'))?.className.includes('bg-elevated')`), "the click to land")
}))

test("a failed action says so instead of looking like success", shot("errors", async () => {
  // Delete the feed behind the interface's back, then try to move it.
  const src = await ctx.source("Fixture RSS")
  const gid = (await ctx.groups()).find((g) => g.name === "Keep Me").id
  await ctx.s.invoke("delete_source", { id: src.id })
  void gid
  await ctx.railMenu("Fixture RSS", "Move to")
  await (await ctx.s.waitFor(() => ctx.s.byText('[role="menu"] button', "Keep Me"), "the folder")).click()
  // Wait for this error specifically: an earlier note may still be showing.
  await ctx.s.waitFor(
    () => ctx.s.exec(`return [...document.querySelectorAll('[data-toast="error"]')]
                        .some(t => /Moving the feed failed: That feed no longer exists/.test(t.textContent))`),
    "the error to be reported",
  )
}))

test("shortcuts do not act on the article behind an open dialog", shot("leak", async () => {
  await ctx.s.invoke("add_source", { url: ctx.url("/rss.xml"), groupId: null })
  await ctx.reloadUi()
  await ctx.leaveHome()
  await (await ctx.railOrFail("Fixture RSS")).click()
  await sleep(300)
  await ctx.open("Bravo about kubernetes clusters")
  await ctx.s.exec(`document.activeElement?.blur()`)
  await ctx.s.press("h")
  await dialogTitle()
  await ctx.s.press("j")
  await ctx.s.press("s")
  await sleep(300)
  assert.equal(await ctx.readerTitle(), "Bravo about kubernetes clusters", "j did not move behind the dialog")
  const bravo = (await ctx.items()).find((x) => x.title.startsWith("Bravo"))
  assert.equal(bravo.starred, false, "s did not star behind the dialog")
  await ctx.cancelDialog()
}))
