// A. Feeds and folders: the Add Feed dialog with its Check step, renaming,
// pinning, moving, retention, copying, opening, deleting, and every way of
// managing folders. Each test sets up what it needs, so one failure cannot
// cascade into the rest.
import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { launch, withShot } from "../lib/harness.mjs"
import { sleep } from "../lib/webdriver.mjs"

let ctx
const shot = (name, fn) => withShot(() => ctx, `feeds-${name}`, fn)

before(async () => {
  ctx = await launch()
})
after(async () => {
  await ctx?.stop()
})

const RSS = ["/rss.xml", "Fixture RSS"]
const menuItem = (text) =>
  ctx.s.waitFor(() => ctx.s.byText('[role="menu"] button', text), `"${text}" in the menu`)

/* ------------------------------ adding a feed ------------------------------ */

test("A1 add a feed through Check and Add", shot("A1", async () => {
  const r = await ctx.addFeed(ctx.url("/rss.xml"))
  assert.deepEqual(r, { added: true })
  await ctx.railOrFail("Fixture RSS")
  const src = await ctx.source("Fixture RSS")
  assert.equal((await ctx.items({ scope: "source", id: src.id })).length, 5, "all five articles stored")
  assert.match((await ctx.toast()) ?? "", /Subscribed to Fixture RSS/)
}))

test("A1b Check previews before anything is saved", shot("A1b", async () => {
  const before = (await ctx.sources()).length
  const r = await ctx.addFeed(ctx.url("/atom.xml"), { keepOpen: true })
  assert.deepEqual(r, { preview: true })
  const text = await ctx.s.exec(`return document.querySelector('[data-add-preview]').textContent`)
  assert.match(text, /Fixture Atom/, "the feed's name")
  assert.match(text, /2 articles/, "how many it has")
  assert.match(text, /Atom one/, "its latest titles")
  assert.equal((await ctx.sources()).length, before, "nothing saved yet")
  await ctx.cancelDialog()
  assert.equal((await ctx.sources()).length, before, "and still nothing after cancelling")
}))

test("A2 a bad address explains itself and adds nothing", shot("A2", async () => {
  const before = (await ctx.sources()).length
  const r = await ctx.addFeed(ctx.url("/does-not-exist.xml"))
  assert.match(r.error, /404|nothing at that address/i, r.error)
  const r2 = await ctx.addFeed("http://127.0.0.1:1/feed")
  assert.match(r2.error, /Could not reach/i, r2.error)
  assert.equal((await ctx.sources()).length, before)
}))

test("A3 a site address finds the feed the page advertises", shot("A3", async () => {
  const existing = await ctx.source("Fixture RSS")
  if (existing) {
    await ctx.s.invoke("delete_source", { id: existing.id })
    await ctx.reloadUi()
  }
  const r = await ctx.addFeed(ctx.url("/site.html"))
  assert.deepEqual(r, { added: true })
  const src = await ctx.source("Fixture RSS")
  assert.equal(src.url, ctx.url("/rss.xml"), "subscribed to the feed, not the page")
}))

test("A4 an address without https:// still works", shot("A4", async () => {
  const atom = await ctx.source("Fixture Atom")
  if (atom) await ctx.s.invoke("delete_source", { id: atom.id })
  await ctx.reloadUi()
  const r = await ctx.addFeed(ctx.url("/atom.xml").replace(/^https?:\/\//, ""))
  assert.deepEqual(r, { added: true })
  assert.ok(await ctx.source("Fixture Atom"))
}))

test("A5 an address already subscribed is recognised, and its name kept", shot("A5", async () => {
  const src = await ctx.ensure(...RSS)
  await ctx.s.invoke("update_source", { id: src.id, name: "My Own Name" })
  await ctx.reloadUi()
  const r = await ctx.addFeed(ctx.url("/rss.xml"))
  assert.deepEqual(r, { existing: true })
  const rows = (await ctx.sources()).filter((s) => s.url === ctx.url("/rss.xml"))
  assert.equal(rows.length, 1, "no duplicate row")
  assert.equal(rows[0].name, "My Own Name", "the chosen name survives")
  // the backend refuses too, not just the dialog
  const direct = await ctx.s.invokeResult("add_source", { url: ctx.url("/rss.xml"), groupId: null })
  assert.match(direct.err ?? "", /Already subscribed as "My Own Name"/)
  await ctx.s.invoke("update_source", { id: src.id, name: "Fixture RSS" })
  await ctx.reloadUi()
}))

test("A6 n opens the dialog with the field focused, Escape closes it", shot("A6", async () => {
  await ctx.s.exec(`document.activeElement?.blur()`)
  await ctx.s.press("n")
  await ctx.s.waitFor(
    () => ctx.s.exec(`return document.activeElement?.getAttribute('aria-label') === 'Feed or site address'`),
    "n to open the dialog with focus in the field",
  )
  await ctx.cancelDialog()
}))

test("A6b adding into a chosen folder", shot("A6b", async () => {
  const gid = await ctx.s.invoke("create_group", { name: "Picked" })
  await ctx.reloadUi()
  await ctx.addFeed(ctx.url("/feed.json"), { folder: "Picked" })
  assert.equal((await ctx.source("Fixture JSON")).groupId, gid)
}))

/* ---------------------------- managing a feed ----------------------------- */

test("A7 rename a feed", shot("A7", async () => {
  await ctx.ensure(...RSS)
  await ctx.railMenu("Fixture RSS", "Rename")
  await ctx.prompt("Renamed Feed")
  await ctx.railOrFail("Renamed Feed")
  assert.ok(await ctx.source("Renamed Feed"), "saved")
  await ctx.railMenu("Renamed Feed", "Rename")
  await ctx.prompt("Fixture RSS")
  await ctx.railOrFail("Fixture RSS")
}))

test("A8 pin and unpin a feed", shot("A8", async () => {
  await ctx.ensure(...RSS)
  await ctx.railMenu("Fixture RSS", "Pin to home")
  await ctx.s.waitFor(async () => (await ctx.source("Fixture RSS")).pinned, "pinned in the database")
  await ctx.railMenu("Fixture RSS", "Unpin from home")
  await ctx.s.waitFor(async () => !(await ctx.source("Fixture RSS")).pinned, "unpinned in the database")
}))

test("A9 move a feed into a folder and back out", shot("A9", async () => {
  await ctx.ensure(...RSS)
  const gid = await ctx.s.invoke("create_group", { name: "Tech" })
  await ctx.reloadUi()
  await ctx.railMenu("Fixture RSS", "Move to")
  await ctx.clickMenu("Tech")
  await ctx.s.waitFor(async () => (await ctx.source("Fixture RSS")).groupId === gid, "the feed to be in Tech")
  await ctx.railMenu("Fixture RSS", "Move to")
  await ctx.clickMenu("No folder")
  await ctx.s.waitFor(async () => (await ctx.source("Fixture RSS")).groupId === null, "the feed out of the folder")
}))

test("A10 a retention limit that removes nothing applies straight away", shot("A10", async () => {
  await ctx.ensure(...RSS)
  await ctx.railMenu("Fixture RSS", "Keep")
  await ctx.clickMenu("Last 50")
  await ctx.s.waitFor(async () => (await ctx.source("Fixture RSS")).keepLimit === 50, "the limit saved")
  assert.equal(await ctx.s.exec(`return !!document.querySelector('[role=dialog]')`), false, "no confirmation needed")
}))

test("A10b a retention limit that removes articles asks first, and keeps starred", shot("A10b", async () => {
  const src = await ctx.ensure("/big.xml", "Big Feed")
  const oldest = (await ctx.items({ scope: "source", id: src.id, sort: "oldest" }))[0]
  await ctx.s.invoke("set_starred", { id: oldest.id, starred: true })

  await ctx.railMenu("Big Feed", "Keep")
  await ctx.clickMenu("Last 50")
  const title = await ctx.s.waitFor(() => ctx.s.exec(`return document.getElementById('prompt-title')?.textContent ?? null`), "a confirmation")
  assert.match(title, /Keep only the last 50/)
  assert.match(await ctx.pageText(), /removes 9 older articles/, "says how many go, starred excluded")
  await ctx.cancelDialog()
  assert.equal((await ctx.items({ scope: "source", id: src.id })).length, 60, "cancelling changed nothing")

  await ctx.railMenu("Big Feed", "Keep")
  await ctx.clickMenu("Last 50")
  await ctx.confirmDialog()
  await ctx.s.waitFor(async () => (await ctx.items({ scope: "source", id: src.id })).length === 51, "50 kept plus the starred one")
  assert.ok((await ctx.items({ scope: "source", id: src.id })).some((x) => x.id === oldest.id), "the starred one survived")
}))

test("A11 copy a feed's URL", shot("A11", async () => {
  await ctx.ensure(...RSS)
  await ctx.railMenu("Fixture RSS", "Copy feed URL")
  await sleep(400)
  assert.equal(ctx.clipboard(), ctx.url("/rss.xml"))
}))

test("A12 open a feed's website", shot("A12", async () => {
  await ctx.ensure(...RSS)
  await ctx.trap("plugin:opener|open_url", null)
  await ctx.railMenu("Fixture RSS", "Open website")
  const calls = await ctx.s.waitFor(async () => {
    const c = await ctx.trapped("plugin:opener|open_url")
    return c.length ? c : null
  }, "the website to be opened")
  assert.equal(calls[0].url, ctx.url("/"))
}))

test("A13 delete the feed you are looking at", shot("A13", async () => {
  await ctx.ensure(...RSS)
  await ctx.ensure("/feed.json", "Fixture JSON")
  await (await ctx.railOrFail("Fixture JSON")).click()
  await sleep(300)
  await ctx.railMenu("Fixture JSON", "Delete feed")
  assert.match(await ctx.s.exec(`return document.getElementById('prompt-title').textContent`), /Delete Fixture JSON/)
  await ctx.confirmDialog()
  await ctx.s.waitFor(async () => !(await ctx.source("Fixture JSON")), "the feed to be deleted")
  assert.equal(await ctx.rail("Fixture JSON"), null, "gone from the sidebar")
  assert.equal((await ctx.items()).filter((x) => x.sourceName === "Fixture JSON").length, 0, "its articles went")
  await ctx.waitText("Alpha arrives within the hour", "the view to fall back to all articles")
}))

/* --------------------------------- folders -------------------------------- */

test("A14 new folders from the button, a folder menu and empty rail", shot("A14", async () => {
  await (await ctx.s.waitFor(() => ctx.s.byLabel("New folder"), "the new folder button")).click()
  await ctx.prompt("From Button")
  await ctx.railOrFail("From Button")

  await ctx.railMenu("From Button", "New folder")
  await ctx.prompt("From Folder Menu")
  await ctx.railOrFail("From Folder Menu")

  const rail = await ctx.s.find("aside div.overflow-y-auto")
  const h = await ctx.s.exec(`return arguments[0].getBoundingClientRect().height`, rail)
  await ctx.s.cmd("POST", "/actions", {
    actions: [{
      type: "pointer", id: "mouse", parameters: { pointerType: "mouse" },
      actions: [
        { type: "pointerMove", duration: 0, origin: { "element-6066-11e4-a52e-4f735466cecf": rail.id }, x: 0, y: Math.floor(h / 2) - 8 },
        { type: "pointerDown", button: 2 }, { type: "pointerUp", button: 2 },
      ],
    }],
  })
  await ctx.s.cmd("DELETE", "/actions")
  await ctx.clickMenu("New folder")
  await ctx.prompt("From Empty Rail")
  await ctx.railOrFail("From Empty Rail")

  const names = (await ctx.groups()).map((g) => g.name)
  for (const n of ["From Button", "From Folder Menu", "From Empty Rail"]) assert.ok(names.includes(n), n)
}))

test("A15 rename a folder", shot("A15", async () => {
  await ctx.s.invoke("create_group", { name: "Folder To Rename" })
  await ctx.reloadUi()
  await ctx.railMenu("Folder To Rename", "Rename folder")
  await ctx.prompt("Renamed Folder")
  await ctx.railOrFail("Renamed Folder")
  assert.ok((await ctx.groups()).some((g) => g.name === "Renamed Folder"))
}))

test("A16 deleting a folder keeps its feeds", shot("A16", async () => {
  const gid = await ctx.s.invoke("create_group", { name: "Doomed Folder" })
  const src = await ctx.ensure("/atom.xml", "Fixture Atom")
  await ctx.s.invoke("move_source", { id: src.id, groupId: gid })
  await ctx.reloadUi()
  assert.equal((await ctx.source("Fixture Atom")).groupId, gid, "precondition: feed is in the folder")

  await ctx.railMenu("Doomed Folder", "Delete folder")
  await ctx.confirmDialog()
  await ctx.s.waitFor(async () => !(await ctx.groups()).some((x) => x.id === gid), "the folder gone")
  const after = await ctx.source("Fixture Atom")
  assert.ok(after, "the feed survived")
  assert.equal(after.groupId, null, "and sits outside any folder")
  assert.ok((await ctx.items({ scope: "source", id: after.id })).length > 0, "with its articles")
}))

test("A17 a collapsed folder stays collapsed after a restart", shot("A17", async () => {
  const gid = await ctx.s.invoke("create_group", { name: "Collapsible" })
  await ctx.reloadUi()
  await (await ctx.railOrFail("Collapsible")).click()
  await ctx.s.waitFor(async () => !(await ctx.groups()).find((x) => x.id === gid).expanded, "collapsed")
  ctx = await ctx.restart()
  assert.equal((await ctx.groups()).find((x) => x.id === gid).expanded, false, "still collapsed")
}))

test("A18 alphabetical order applies to feeds and folders", shot("A18", async () => {
  for (const p of ["/grow.xml", "/dupe-b.xml", "/etag.xml"]) {
    await ctx.s.invoke("add_source", { url: ctx.url(p), groupId: null }).catch(() => undefined)
  }
  await ctx.s.invoke("create_group", { name: "Zulu Folder" })
  await ctx.s.invoke("create_group", { name: "Alpha Folder" })
  await ctx.reloadUi()

  const sorted = (xs) => [...xs].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
  const manual = (await ctx.sources()).map((s) => s.name)
  assert.notDeepEqual(manual, sorted(manual), "precondition: the manual order is not alphabetical")

  await ctx.settings()
  await (await ctx.s.waitFor(() => ctx.s.byText("[role=dialog] button", "Alphabetical"), "the order setting")).click()
  await ctx.closeSettings()
  await sleep(500)

  const names = (await ctx.sources()).map((s) => s.name)
  assert.deepEqual(names, sorted(names), "feeds come back alphabetical")
  const folders = (await ctx.groups()).map((g) => g.name)
  assert.deepEqual(folders, sorted(folders), "folders come back alphabetical")
  const rail = await ctx.s.exec(`return [...document.querySelectorAll('aside button span.truncate')].map(s => s.textContent)`)
  const shownFolders = rail.filter((t) => folders.includes(t))
  assert.deepEqual(shownFolders, sorted(shownFolders), "the rail shows folders in that order")
}))
