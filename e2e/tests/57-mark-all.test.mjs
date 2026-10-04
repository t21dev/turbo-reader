// Mark all as read by age, and mark all as unread, from the card view's header.
import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { launch, withShot } from "../lib/harness.mjs"
import { sleep } from "../lib/webdriver.mjs"

let ctx
const shot = (name, fn) => withShot(() => ctx, `markall-${name}`, fn)

before(async () => {
  ctx = await launch()
  await ctx.s.invoke("add_source", { url: ctx.url("/rss.xml"), groupId: null })
  await ctx.reloadUi()
  await ctx.leaveHome()
  await ctx.view("cards")
})
after(async () => {
  await ctx?.stop()
})

const unread = async () => (await ctx.s.invoke("list_items", { filter: { scope: "all" } })).filter((i) => !i.read).map((i) => i.title)

async function menu(item) {
  await (await ctx.s.waitFor(() => ctx.s.byLabel("Mark all"), "the mark-all button")).click()
  const el = await ctx.s.waitFor(() => ctx.s.byText('[role="menu"] button', item), `"${item}" in the menu`)
  await el.click()
}

test("M1 the card view names the list and marks read by age, like Fluent Reader", shot("M1", async () => {
  await ctx.s.waitFor(
    () => ctx.s.exec(`return document.querySelector('[data-card-title]')?.textContent === 'All articles'`),
    "the card header",
  )
  assert.equal((await unread()).length, 5, "precondition: all five unread")
  // The fixture's articles are 1h, 5h, 2d, 4d and 10d old.
  await menu("1 day ago")
  await ctx.s.waitFor(() => ctx.s.exec(`return /Mark 3 articles as read/.test(document.body.innerText)`), "a count of three")
  await ctx.confirmDialog()
  await ctx.s.waitFor(async () => (await unread()).length === 2, "the three older ones read")
  assert.deepEqual((await unread()).sort(), ["Alpha arrives within the hour", "Bravo about kubernetes clusters"])
}))

test("M2 mark all as unread starts the list over, and asks first", shot("M2", async () => {
  await menu("Mark all as unread")
  await ctx.s.waitFor(() => ctx.s.exec(`return /Mark 3 articles as unread/.test(document.body.innerText)`), "a count of three")
  await ctx.confirmDialog()
  await ctx.s.waitFor(async () => (await unread()).length === 5, "everything unread again")

  // nothing read: it says so instead of asking
  await menu("Mark all as unread")
  await ctx.waitText("Nothing here is read yet.")
  await sleep(200)
}))
