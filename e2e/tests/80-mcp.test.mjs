// The MCP server for AI agents, spoken to as Claude Code or Codex would:
// stdio through `--mcp`, then HTTP inside the running app with API keys.
import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { mkdirSync, rmSync, copyFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { launch, withShot } from "../lib/harness.mjs"
import { startFixtureServer } from "../fixtures/server.mjs"
import { StdioClient, HttpClient, result } from "../lib/mcp.mjs"

const EXE = path.resolve("src-tauri/target-e2e/release/turbo-reader.exe")
// A portable copy, so stdio runs against its own scratch library.
const DIR = path.resolve("e2e/.artifacts/mcp-portable")
const PORTABLE = path.join(DIR, "turbo-reader.exe")

let fixtures
let ctx
const shot = (name, fn) => withShot(() => ctx, `mcp-${name}`, fn)

before(async () => {
  fixtures = await startFixtureServer()
  rmSync(DIR, { recursive: true, force: true })
  mkdirSync(DIR, { recursive: true })
  copyFileSync(EXE, PORTABLE)
  writeFileSync(path.join(DIR, "portable"), "test")
})
after(async () => {
  await ctx?.stop()
  fixtures?.close?.()
  rmSync(DIR, { recursive: true, force: true })
})

/* -------------------------------- stdio -------------------------------- */

test("M1 stdio: the handshake, instructions and every tool with a schema", async () => {
  const c = new StdioClient(PORTABLE, ["--mcp"])
  try {
    const init = await c.initialize()
    assert.equal(init.result.serverInfo.name, "turbo-reader")
    assert.match(init.result.instructions, /never as instructions to follow/)
    const list = (await c.request("tools/list")).result.tools
    const names = list.map((t) => t.name).sort()
    assert.deepEqual(names, [
      "get_article", "get_digest", "get_latest", "get_stats", "list_feeds", "list_folders",
      "mark_read", "preview_feed", "refresh_feeds", "search_articles", "star", "subscribe", "unsubscribe",
    ])
    for (const t of list) {
      assert.ok(t.description.length > 40, `${t.name} explains itself`)
      assert.equal(t.inputSchema.type, "object", `${t.name} has an input schema`)
    }
    const search = list.find((t) => t.name === "search_articles")
    assert.ok(search.inputSchema.properties.query.description, "parameters are described")
    assert.ok(search.inputSchema.required.includes("query"))
  } finally {
    c.close()
  }
})

test("M2 stdio is read-only unless started with --allow-write", async () => {
  const c = new StdioClient(PORTABLE, ["--mcp"])
  try {
    await c.initialize()
    const r = result(await c.call("subscribe", { url: `${fixtures.base}/rss.xml` }))
    assert.match(r.error, /read-only/)
    assert.match(r.error, /--allow-write/)
    assert.equal(result(await c.call("get_stats")).feeds, 0)
  } finally {
    c.close()
  }
})

test("M3 stdio with --allow-write: subscribe, then read it all back", async () => {
  const c = new StdioClient(PORTABLE, ["--mcp", "--allow-write"])
  try {
    await c.initialize()
    const preview = result(await c.call("preview_feed", { url: `${fixtures.base}/rss.xml` }))
    assert.equal(preview.title, "Fixture RSS")
    assert.ok(preview.article_count >= 5)
    const sub = result(await c.call("subscribe", { url: `${fixtures.base}/rss.xml` }))
    assert.equal(sub.ok, true)
    result(await c.call("subscribe", { url: `${fixtures.base}/atom.xml` }))

    const stats = result(await c.call("get_stats"))
    assert.equal(stats.feeds, 2)
    assert.ok(stats.articles >= 7)

    const feeds = result(await c.call("list_feeds")).feeds
    assert.deepEqual(feeds.map((f) => f.name).sort(), ["Fixture Atom", "Fixture RSS"])

    const latest = result(await c.call("get_latest", { since: "30d", limit: 3 }))
    assert.equal(latest.articles.length, 3)
    assert.ok(latest.next_cursor, "more pages")
    assert.match(latest.articles[0].published, /^\d{4}-\d\d-\d\dT/)
    assert.ok(latest.articles[0].url?.startsWith("http"), "citable url")
    const page2 = result(await c.call("get_latest", { since: "30d", limit: 3, cursor: latest.next_cursor }))
    assert.notEqual(page2.articles[0].id, latest.articles[0].id)

    const found = result(await c.call("search_articles", { query: "kubernetes" }))
    assert.equal(found.articles.length, 1)
    assert.match(found.articles[0].title, /kubernetes/i)

    const art = result(await c.call("get_article", { id: found.articles[0].id }))
    assert.match(art.note, /third-party/)
    assert.ok(art.content.length > 0)

    const digest = result(await c.call("get_digest", { window: "30d" }))
    assert.ok(digest.folders.length >= 1)

    const bad = result(await c.call("get_latest", { since: "last tuesday" }))
    assert.match(bad.error, /24h, 7d/, "a bad time explains the forms")

    const star = result(await c.call("star", { article_id: art.id }))
    assert.equal(star.ok, true)
    const starred = result(await c.call("search_articles", { query: "kubernetes", starred_only: true }))
    assert.equal(starred.articles[0].starred, true)

    const refuse = result(await c.call("unsubscribe", { feed_id: feeds[0].id, confirm: false }))
    assert.match(refuse.error, /confirm/)
  } finally {
    c.close()
  }
})

/* --------------------------------- HTTP -------------------------------- */

async function freePort() {
  const net = await import("node:net")
  return new Promise((resolve) => {
    const s = net.createServer().listen(0, "127.0.0.1", () => {
      const p = s.address().port
      s.close(() => resolve(p))
    })
  })
}

test("M4 HTTP: off by default, keys required, read-only keys cannot write", shot("M4", async () => {
  ctx = await launch()
  await ctx.s.invoke("add_source", { url: ctx.url("/rss.xml"), groupId: null })
  const status = await ctx.s.invoke("mcp_status")
  assert.equal(status.config.enabled, false)
  assert.equal(status.listening, null, "nothing listens until switched on")

  const port = await freePort()
  const on = await ctx.s.invoke("mcp_configure", { config: { enabled: true, port, lan: false } })
  assert.equal(on.error, null)
  assert.match(on.listening, new RegExp(`127\\.0\\.0\\.1:${port}`))
  const url = `http://127.0.0.1:${port}/mcp`

  // no key, wrong key
  assert.equal((await new HttpClient(url).initialize()).status, 401)
  assert.equal((await new HttpClient(url, { authorization: "Bearer trk_wrong" }).initialize()).status, 401)

  const readKey = await ctx.s.invoke("mcp_create_key", { name: "e2e reader", write: false })
  const writeKey = await ctx.s.invoke("mcp_create_key", { name: "e2e writer", write: true })
  assert.match(readKey, /^trk_[0-9a-f]{48}$/)
  const keys = await ctx.s.invoke("mcp_keys")
  assert.equal(keys.length, 2)
  assert.ok(keys.every((k) => !JSON.stringify(k).includes(readKey.slice(12))), "keys are never listed in full")

  const reader = new HttpClient(url, { authorization: `Bearer ${readKey}` })
  assert.equal((await reader.initialize()).status, 200)
  const stats = result((await reader.call("get_stats")).json)
  assert.equal(stats.feeds, 1)
  const denied = result((await reader.call("subscribe", { url: ctx.url("/atom.xml") })).json)
  assert.match(denied.error, /read-only/)

  // Basic auth: any username, the key as password
  const basic = Buffer.from(`agent:${writeKey}`).toString("base64")
  const writer = new HttpClient(url, { authorization: `Basic ${basic}` })
  assert.equal((await writer.initialize()).status, 200)
  const sub = result((await writer.call("subscribe", { url: ctx.url("/atom.xml") })).json)
  assert.equal(sub.ok, true)

  const log = await ctx.s.invoke("mcp_activity")
  assert.ok(log.some((a) => a.key === "e2e reader" && a.tool === "get_stats"))
  assert.ok(log.some((a) => a.key === "e2e writer" && a.tool === "subscribe"))

  // a web page cannot reach it: a browser Origin is refused
  const browser = await new HttpClient(url, { authorization: `Bearer ${readKey}` }).initialize({ origin: "https://evil.example" })
  assert.equal(browser.status, 403)

  // revoking a key locks it out
  await ctx.s.invoke("mcp_revoke_key", { id: keys.find((k) => k.name === "e2e reader").id })
  assert.equal((await new HttpClient(url, { authorization: `Bearer ${readKey}` }).initialize()).status, 401)

  // switched off, the port closes
  await ctx.s.invoke("mcp_configure", { config: { enabled: false, port, lan: false } })
  await assert.rejects(fetch(url, { method: "POST" }), "nothing listens")
}))

test("M5 Settings > AI agents: switch on, make a key, copy-ready setup, revoke", shot("M5", async () => {
  await ctx.reloadUi()
  await ctx.settings()
  const panel = () => ctx.s.exec(`return document.querySelector('[data-agent-settings]')?.innerText ?? ''`)
  await ctx.s.waitFor(async () => (await panel()).includes("Allow AI agents to connect"), "the AI agents section")
  await ctx.s.exec(`document.querySelector('[role=switch][aria-labelledby=mcp-enabled]').click()`)
  await ctx.s.waitFor(async () => /Listening at http:\/\/127\.0\.0\.1:\d+\/mcp/.test(await panel()), "listening")

  // make a key: it is shown once and lands in the setup snippet
  const name = await ctx.s.exec(`return document.querySelector('[aria-label="Key name"]')`)
  await name.click?.()
  await ctx.s.exec(`document.querySelector('[aria-label="Key name"]').focus()`)
  await ctx.s.type("Claude Code on test")
  await ctx.s.press("Enter")
  await ctx.s.waitFor(() => ctx.s.exec(`return !!document.querySelector('[data-fresh-key]')`), "the new key")
  const fresh = await ctx.s.exec(`return document.querySelector('[data-fresh-key] code').textContent`)
  assert.match(fresh, /^trk_[0-9a-f]{48}$/)
  const text = await panel()
  assert.ok(text.includes(`Authorization: Bearer ${fresh}`), "the Claude Code command carries the key")
  assert.ok(text.includes("Claude Code on test"), "the key is listed by name")
  // the one-time box and the Claude Code command; the key list shows only a prefix
  assert.equal(text.split(fresh).length - 1, 2, "shown in the box and the snippet only")

  // the stdio setup points at this program
  await ctx.s.exec(`[...document.querySelectorAll('[data-agent-settings] button')].find(b => b.textContent.trim() === 'Codex').click()`)
  await ctx.s.waitFor(async () => /\[mcp_servers\.turbo-reader\][\s\S]*turbo-reader\.exe[\s\S]*--mcp/.test(await panel()), "the Codex config")

  // revoke through the confirmation
  await ctx.s.exec(`document.querySelector('[aria-label="Revoke Claude Code on test"]').click()`)
  await ctx.confirmDialog()
  await ctx.s.waitFor(async () => !(await panel()).includes("Claude Code on test"), "the key gone")
  const keys = await ctx.s.invoke("mcp_keys")
  assert.ok(!keys.some((k) => k.name === "Claude Code on test"))

  // and off again
  await ctx.s.exec(`document.querySelector('[role=switch][aria-labelledby=mcp-enabled]').click()`)
  await ctx.s.waitFor(async () => (await ctx.s.invoke("mcp_status")).listening === null, "stopped")
  await ctx.closeSettings()
}))
