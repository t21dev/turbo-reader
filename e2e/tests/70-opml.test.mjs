// G. OPML: export, import through the real Settings buttons (with the native
// dialog answered by the test), imported feeds filled without a refresh, and a
// full round trip.
import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, rmSync, writeFileSync, existsSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { launch, withShot } from "../lib/harness.mjs"
import { sleep } from "../lib/webdriver.mjs"

let ctx
const shot = (name, fn) => withShot(() => ctx, `opml-${name}`, fn)
const tmp = (name) => path.join(os.tmpdir(), `turbo-e2e-${process.pid}-${name}`)

before(async () => {
  ctx = await launch()
  const gid = await ctx.s.invoke("create_group", { name: "Reading" })
  await ctx.s.invoke("add_source", { url: ctx.url("/rss.xml"), groupId: gid })
  await ctx.s.invoke("add_source", { url: ctx.url("/atom.xml"), groupId: null })
  await ctx.reloadUi()
})
after(async () => {
  await ctx?.stop()
})

const clickSetting = async (label) => {
  const b = await ctx.s.waitFor(() => ctx.s.byText("[role=dialog] button", label), `"${label}"`)
  await b.click()
}

/* -------------------------------------------------------------------------- */

test("G1 export lists every feed in its folder", shot("G1", async () => {
  const out = tmp("export.opml")
  rmSync(out, { force: true })
  await ctx.settings()
  await ctx.trap("plugin:dialog|save", out)
  await clickSetting("Export OPML")
  await ctx.s.waitFor(() => existsSync(out), "the file")
  const xml = readFileSync(out, "utf8")
  assert.match(xml, /<opml/)
  assert.match(xml, /<outline[^>]*text="Reading"[^>]*>[\s\S]*rss\.xml[\s\S]*<\/outline>/, "the feed inside its folder")
  assert.ok(xml.includes(ctx.url("/atom.xml")), "the ungrouped feed")
  await ctx.closeSettings()
}))

test("G2 import adds new feeds and folders and skips existing ones", shot("G2", async () => {
  const file = tmp("import.opml")
  writeFileSync(file, `<?xml version="1.0"?><opml version="2.0"><body>
    <outline text="Video">
      <outline text="Channel" type="rss" xmlUrl="${ctx.url("/youtube.xml")}"/>
    </outline>
    <outline text="Reading">
      <outline text="Fixture RSS" type="rss" xmlUrl="${ctx.url("/rss.xml")}"/>
      <outline text="Teasers" type="rss" xmlUrl="${ctx.url("/teaser.xml")}"/>
    </outline>
  </body></opml>`)
  await ctx.settings()
  await ctx.trap("plugin:dialog|open", file)
  await clickSetting("Import OPML")
  await ctx.s.waitFor(async () => /Imported 2 feeds/.test(await ctx.pageText()), "the import summary")
  const groups = (await ctx.groups()).map((g) => g.name)
  assert.ok(groups.includes("Video"), "new folder created")
  assert.equal(groups.filter((g) => g === "Reading").length, 1, "existing folder reused")
  assert.equal((await ctx.sources()).filter((s) => s.url === ctx.url("/rss.xml")).length, 1, "no duplicate feed")
  await ctx.closeSettings()
  rmSync(file, { force: true })
}))

test("G3 imported feeds have articles without a manual refresh", shot("G3", async () => {
  await ctx.s.waitFor(async () => {
    const yt = (await ctx.sources()).find((s) => s.url === ctx.url("/youtube.xml"))
    return yt && (await ctx.items({ scope: "source", id: yt.id })).length > 0
  }, "the imported channel to have its video", { timeout: 15000 })
}))

test("G4 export, wipe, import gives back the same structure", shot("G4", async () => {
  const shape = async () => {
    const groups = await ctx.groups()
    const name = (id) => groups.find((g) => g.id === id)?.name ?? null
    return (await ctx.sources()).map((s) => `${name(s.groupId)}|${s.url}`).sort()
  }
  const before = await shape()
  const xml = await ctx.s.invoke("export_opml")
  for (const s of await ctx.sources()) await ctx.s.invoke("delete_source", { id: s.id })
  for (const g of await ctx.groups()) await ctx.s.invoke("delete_group", { id: g.id })
  assert.deepEqual(await ctx.sources(), [], "wiped")
  await ctx.s.invoke("import_opml", { xml })
  assert.deepEqual(await shape(), before, "same feeds in the same folders")
  await sleep(100)
}))
