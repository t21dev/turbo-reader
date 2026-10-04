// Global search (the Ctrl+K palette) and Settings > Storage.
import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { IDENTIFIER, launch, withShot } from "../lib/harness.mjs"
import { sleep } from "../lib/webdriver.mjs"

let ctx
const shot = (name, fn) => withShot(() => ctx, `storage-${name}`, fn)

before(async () => {
  ctx = await launch()
  for (const p of ["/rss.xml", "/teaser.xml"]) {
    await ctx.s.invoke("add_source", { url: ctx.url(p), groupId: null })
  }
  await ctx.reloadUi()
  await ctx.leaveHome()
  await ctx.view("list")
})
after(async () => {
  await ctx?.stop()
})

const paletteOpen = () => ctx.s.exec(`return !!document.getElementById('turbo-palette')`)
const options = () =>
  ctx.s.exec(`return [...document.querySelectorAll('#turbo-palette-list [role=option]')].map(o => o.textContent)`)

async function openPalette() {
  // a palette still playing its closing animation swallows the shortcut
  await ctx.s.waitFor(async () => !(await paletteOpen()), "the last palette to finish closing")
  await ctx.s.exec(`document.activeElement?.blur()`)
  await ctx.s.press("k", { ctrl: true })
  await ctx.s.waitFor(paletteOpen, "the search palette to open")
  await sleep(150)
}

async function search(text) {
  const input = await ctx.s.find("#turbo-palette")
  await input.click()
  await ctx.s.press("a", { ctrl: true })
  await ctx.s.press("Backspace")
  await ctx.s.type(text)
}

test("G1 Ctrl+K finds feeds by name and articles by a word still being typed", shot("G1", async () => {
  await openPalette()
  await search("teaser")
  await ctx.s.waitFor(async () => (await options()).some((o) => o.includes("Fixture Teasers")), "the feed by name")
  // "kuber" is half a word: the article says "kubernetes"
  await search("kuber")
  await ctx.s.waitFor(
    async () => (await options()).some((o) => o.includes("Bravo about kubernetes clusters")),
    "the article by a prefix",
  )
  // Enter opens the highlighted article
  await ctx.s.press("ArrowDown")
  await ctx.s.press("ArrowUp")
  const first = (await options())[0]
  assert.match(first, /Bravo about kubernetes clusters/)
  await ctx.s.press("Enter")
  await ctx.s.waitFor(async () => !(await paletteOpen()), "the palette to close")
  await ctx.s.waitFor(async () => (await ctx.readerTitle()) === "Bravo about kubernetes clusters", "the article open")
}))

test("G2 a feed opens its list; Esc closes; the title bar button opens it too", shot("G2", async () => {
  await (await ctx.s.byLabel("Search feeds and articles")).click()
  await ctx.s.waitFor(paletteOpen, "the palette from the title bar")
  await search("fixture rss")
  await ctx.s.waitFor(async () => (await options()).some((o) => o.includes("Fixture RSS")), "the feed")
  await ctx.s.press("Escape")
  await ctx.s.waitFor(async () => !(await paletteOpen()), "Esc to close it")

  await openPalette()
  await search("Fixture RSS")
  await ctx.s.waitFor(async () => (await options())[0]?.includes("Fixture RSS"), "the feed first")
  await ctx.s.press("Enter")
  await ctx.s.waitFor(
    async () => {
      const t = await ctx.pageText()
      return t.includes("Echo from ten days ago") && !t.includes("A teaser with a full page")
    },
    "only Fixture RSS in the list",
  )
}))

test("G3 the last row hands the words to the list search", shot("G3", async () => {
  await openPalette()
  await search("crypto")
  await ctx.s.waitFor(async () => (await options()).some((o) => o.includes("Show every article matching")), "the show-all row")
  await ctx.s.exec(`[...document.querySelectorAll('#turbo-palette-list [role=option]')].find(o => o.textContent.includes('Show every article')).click()`)
  await ctx.s.waitFor(() => ctx.s.exec(`return document.getElementById('turbo-search')?.value === 'crypto'`), "the list search filled")
  await ctx.s.waitFor(async () => {
    const t = await ctx.pageText()
    return t.includes("Delta about crypto prices") && !t.includes("Alpha arrives within the hour")
  }, "only the matching article")
  await ctx.s.exec(`const i = document.getElementById('turbo-search'); i.focus()`)
  await ctx.s.press("Escape")
  await ctx.s.waitFor(async () => !(await paletteOpen()), "the palette gone")
  await ctx.s.exec(`document.activeElement?.blur()`)
}))

/** Click a Storage row's button by its text, without scrolling under the sticky header. */
async function storageButton(rowId, text) {
  const ok = await ctx.s.waitFor(
    () => ctx.s.exec(
      `const [id, text] = arguments;
       const b = [...document.getElementById(id).closest('[role=group]').querySelectorAll('button')]
         .find(b => b.textContent.trim() === text && !b.disabled);
       if (b) b.click();
       return !!b`,
      rowId,
      text,
    ),
    `"${text}" in ${rowId}`,
  )
  assert.ok(ok)
}

const sizeOf = (id) => ctx.s.exec(`return document.getElementById('${id}')?.querySelector('[data-size]')?.textContent ?? null`)

test("S1 Storage measures the library and compacts it", shot("S1", async () => {
  await ctx.settings()
  await ctx.s.exec(`document.querySelector('[data-storage]').scrollIntoView()`)
  await ctx.s.waitFor(async () => /MB|KB/.test((await sizeOf("st-db")) ?? ""), "the database size")
  assert.match(await sizeOf("st-full"), /None/)
  await storageButton("st-db", "Compact")
  await ctx.waitText("Compacted.")
  await ctx.closeSettings()
}))

test("S2 a downloaded full article can be dropped back to the feed's text", shot("S2", async () => {
  await (await ctx.railOrFail("Fixture Teasers")).click()
  await ctx.open("A teaser with a full page")
  await ctx.tool("Load full content (f)")
  await ctx.waitText("FULL-BODY-MARKER")

  await ctx.settings()
  await ctx.s.waitFor(async () => /^1 article/.test((await sizeOf("st-full")) ?? ""), "one full article counted")
  await storageButton("st-full", "Remove")
  await ctx.confirmDialog()
  await ctx.waitText("1 article back to the feed's text.")
  assert.match(await sizeOf("st-full"), /None/)
  await ctx.closeSettings()

  await (await ctx.railOrFail("Fixture Teasers")).click()
  await ctx.open("A teaser with a full page")
  await ctx.waitText("Just the first line.")
  assert.ok(!(await ctx.pageText()).includes("FULL-BODY-MARKER"), "the download is gone")
}))

test("S3 deleted old read articles stay deleted after a refresh", shot("S3", async () => {
  const echo = (await ctx.s.invoke("list_items", { filter: { scope: "all", search: "Echo" } }))
    .find((i) => i.title === "Echo from ten days ago")
  assert.ok(echo, "precondition: the ten-day-old article")
  await ctx.s.invoke("set_read", { ids: [echo.id], read: true })

  const preview = await ctx.s.invoke("storage_old_read", { days: 5 })
  assert.equal(preview.count, 1, "only the read article older than five days")
  assert.equal(await ctx.s.invoke("storage_delete_old_read", { days: 5 }), 1)

  // The fixture feed still lists it. A refresh must not bring it back.
  await ctx.s.invoke("fetch_all")
  const titles = (await ctx.s.invoke("list_items", { filter: { scope: "all" } })).map((i) => i.title)
  assert.ok(!titles.includes("Echo from ten days ago"), "still deleted after a refresh")
  assert.ok(titles.includes("Charlie from two days ago"), "newer articles untouched")
}))

test("S4 clearing the webview cache waits for the next start, and can be cancelled", shot("S4", async () => {
  // WebDriver gives the webview a throwaway profile, so plant a cache where
  // the app looks for its own: the e2e identifier's local data folder.
  const cache = path.join(process.env.LOCALAPPDATA ?? "", IDENTIFIER, "EBWebView", "Default", "Cache")
  mkdirSync(cache, { recursive: true })
  writeFileSync(path.join(cache, "planted.bin"), Buffer.alloc(300 * 1024))

  await ctx.settings()
  await ctx.s.waitFor(async () => /KB|MB/.test((await sizeOf("st-webview")) ?? ""), "the planted cache measured")
  await storageButton("st-webview", "Clear")
  await ctx.s.waitFor(async () => (await sizeOf("st-webview")) === "Clears at next start", "booked")
  assert.ok(await ctx.s.byText("[data-storage] button", "Restart now"), "a restart offered")
  await storageButton("st-webview", "Cancel")
  await ctx.s.waitFor(async () => (await sizeOf("st-webview")) !== "Clears at next start", "cancelled")
  assert.equal((await ctx.s.invoke("storage_info")).webviewPending, false)

  // Book it again and start over: the folder goes before the window opens.
  await storageButton("st-webview", "Clear")
  await ctx.s.waitFor(async () => (await sizeOf("st-webview")) === "Clears at next start", "booked again")
  await ctx.stop()
  ctx = await launch({ keepData: true })
  assert.ok(!existsSync(path.join(cache, "planted.bin")), "the cache is gone after a restart")
  assert.equal((await ctx.s.invoke("storage_info")).webviewPending, false, "and no longer booked")
  const titles = (await ctx.s.invoke("list_items", { filter: { scope: "all" } })).map((i) => i.title)
  assert.ok(titles.includes("Alpha arrives within the hour"), "the library itself untouched")
}))
