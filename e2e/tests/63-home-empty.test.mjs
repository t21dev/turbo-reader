// Home on a new day: empty while the first refresh runs, then honest about it.
import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { launch, withShot } from "../lib/harness.mjs"

let ctx
const shot = (name, fn) => withShot(() => ctx, `home-empty-${name}`, fn)

before(async () => {
  ctx = await launch()
  // Only last month's story, so Today has nothing in it.
  await ctx.s.invoke("add_source", { url: ctx.url("/old.xml"), groupId: null })
  await ctx.reloadUi()
})
after(async () => {
  await ctx?.stop()
})

const skeleton = () => ctx.s.exec(`return !!document.querySelector('[data-home-skeleton]')`)
const emptyText = () => ctx.s.exec(`return document.querySelector('[data-home-empty]')?.textContent ?? null`)
const emit = (event) =>
  ctx.s.exec(`return window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: arguments[0], payload: null })`, event)

test("H1 an empty Today says so, naming the window", shot("H1", async () => {
  await ctx.s.waitFor(async () => /Nothing published today yet/.test((await emptyText()) ?? ""), "the empty message")
  assert.equal(await skeleton(), false, "no skeleton when nothing is loading")
}))

test("H2 while a refresh runs, an empty Home shows placeholder cards instead", shot("H2", async () => {
  await emit("refresh-started")
  await ctx.s.waitFor(skeleton, "the skeleton during the refresh")
  assert.equal(await emptyText(), null, "and not the empty message, which may be about to be wrong")
  await emit("feeds-updated")
  await ctx.s.waitFor(async () => !(await skeleton()), "the skeleton to go once the refresh lands")
  await ctx.s.waitFor(async () => /Nothing published today yet/.test((await emptyText()) ?? ""), "the empty message after it")
}))

test("H3 a pinned feed above an empty Today does not hide the empty message or the skeleton", shot("H3", async () => {
  const [src] = await ctx.s.invoke("list_sources")
  await ctx.s.invoke("set_pinned", { id: src.id, pinned: true })
  await ctx.reloadUi()
  await ctx.s.waitFor(() => ctx.s.byText("section h2", "Pinned"), "the pinned section")
  await ctx.s.waitFor(async () => /Nothing published today yet/.test((await emptyText()) ?? ""), "the empty message under the pins")
  await emit("refresh-started")
  await ctx.s.waitFor(skeleton, "the skeleton under the pins during a refresh")
  await emit("feeds-updated")
  await ctx.s.waitFor(async () => /Nothing published today yet/.test((await emptyText()) ?? ""), "the empty message after it")
}))
