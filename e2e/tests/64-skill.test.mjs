// The Turbo Reader skill: installing it per agent, keeping it current from
// the app and over MCP, and removing it. Every path here is under the
// harness's throwaway home, never the real ~/.claude or ~/.codex.
import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { launch, withShot, SKILL_HOME } from "../lib/harness.mjs"
import { sleep } from "../lib/webdriver.mjs"
import { HttpClient, result } from "../lib/mcp.mjs"

let ctx
const shot = (name, fn) => withShot(() => ctx, `skill-${name}`, fn)
const MCP_PORT = 7897
const claudeFile = path.join(SKILL_HOME, ".claude", "skills", "turbo-reader", "SKILL.md")
const codexFile = path.join(SKILL_HOME, ".codex", "skills", "turbo-reader", "SKILL.md")

before(async () => {
  ctx = await launch()
  // Claude Code "is installed" (its folder exists); Codex is not.
  mkdirSync(path.join(SKILL_HOME, ".claude"), { recursive: true })
  await ctx.s.invoke("add_source", { url: ctx.url("/rss.xml"), groupId: null })
  await ctx.reloadUi()
  await ctx.leaveHome()
})
after(async () => {
  await ctx?.s.invoke("mcp_configure", { config: { enabled: false, port: MCP_PORT, lan: false } }).catch(() => {})
  await ctx?.stop()
})

const state = (id) =>
  ctx.s.exec(`return document.querySelector('[data-skill-target="${id}"] [data-skill-state]')?.textContent ?? null`)
const clickIn = (id, label) =>
  ctx.s.exec(
    `const b = [...document.querySelectorAll('[data-skill-target="${id}"] button')].find((x) => x.textContent.trim() === arguments[0]); b?.click(); return !!b`,
    label,
  )

test("S1 Settings shows the skill's version and installs it for an agent", shot("S1", async () => {
  await ctx.settings("AI agents")
  await ctx.s.waitFor(() => ctx.s.exec(`return !!document.querySelector('[data-skill-settings]')`), "the skill section")
  assert.match(await ctx.s.exec(`return document.querySelector('[data-skill-version]').textContent`), /^v\d+\.\d+\.\d+$/)
  assert.equal(await state("claude-code"), "Not installed")
  assert.equal(await state("codex"), "Not found on this computer")

  assert.ok(await clickIn("claude-code", "Install"))
  await ctx.s.waitFor(async () => /^Installed · v/.test((await state("claude-code")) ?? ""), "installed")
  const text = readFileSync(claudeFile, "utf8")
  assert.match(text, /^---\nname: turbo-reader\n/)
  assert.match(text, /\nversion: \d+\.\d+\.\d+\n---/)
  assert.ok(!text.includes("{{VERSION}}"), "the version is filled in")
  await ctx.closeSettings()
}))

test("S2 an old copy shows in the bell and updates from there", shot("S2", async () => {
  mkdirSync(path.dirname(codexFile), { recursive: true })
  writeFileSync(codexFile, "---\nname: turbo-reader\ndescription: old\nversion: 0.9.0\n---\nOld text.\n")
  await ctx.reloadUi()
  await ctx.leaveHome()
  await ctx.s.waitFor(() => ctx.s.exec(`return document.querySelector('[data-bell-count]')?.textContent === '1'`), "a count on the bell")
  await (await ctx.s.waitFor(() => ctx.s.byLabel("Notifications"), "the bell")).click()
  await ctx.s.waitFor(() => ctx.s.exec(`return !!document.querySelector('[data-outdated-skill]')`), "the outdated skill")
  const row = await ctx.s.exec(`return document.querySelector('[data-outdated-skill]').innerText`)
  assert.match(row, /Codex is out of date/)
  assert.match(row, /v0\.9\.0 → v\d/)
  await ctx.s.exec(`[...document.querySelectorAll('[data-outdated-skill] button')].find((b) => b.textContent.trim() === 'Update').click()`)
  await ctx.s.waitFor(() => ctx.s.exec(`return !document.querySelector('[data-bell-count]')`), "the count to clear")
  assert.match(readFileSync(codexFile, "utf8"), /description: Read, search/, "the new text was written")
  await ctx.s.press("Escape")
  await sleep(300)
}))

test("S3 get_skill over MCP tells an old copy to update, and a current one it is fine", shot("S3", async () => {
  await ctx.s.invoke("mcp_configure", { config: { enabled: true, port: MCP_PORT, lan: false } })
  const key = await ctx.s.invoke("mcp_create_key", { name: "Skill test", write: false })
  const mcp = new HttpClient(`http://127.0.0.1:${MCP_PORT}/mcp`, { authorization: `Bearer ${key}` })
  await mcp.initialize()
  const old = result((await mcp.call("get_skill", { version: "0.9.0" })).json)
  assert.equal(old.up_to_date, false)
  assert.match(old.content, /^---\nname: turbo-reader\n/)
  const current = result((await mcp.call("get_skill", { version: old.version })).json)
  assert.equal(current.up_to_date, true)
  assert.equal(current.content ?? null, null, "no content when nothing changed")
  assert.equal(readFileSync(claudeFile, "utf8"), old.content, "the app and MCP hand out the same skill")
}))

test("S4 Remove deletes the skill and its folder, nothing else", shot("S4", async () => {
  writeFileSync(path.join(SKILL_HOME, ".claude", "keep-me.txt"), "not ours")
  await ctx.settings("AI agents")
  await ctx.s.waitFor(async () => /^Installed/.test((await state("claude-code")) ?? ""), "the installed state")
  assert.ok(await clickIn("claude-code", "Remove"))
  await ctx.s.waitFor(async () => (await state("claude-code")) === "Not installed", "removed")
  assert.equal(existsSync(claudeFile), false)
  assert.equal(existsSync(path.dirname(claudeFile)), false, "its folder too")
  assert.equal(existsSync(path.join(SKILL_HOME, ".claude", "keep-me.txt")), true, "the agent's other files stay")
  await ctx.closeSettings()
}))
