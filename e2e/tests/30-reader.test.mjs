// C. The reader: full content, copy link, Markdown, PDF, browser, typography,
// QR code, back navigation, YouTube entries and hostile markup.
import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, rmSync, existsSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { launch, withShot } from "../lib/harness.mjs"
import { sleep } from "../lib/webdriver.mjs"

let ctx
const shot = (name, fn) => withShot(() => ctx, `reader-${name}`, fn)

before(async () => {
  ctx = await launch()
  for (const p of ["/teaser.xml", "/rss.xml", "/youtube.xml", "/hostile.xml", "/media.xml", "/blocked.xml"]) {
    await ctx.s.invoke("add_source", { url: ctx.url(p), groupId: null })
  }
  await ctx.reloadUi()
  await ctx.leaveHome()
  await ctx.view("list")
  await (await ctx.railOrFail("All articles")).click()
  await sleep(300)
})
after(async () => {
  await ctx?.stop()
})

const body = () => ctx.s.exec(`return document.querySelector('.prose-feed')?.innerHTML ?? ''`)
const toast = () => ctx.s.exec(`return document.querySelector('[data-reader-note]')?.textContent ?? null`)
const toastKind = () => ctx.s.exec(`return document.querySelector('[data-reader-note]')?.dataset.readerNote ?? null`)
const lightbox = () => ctx.s.exec(`return !!document.querySelector('[data-lightbox]')`)
const zoomText = () => ctx.s.exec(`return [...document.querySelectorAll('[data-lightbox] span')].map((x) => x.textContent).join('')`)

/* -------------------------------------------------------------------------- */

test("C1 load full content replaces a teaser with the article", shot("C1", async () => {
  await ctx.open("A teaser with a full page")
  assert.ok(!(await body()).includes("FULL-BODY-MARKER"), "precondition: only the teaser")
  await ctx.tool("Load full content (f)")
  await ctx.s.waitFor(async () => (await body()).includes("FULL-BODY-MARKER"), "the full body in the reader")
  const id = (await ctx.items()).find((x) => x.title === "A teaser with a full page").id
  const saved = await ctx.s.invoke("get_item", { id })
  assert.ok(saved.content.includes("FULL-BODY-MARKER"), "and saved, so it is there next time")
  assert.ok(!saved.content.includes("footer link"), "without the page furniture")
}))

test("C2 load full content says so when there is nothing better", shot("C2", async () => {
  await ctx.open("A teaser with nothing behind it")
  await ctx.tool("Load full content (f)")
  const msg = await ctx.s.waitFor(toast, "a message")
  assert.match(msg, /could not find/i)
  assert.equal(await toastKind(), "error", "shown as a failure, not with a success check")
  assert.equal(await ctx.s.exec(`return document.querySelector('[data-reader-note]').getAttribute('role')`), "alert")
}))

test("C2b a page behind a bot check says to read it in the browser", shot("C2b", async () => {
  await ctx.open("A teaser behind a bot check")
  await ctx.tool("Load full content (f)")
  const msg = await ctx.s.waitFor(toast, "a message")
  assert.match(msg, /only shows the full article in a browser\. Press o/)
  assert.ok(!/403|Forbidden|https?:/.test(msg), "no raw status or address")
  assert.equal(await toastKind(), "error")
}))

test("C3 copy link", shot("C3", async () => {
  await ctx.open("Alpha arrives within the hour")
  await ctx.more("Copy link")
  await ctx.s.waitFor(async () => /copied/i.test((await toast()) ?? ""), "a confirmation")
  assert.equal(ctx.clipboard(), ctx.url("/a/1"))
}))

test("C4 save as Markdown writes a real document", shot("C4", async () => {
  const out = path.join(os.tmpdir(), `turbo-e2e-${process.pid}.md`)
  rmSync(out, { force: true })
  await ctx.open("Alpha arrives within the hour")
  await ctx.trap("plugin:dialog|save", out)
  await ctx.more("Save as Markdown")
  await ctx.s.waitFor(() => existsSync(out), "the file to be written")
  const md = readFileSync(out, "utf8")
  assert.match(md, /^---\n/, "front matter")
  assert.match(md, /title: "Alpha arrives within the hour"/)
  assert.match(md, new RegExp(`url: "${ctx.url("/a/1")}"`))
  assert.match(md, /^# Alpha arrives within the hour$/m)
  assert.match(md, /Alpha body\./)
  const [call] = await ctx.trapped("plugin:dialog|save")
  assert.match(JSON.stringify(call), /alpha-arrives-within-the-hour\.md/, "a sensible default file name")
  rmSync(out, { force: true })
}))

test("C5 save as PDF opens the print dialog", shot("C5", async () => {
  await ctx.open("Alpha arrives within the hour")
  await ctx.trapPrint()
  await ctx.more("Save as PDF")
  await ctx.s.waitFor(() => ctx.s.exec(`return window.__printed === 1`), "print to be called")
}))

test("C6 open in browser, from the button and with o", shot("C6", async () => {
  await ctx.open("Alpha arrives within the hour")
  await ctx.trap("plugin:opener|open_url", null)
  await ctx.tool("Open in browser (o)")
  await ctx.s.waitFor(async () => (await ctx.trapped("plugin:opener|open_url")).length === 1, "the button to open it")
  await ctx.s.exec(`document.activeElement?.blur()`)
  await ctx.s.press("o")
  await ctx.s.waitFor(async () => (await ctx.trapped("plugin:opener|open_url")).length === 2, "o to open it")
  const calls = await ctx.trapped("plugin:opener|open_url")
  assert.equal(calls[0].url, ctx.url("/a/1"))
}))

test("C7 font, size, width and direction apply to the article", shot("C7", async () => {
  await ctx.open("Alpha arrives within the hour")
  const style = () =>
    ctx.s.exec(`const p = document.querySelector('.prose-feed'); const a = document.querySelector('.reader-column');
                const cs = getComputedStyle(p);
                return { font: cs.fontFamily, size: cs.fontSize, width: getComputedStyle(a).maxWidth, dir: a.getAttribute('dir') }`)
  const before = await style()

  await ctx.more("Font")
  await (await ctx.s.waitFor(() => ctx.s.byText('[role="menu"] button', "Serif"), "Serif")).click()
  await ctx.s.waitFor(async () => /Georgia/i.test((await style()).font), "a serif face")
  await ctx.s.press("Escape")

  await ctx.more("Font size")
  const sizes = await ctx.s.exec(`return [...document.querySelectorAll('[role="menu"] button')].filter(b => b.textContent.trim() === 'Aa')`)
  await ctx.s.exec(`arguments[0].click()`, sizes[sizes.length - 1])
  await ctx.s.waitFor(async () => parseFloat((await style()).size) > parseFloat(before.size), "a larger size")
  await ctx.s.press("Escape")

  await ctx.more("Line width")
  await (await ctx.s.waitFor(() => ctx.s.byText('[role="menu"] button', "Wide"), "Wide")).click()
  await ctx.s.waitFor(async () => parseFloat((await style()).width) > parseFloat(before.width), "a wider column")
  await ctx.s.press("Escape")

  await ctx.more("Text direction")
  await (await ctx.s.waitFor(() => ctx.s.byText('[role="menu"] button', "Right to left"), "RTL")).click()
  await ctx.s.waitFor(async () => (await style()).dir === "rtl", "right to left")
  await ctx.s.press("Escape")
  // back to defaults for the rest of the suite
  await ctx.settings("Appearance")
  await (await ctx.s.byLabel("Reset appearance")).click()
  await ctx.confirmDialog()
  await ctx.closeSettings()
}))

test("C8 the QR code shows and hides", shot("C8", async () => {
  await ctx.open("Alpha arrives within the hour")
  await ctx.more("QR code")
  await ctx.s.waitFor(() => ctx.s.exec(`return !!document.querySelector('[role="menu"] svg path')`), "a QR code")
  const btn = await ctx.s.waitFor(() => ctx.s.byText('[role="menu"] button', "Hide QR code"), "the hide option")
  await btn.click()
  await ctx.s.waitFor(
    () => ctx.s.exec(`return !document.querySelector('[role="menu"] .bg-white svg')`),
    "the code to go",
  )
  await ctx.s.press("Escape")
}))

test("C9 back to the list from the reader in card view", shot("C9", async () => {
  await ctx.view("cards")
  await (await ctx.railOrFail("All articles")).click()
  await sleep(300)
  await ctx.open("Alpha arrives within the hour")
  await ctx.tool("Back to articles")
  await ctx.s.waitFor(async () => (await ctx.readerTitle()) === null, "the button to go back")
  await ctx.open("Alpha arrives within the hour")
  await ctx.s.exec(`document.activeElement?.blur()`)
  await ctx.s.press("Escape")
  await ctx.s.waitFor(async () => (await ctx.readerTitle()) === null, "Escape to go back")
  await ctx.view("list")
}))

test("C10 a YouTube entry shows its description and the video", shot("C10", async () => {
  await ctx.open("A fixture video")
  const html = await body()
  assert.match(html, /First line of the description\./, "the media description as the body")
  assert.match(html, /<p>[^<]*A new paragraph about the video/, "paragraphs kept")
  const poster = await ctx.s.exec(`return document.querySelector('article.reader-column img[src*="i.ytimg.com"]')?.src ?? null`)
  assert.ok(poster, "a poster for the video")
  assert.match(poster, /dQw4w9WgXcQ/)
}))

test("C11 hostile markup is stripped and nothing runs", shot("C11", async () => {
  await ctx.open("Hostile markup")
  const html = await body()
  assert.ok(!/geolocation/i.test(html), "no unknown element")
  assert.ok(!/<script/i.test(html), "no script")
  assert.ok(!/onerror/i.test(html), "no handler attributes")
  assert.ok(!/javascript:/i.test(html), "no javascript: links")
  assert.equal(await ctx.s.exec(`return window.__pwned ?? null`), null, "and nothing executed")
  assert.match(html, /before[\s\S]*after/, "the ordinary text survives")
}))

test("C12 an image opens in a lightbox with zoom, and the reader stays", shot("C12", async () => {
  await ctx.open("An article with pictures")
  const before = await ctx.s.exec(`return location.href`)
  await ctx.trap("plugin:opener|open_url", null)
  assert.equal(
    await ctx.s.exec(`return getComputedStyle(document.querySelector('.prose-feed img')).cursor`),
    "pointer",
    "a picture shows it can be clicked",
  )
  // A right click is for the context menu, not the lightbox.
  await ctx.s.exec(`document.querySelector('.prose-feed img').dispatchEvent(new MouseEvent('auxclick', { bubbles: true, button: 2 }))`)
  await sleep(300)
  assert.equal(await lightbox(), false, "no lightbox on a right click")
  assert.equal((await ctx.trapped("plugin:opener|open_url")).length, 0, "and nothing opened")
  await ctx.s.exec(`document.querySelector('.prose-feed img').click()`)
  await ctx.s.waitFor(lightbox, "the lightbox")
  assert.equal(await ctx.s.exec(`return location.href`), before, "the window did not navigate")
  assert.equal((await ctx.trapped("plugin:opener|open_url")).length, 0, "the image's link did not open")
  assert.equal(await zoomText(), "100%")
  await ctx.s.exec(`document.querySelector('[data-lightbox] [aria-label="Zoom in"]').click()`)
  await ctx.s.waitFor(async () => (await zoomText()) === "125%", "zoom in")
  await ctx.s.press("+")
  await ctx.s.waitFor(async () => (await zoomText()) !== "125%", "+ zooms in")
  await ctx.s.press("0")
  await ctx.s.waitFor(async () => (await zoomText()) === "100%", "0 fits it again")
  await ctx.s.exec(`document.querySelector('[data-lightbox] [aria-label="Open link in browser"]').click()`)
  await ctx.s.waitFor(async () => (await ctx.trapped("plugin:opener|open_url")).length === 1, "the image's link in the browser")
  assert.equal((await ctx.trapped("plugin:opener|open_url"))[0].url, ctx.url("/photo-page"))
  await ctx.s.press("Escape")
  await ctx.s.waitFor(async () => !(await lightbox()), "Escape to close it")
  assert.equal(await ctx.readerTitle(), "An article with pictures", "Escape closed the image, not the article")
  await ctx.s.exec(`document.querySelector('.prose-feed img').click()`)
  await ctx.s.waitFor(lightbox, "the lightbox again")
  await ctx.s.exec(`document.querySelector('[data-lightbox]').click()`)
  await ctx.s.waitFor(async () => !(await lightbox()), "a click outside to close it")
}))

test("C13 the lightbox downloads the image", shot("C13", async () => {
  const out = path.join(os.tmpdir(), `turbo-e2e-${process.pid}.png`)
  rmSync(out, { force: true })
  await ctx.open("An article with pictures")
  await ctx.trap("plugin:dialog|save", out)
  await ctx.s.exec(`document.querySelector('.prose-feed img').click()`)
  await ctx.s.waitFor(lightbox, "the lightbox")
  await ctx.s.exec(`document.querySelector('[data-lightbox] [aria-label="Download image"]').click()`)
  await ctx.s.waitFor(() => existsSync(out), "the image on disk")
  assert.equal(readFileSync(out).subarray(1, 4).toString(), "PNG", "the real image bytes")
  rmSync(out, { force: true })
  await ctx.s.press("Escape")
  await ctx.s.waitFor(async () => !(await lightbox()), "the lightbox to close")
}))

test("C14 links in an article open in the browser", shot("C14", async () => {
  await ctx.open("An article with pictures")
  const before = await ctx.s.exec(`return location.href`)
  await ctx.trap("plugin:opener|open_url", null)
  await ctx.s.exec(`[...document.querySelectorAll('.prose-feed a')].find((a) => a.textContent === 'a plain link').click()`)
  await ctx.s.waitFor(async () => (await ctx.trapped("plugin:opener|open_url")).length === 1, "the link in the browser")
  assert.equal((await ctx.trapped("plugin:opener|open_url"))[0].url, ctx.url("/elsewhere"))
  assert.equal(await ctx.readerTitle(), "An article with pictures")
  assert.equal((await ctx.s.exec(`return location.href`)).split("#")[0], before.split("#")[0], "the app never left")
}))

test("C15 the right-click menu is left to the trimmed native one on Windows", shot("C15", async () => {
  await ctx.open("An article with pictures")
  // On Windows the page leaves the event alone: WebView2's own menu opens,
  // with everything but the clipboard, links and pictures removed in Rust.
  const allowed = await ctx.s.exec(
    `return document.querySelector('.reader-column h1, article h1, h1').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }))`,
  )
  assert.equal(allowed, true, "the page does not cancel the menu")
}))

test("C16 Copy image gets the picture's bytes through the app", shot("C16", async () => {
  const head = await ctx.s.exec(
    `return window.__TAURI_INTERNALS__.invoke('image_bytes', { url: arguments[0] })
       .then((b) => Array.from(new Uint8Array(b).slice(1, 4)).map((c) => String.fromCharCode(c)).join(''))`,
    ctx.url("/pic.png"),
  )
  assert.equal(head, "PNG")
}))

test("C17 Share hands the title and link to the system share sheet", shot("C17", async () => {
  await ctx.open("Alpha arrives within the hour")
  // The real sheet is a system window; stand in for it and record the call.
  await ctx.s.exec(`window.__shared = [];
    Object.defineProperty(navigator, 'share', { configurable: true, value: (data) => { window.__shared.push(data); return Promise.resolve() } })`)
  await ctx.more("Share…")
  await ctx.s.waitFor(() => ctx.s.exec(`return window.__shared.length === 1`), "the share sheet asked for")
  const data = await ctx.s.exec(`return window.__shared[0]`)
  assert.equal(data.url, ctx.url("/a/1"))
  assert.equal(data.title, "Alpha arrives within the hour")

  // Closing the sheet without picking anything says nothing.
  await ctx.s.exec(`Object.defineProperty(navigator, 'share', { configurable: true, value: () => Promise.reject(new DOMException('cancelled', 'AbortError')) })`)
  await ctx.more("Share…")
  await sleep(400)
  assert.equal(await toastKind(), null, "no message when the sheet is dismissed")
}))
