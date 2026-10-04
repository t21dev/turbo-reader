// A fresh install: the welcome screen, its starters, and getting past it.
import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { launch, withShot } from "../lib/harness.mjs"
import { sleep } from "../lib/webdriver.mjs"

let ctx
const shot = (name, fn) => withShot(() => ctx, `welcome-${name}`, fn)

before(async () => {
  ctx = await launch()
})
after(async () => {
  await ctx?.stop()
})

const heading = () =>
  ctx.s.exec(`return [...document.querySelectorAll('h1')].some(h => h.textContent.trim() === 'Welcome to Turbo Reader')`)

test("W1 a fresh install opens on the welcome screen, not an empty page", shot("W1", async () => {
  await ctx.s.waitFor(heading, "the welcome heading")
  const text = await ctx.pageText()
  assert.ok(text.includes("Add a feed"), "add a feed is offered")
  assert.ok(text.includes("Import an OPML file"), "import is offered")
  assert.ok(!text.includes("Nothing published in this window"), "not the empty home page")
}))

test("W2 choosing starters updates the subscribe button", shot("W2", async () => {
  const button = () => ctx.s.exec(`return [...document.querySelectorAll('button')].find(b => /^(Choose feeds above|Subscribe to)/.test(b.textContent.trim()))?.textContent.trim()`)
  assert.equal(await button(), "Choose feeds above")
  const pick = (name) => ctx.s.exec(`[...document.querySelectorAll('[role=checkbox]')].find(b => b.textContent.includes(arguments[0])).click()`, name)
  await pick("Hacker News")
  await pick("xkcd")
  await ctx.s.waitFor(async () => (await button()) === "Subscribe to 2 feeds", "two picked")
  await pick("xkcd")
  await ctx.s.waitFor(async () => (await button()) === "Subscribe to 1 feed", "one picked")
  const checked = await ctx.s.exec(`return [...document.querySelectorAll('[role=checkbox][aria-checked=true]')].map(b => b.textContent)`)
  assert.equal(checked.length, 1)
  await pick("Hacker News")
}))

test("W3 adding a feed from the welcome screen leaves it for the library", shot("W3", async () => {
  await (await ctx.s.byText("section button", "Add a feed")).click()
  const field = await ctx.s.waitFor(
    () => ctx.s.exec(`return document.querySelector('[aria-label="Feed or site address"]')`),
    "the add feed dialog",
  )
  await ctx.s.waitFor(() => ctx.s.exec(`return document.activeElement === arguments[0]`, field), "focus")
  await ctx.s.type(ctx.url("/rss.xml"))
  await (await ctx.s.byText("[role=dialog] button", "Check")).click()
  await ctx.s.waitFor(() => ctx.s.exec(`return !!document.querySelector('[data-add-preview]')`), "the preview")
  await (await ctx.s.byText("[role=dialog] button", "Add feed")).click()
  await ctx.s.waitFor(async () => !(await heading()), "the welcome screen to give way")
  await sleep(300)
  assert.ok((await ctx.sources()).length === 1, "subscribed")
  assert.ok((await ctx.pageText()).includes("Fixture RSS"), "the feed is in the sidebar")
}))
