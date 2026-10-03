// Proves the harness itself works before anything else trusts it.
import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { launch } from "../lib/harness.mjs"

let ctx

before(async () => {
  ctx = await launch()
})
after(async () => {
  await ctx?.stop()
})

test("the app starts against an empty, isolated database", async () => {
  assert.deepEqual(await ctx.sources(), [])
  assert.deepEqual(await ctx.groups(), [])
  const text = await ctx.pageText()
  assert.match(text, /Turbo Reader/)
})

test("the real IPC round-trips through the page", async () => {
  const stats = await ctx.stats()
  assert.equal(stats.sources, 0)
  assert.equal(stats.items, 0)
})

test("the fixture server is reachable from the backend", async () => {
  const id = await ctx.s.invoke("add_source", { url: ctx.url("/rss.xml"), groupId: null })
  assert.ok(id > 0)
  const items = await ctx.items()
  assert.equal(items.length, 5)
})
