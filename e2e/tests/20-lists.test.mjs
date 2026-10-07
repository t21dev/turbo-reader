// B. Lists and navigation: scopes, views, read state, stars, hiding, mark all
// read, search, toggles, scroll position and duplicate collapsing.
import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { launch, withShot } from "../lib/harness.mjs"
import { sleep } from "../lib/webdriver.mjs"

let ctx
const shot = (name, fn) => withShot(() => ctx, `lists-${name}`, fn)

before(async () => {
  ctx = await launch()
  await ctx.s.invoke("add_source", { url: ctx.url("/rss.xml"), groupId: null })
  const gid = await ctx.s.invoke("create_group", { name: "Folder" })
  await ctx.s.invoke("add_source", { url: ctx.url("/atom.xml"), groupId: gid })
  await ctx.reloadUi()
})
after(async () => {
  await ctx?.stop()
})

const rssId = async () => (await ctx.source("Fixture RSS")).id
const totalUnread = async () => (await ctx.sources()).reduce((n, s) => n + s.unread, 0)
const railCount = (label) =>
  ctx.s.exec(
    `const b = [...document.querySelectorAll('aside button')].find(b => b.textContent.includes(arguments[0]));
     const n = b && [...b.querySelectorAll('span')].map(s => s.textContent.trim()).find(t => /^\\d+$/.test(t));
     return n ? Number(n) : 0`,
    label,
  )

/* -------------------------------------------------------------------------- */

test("B1 each scope lists the right articles", shot("B1", async () => {
  await ctx.leaveHome()
  await ctx.view("list")

  await (await ctx.railOrFail("All articles")).click()
  await ctx.s.waitFor(async () => (await ctx.titles()).length === 7, "all seven articles")

  await (await ctx.railOrFail("Fixture RSS")).click()
  await ctx.s.waitFor(async () => (await ctx.titles()).length === 5, "the feed's five")

  await (await ctx.railOrFail("Folder")).click()
  await ctx.s.waitFor(async () => {
    const t = await ctx.titles()
    return t.length === 2 && t.every((x) => x.startsWith("Atom"))
  }, "the folder's two")

  const first = (await ctx.items({ scope: "source", id: await rssId() }))[0]
  await ctx.s.invoke("set_starred", { id: first.id, starred: true })
  await (await ctx.railOrFail("Starred")).click()
  await ctx.s.waitFor(async () => {
    const t = await ctx.titles()
    return t.length === 1 && t[0] === first.title
  }, "only the starred one")
  await ctx.s.invoke("set_starred", { id: first.id, starred: false })
}))

test("B2 the chosen view survives a restart", shot("B2", async () => {
  await ctx.leaveHome()
  await ctx.view("list")
  await ctx.reloadAndCheck()
  await ctx.leaveHome()
  assert.ok(await ctx.s.exec(`return !!document.getElementById('turbo-search')`), "still in list view after reopening")
}))

test("B3 opening an article marks it read everywhere", shot("B3", async () => {
  await ctx.leaveHome()
  await ctx.view("list")
  await (await ctx.railOrFail("Fixture RSS")).click()
  await sleep(300)
  const beforeRail = await railCount("Fixture RSS")
  const beforeTotal = await totalUnread()

  await ctx.open("Echo from ten days ago")
  const item = (await ctx.items({ scope: "source", id: await rssId() })).find((x) => x.title.startsWith("Echo"))
  assert.equal(item.read, true, "read in the database")
  await ctx.s.waitFor(async () => (await railCount("Fixture RSS")) === beforeRail - 1, "the rail count to drop")
  assert.equal(await totalUnread(), beforeTotal - 1)
}))

test("B4 j and k move through the list", shot("B4", async () => {
  await ctx.leaveHome()
  await ctx.view("list")
  await (await ctx.railOrFail("Fixture RSS")).click()
  await sleep(300)
  const titles = await ctx.titles()
  await ctx.s.exec(`document.activeElement?.blur()`)
  await ctx.s.press("j")
  await ctx.s.waitFor(async () => (await ctx.readerTitle()) === titles[0], "j to open the first")
  await ctx.s.press("j")
  await ctx.s.waitFor(async () => (await ctx.readerTitle()) === titles[1], "j to move to the second")
  await ctx.s.press("k")
  await ctx.s.waitFor(async () => (await ctx.readerTitle()) === titles[0], "k to move back")
}))

test("B5 star from a list row, a card, the reader and s", shot("B5", async () => {
  await ctx.leaveHome()
  const starred = async (title) =>
    (await ctx.items({ scope: "source", id: await rssId() })).find((x) => x.title === title).starred

  // list row, through its hover button
  await ctx.view("list")
  await (await ctx.railOrFail("Fixture RSS")).click()
  await sleep(300)
  const row = await ctx.s.byText("article", "Charlie from two days ago")
  const star = await ctx.s.exec(`return arguments[0].querySelector('button[title="Star"],button[title="Unstar"]')`, row)
  await ctx.s.exec(`arguments[0].click()`, star)
  await ctx.s.waitFor(() => starred("Charlie from two days ago"), "starred from the list")

  // reader button, then the s key
  await ctx.open("Delta about crypto prices")
  await ctx.tool("Star (s)")
  await ctx.s.waitFor(() => starred("Delta about crypto prices"), "starred from the reader")
  await ctx.s.exec(`document.activeElement?.blur()`)
  await ctx.s.press("s")
  await ctx.s.waitFor(async () => !(await starred("Delta about crypto prices")), "unstarred with s")

  // a card
  await ctx.view("cards")
  await (await ctx.railOrFail("Fixture RSS")).click()
  await sleep(300)
  const card = await ctx.s.byText("article", "Bravo about kubernetes clusters")
  const cstar = await ctx.s.exec(`return arguments[0].querySelector('button[title="Star"],button[title="Unstar"]')`, card)
  await ctx.s.exec(`arguments[0].click()`, cstar)
  await ctx.s.waitFor(() => starred("Bravo about kubernetes clusters"), "starred from a card")
}))

test("B6 mark read and unread from the reader and with m", shot("B6", async () => {
  await ctx.leaveHome()
  await ctx.view("list")
  await (await ctx.railOrFail("Fixture RSS")).click()
  await sleep(300)
  const read = async (title) =>
    (await ctx.items({ scope: "source", id: await rssId() })).find((x) => x.title === title).read

  await ctx.open("Alpha arrives within the hour")
  assert.equal(await read("Alpha arrives within the hour"), true)
  await ctx.tool("Mark as unread (m)")
  await ctx.s.waitFor(async () => !(await read("Alpha arrives within the hour")), "unread from the button")
  await ctx.s.exec(`document.activeElement?.blur()`)
  await ctx.s.press("m")
  await ctx.s.waitFor(() => read("Alpha arrives within the hour"), "read again with m")
}))

test("B7 hide from a row, a card, the reader menu and h", shot("B7", async () => {
  await ctx.leaveHome()
  const visible = async (title) => (await ctx.items()).some((x) => x.title === title)

  await ctx.view("list")
  await (await ctx.railOrFail("Fixture RSS")).click()
  await sleep(300)
  const row = await ctx.s.byText("article", "Echo from ten days ago")
  const hide = await ctx.s.exec(`return arguments[0].querySelector('button[title="Hide article"]')`, row)
  await ctx.s.exec(`arguments[0].click()`, hide)
  await ctx.confirmDialog()
  await ctx.s.waitFor(async () => !(await visible("Echo from ten days ago")), "hidden from a row")
  await ctx.s.waitFor(async () => !(await ctx.titles()).includes("Echo from ten days ago"), "gone from the list")

  await ctx.open("Charlie from two days ago")
  await ctx.more("Hide article")
  await ctx.confirmDialog()
  await ctx.s.waitFor(async () => !(await visible("Charlie from two days ago")), "hidden from the menu")
  assert.equal(await ctx.readerTitle(), null, "the reader closes on a hidden article")

  await ctx.open("Delta about crypto prices")
  await ctx.s.exec(`document.activeElement?.blur()`)
  await ctx.s.press("h")
  await ctx.confirmDialog()
  await ctx.s.waitFor(async () => !(await visible("Delta about crypto prices")), "hidden with h")

  await ctx.view("cards")
  await (await ctx.railOrFail("Folder")).click()
  await sleep(300)
  const card = await ctx.s.byText("article", "Atom two")
  const chide = await ctx.s.exec(`return arguments[0].querySelector('button[title="Hide article"]')`, card)
  await ctx.s.exec(`arguments[0].click()`, chide)
  await ctx.confirmDialog()
  await ctx.s.waitFor(async () => !(await visible("Atom two")), "hidden from a card")
}))

test("B8 mark all read respects the time cut and the scope", shot("B8", async () => {
  // Resubscribe, so articles hidden or read by earlier tests do not interfere.
  // Hidden articles cannot be listed to unhide them, by design.
  await ctx.s.invoke("delete_source", { id: await rssId() })
  await ctx.s.invoke("add_source", { url: ctx.url("/rss.xml"), groupId: null })
  const atomItems = await ctx.items({ scope: "group", id: (await ctx.groups())[0].id })
  await ctx.s.invoke("set_read", { ids: atomItems.map((x) => x.id), read: false })
  await ctx.reloadUi()
  await ctx.leaveHome()
  await ctx.view("list")

  const folderUnread = async () => (await ctx.items({ scope: "group", id: (await ctx.groups())[0].id })).filter((x) => !x.read).length
  const folderBefore = await folderUnread()
  await (await ctx.railOrFail("Fixture RSS")).click()
  await sleep(300)
  await ctx.tool("Mark all as read")
  await (await ctx.s.waitFor(() => ctx.s.byText('[role="menu"] button', "1 day ago"), "1 day ago")).click()
  await ctx.confirmDialog()
  await ctx.s.waitFor(async () => {
    const xs = await ctx.items({ scope: "source", id: await rssId() })
    const unread = xs.filter((x) => !x.read).map((x) => x.title).sort()
    return JSON.stringify(unread) === JSON.stringify(["Alpha arrives within the hour", "Bravo about kubernetes clusters"].sort())
  }, "only articles older than a day to be marked read")

  assert.equal(await folderUnread(), folderBefore, "the other folder was not touched")

  await ctx.tool("Mark all as read")
  await (await ctx.s.waitFor(() => ctx.s.byText('[role="menu"] button', "All articles"), "All articles")).click()
  await ctx.confirmDialog()
  await ctx.s.waitFor(async () => (await ctx.items({ scope: "source", id: await rssId() })).every((x) => x.read), "the feed fully read")
  assert.equal(await folderUnread(), folderBefore, "still not the folder")
}))

test("B9 search from the field, / and Ctrl+F, and Escape clears it", shot("B9", async () => {
  await ctx.leaveHome()
  await ctx.view("list")
  await (await ctx.railOrFail("All articles")).click()
  await sleep(300)
  await ctx.s.exec(`document.activeElement?.blur()`)
  await ctx.s.press("/")
  await ctx.s.waitFor(() => ctx.s.exec(`return document.activeElement?.id === 'turbo-search'`), "/ to focus search")
  await ctx.s.type("kubernetes")
  await ctx.s.waitFor(async () => {
    const t = await ctx.titles()
    return t.length === 1 && t[0].startsWith("Bravo")
  }, "the search to narrow the list")

  await ctx.s.press("Escape")
  await ctx.s.waitFor(
    () => ctx.s.exec(`return document.getElementById('turbo-search').value === ''`),
    "Escape to clear the query",
  )
  await ctx.s.waitFor(async () => (await ctx.titles()).length > 1, "the full list to come back")

  await ctx.s.exec(`document.activeElement?.blur()`)
  await ctx.s.press("f", { ctrl: true })
  await ctx.s.waitFor(() => ctx.s.exec(`return document.activeElement?.id === 'turbo-search'`), "Ctrl+F to focus search")
  await ctx.s.press("Escape")
}))

test("B10 unread only, duplicates and sort toggles", shot("B10", async () => {
  await ctx.leaveHome()
  await ctx.view("list")
  await (await ctx.railOrFail("Fixture RSS")).click()
  await sleep(300)

  const before = await ctx.titles()
  await ctx.s.exec(`document.activeElement?.blur()`)
  await ctx.s.press("t")
  await ctx.s.waitFor(async () => {
    const after = await ctx.titles()
    return after.length === before.length && after[0] === before[before.length - 1]
  }, "t to reverse the order")
  await ctx.s.press("t")

  await ctx.s.invoke("set_read", { ids: (await ctx.items({ scope: "source", id: await rssId() })).map((x) => x.id), read: true })
  const one = (await ctx.items({ scope: "source", id: await rssId() }))[0]
  await ctx.s.invoke("set_read", { ids: [one.id], read: false })
  await ctx.reloadUi()
  await ctx.leaveHome()
  await (await ctx.railOrFail("Fixture RSS")).click()
  await sleep(300)
  await ctx.s.exec(`document.activeElement?.blur()`)
  await ctx.s.press("u")
  await ctx.s.waitFor(async () => (await ctx.titles()).length === 1, "u to show unread only")
  await ctx.s.press("u")
  await ctx.s.waitFor(async () => (await ctx.titles()).length > 1, "u again to show everything")
}))

test("B11 switching scope starts the list at the top", shot("B11", async () => {
  await ctx.s.cmd("POST", "/window/rect", { width: 900, height: 580 })
  for (const p of ["/grow.xml", "/teaser.xml", "/youtube.xml", "/feed.json"]) {
    await ctx.s.invoke("add_source", { url: ctx.url(p), groupId: null }).catch(() => undefined)
  }
  await ctx.reloadUi()
  await ctx.leaveHome()
  await ctx.view("list")
  await (await ctx.railOrFail("All articles")).click()
  await sleep(400)
  const scrolled = await ctx.s.exec(
    `const el = document.querySelector('section .overflow-y-auto'); el.scrollTop = 400; return el.scrollTop`,
  )
  assert.ok(scrolled > 0, "precondition: the list scrolls")
  await (await ctx.railOrFail("Fixture RSS")).click()
  await ctx.s.waitFor(
    () => ctx.s.exec(`return document.querySelector('section .overflow-y-auto').scrollTop === 0`),
    "the new list to start at the top",
  )
}))

test("B12 the same story from two feeds shows once, or twice on request", shot("B12", async () => {
  for (const p of ["/dupe-a.xml", "/dupe-b.xml"]) await ctx.s.invoke("add_source", { url: ctx.url(p), groupId: null })
  await ctx.reloadUi()
  await ctx.leaveHome()
  await ctx.view("list")
  await (await ctx.railOrFail("All articles")).click()
  await sleep(300)
  const count = async () => (await ctx.titles()).filter((t) => t === "Shared story everyone ran").length
  await ctx.s.waitFor(async () => (await count()) === 1, "one copy with duplicates hidden")
  await ctx.s.exec(`document.activeElement?.blur()`)
  await ctx.s.press("d")
  await ctx.s.waitFor(async () => (await count()) === 2, "both copies with duplicates shown")
  await ctx.s.press("d")
}))

test("B-rail All articles has no badge; Unread carries the unread count", async () => {
  const row = (label) =>
    ctx.s.exec(
      `const b = [...document.querySelectorAll('aside button, nav button')].find((x) => x.textContent.trim().startsWith(arguments[0]))
       return b ? b.textContent.replace(arguments[0], '').trim() : null`,
      label,
    )
  const unread = await row("Unread")
  assert.match(unread ?? "", /^\d+$/, "Unread shows a number")
  assert.equal(await row("All articles"), "", "All articles shows none")
})
