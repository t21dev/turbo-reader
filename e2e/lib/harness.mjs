// Starts a clean, isolated Turbo Reader under WebDriver for one test file.
//
// Isolation is by identifier: the e2e build is dev.t21.turbo-reader.e2e, so
// it has its own database under %APPDATA% and its own WebView2 profile under
// %LOCALAPPDATA%. Both are wiped before every launch. Nothing here can touch a
// real install's feeds, settings or window state.

import { spawn, execFileSync } from "node:child_process"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import net from "node:net"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Session, sleep } from "./webdriver.mjs"
import { startFixtureServer } from "../fixtures/server.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(here, "..", "..")
export const IDENTIFIER = "dev.t21.turbo-reader.e2e"
export const APP = path.join(ROOT, "src-tauri", "target-e2e", "release", "turbo-reader.exe")
const EDGE_DRIVER = path.join(ROOT, "e2e", ".bin", "msedgedriver.exe")
const ARTIFACTS = path.join(ROOT, "e2e", ".artifacts")

const DATA_DIRS = [
  path.join(process.env.APPDATA ?? "", IDENTIFIER),
  path.join(process.env.LOCALAPPDATA ?? "", IDENTIFIER),
]

function freePort() {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

async function waitForPort(port, timeout = 20000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const ok = await new Promise((r) => {
      const sock = net.connect(port, "127.0.0.1", () => {
        sock.destroy()
        r(true)
      })
      sock.on("error", () => r(false))
    })
    if (ok) return
    await sleep(150)
  }
  throw new Error(`port ${port} never opened`)
}

function killTree(pid) {
  if (!pid) return
  try {
    execFileSync("taskkill", ["/F", "/T", "/PID", String(pid)], { stdio: "ignore" })
  } catch {
    /* already gone */
  }
}

function wipeData() {
  for (const dir of DATA_DIRS) {
    if (dir.endsWith(IDENTIFIER)) rmSync(dir, { recursive: true, force: true })
  }
}

export async function launch({ keepData = false } = {}) {
  if (!existsSync(APP)) {
    throw new Error(`e2e build missing at ${APP}. Run: npm run e2e:build`)
  }
  if (!keepData) wipeData()

  const fixtures = await startFixtureServer()
  const port = await freePort()
  const nativePort = await freePort()
  const driver = spawn(
    path.join(process.env.USERPROFILE ?? "", ".cargo", "bin", "tauri-driver.exe"),
    ["--port", String(port), "--native-port", String(nativePort), "--native-driver", EDGE_DRIVER],
    { stdio: "ignore", windowsHide: true },
  )
  await waitForPort(port)

  const s = await Session.create(`http://127.0.0.1:${port}`, {
    "tauri:options": { application: APP },
  })

  // Ready when React has mounted and the splash has gone.
  await s.waitFor(
    () =>
      s.exec(
        `return !!document.querySelector('#root > *') && !document.getElementById('splash')`,
      ),
    "the app to finish starting",
    { timeout: 30000 },
  )

  const ctx = makeContext(s, fixtures.base)

  ctx.stop = async () => {
    await s.close()
    killTree(driver.pid)
    await fixtures.close()
  }

  // Relaunch against the same data, for persistence checks.
  ctx.restart = async () => {
    // Quit the way a person does, through the window, so WebView2 flushes its
    // storage. Killing the process would lose writes a real user never loses.
    await sleep(1500)
    await s
      .invoke("plugin:window|close", { label: "main" })
      .catch(() => undefined)
    await sleep(1500)
    await ctx.stop()
    return launch({ keepData: true })
  }
  return ctx
}

/* ----------------------------------- helpers ---------------------------------- */

/** The same snake_case to camelCase mapping the app's own API client applies. */
export function camel(v) {
  if (Array.isArray(v)) return v.map(camel)
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), camel(x)]),
    )
  }
  return v
}

function makeContext(s, base) {
  const ctx = {
    s,
    base,
    url: (p) => `${base}${p}`,

    // backend state, read through the real IPC
    sources: async () => camel(await s.invoke("list_sources")),
    groups: async () => camel(await s.invoke("list_groups")),
    items: async (filter = {}) =>
      camel(await s.invoke("list_items", { filter: { limit: 500, ...filter } })),
    stats: async () => camel(await s.invoke("stats")),
    home: async (req = {}) => camel(await s.invoke("home_summary", { req })),
    source: async (name) => (await ctx.sources()).find((x) => x.name === name),

    /** Subscribe through the backend, for tests about something else. */
    async subscribe(p, groupId = null) {
      const id = await s.invoke("add_source", { url: `${base}${p}`, groupId })
      await ctx.reloadUi()
      return id
    },

    /** Make the UI re-read the backend: the same effect as a refresh. */
    async reloadUi() {
      await s.exec(`location.reload()`)
      await s.waitFor(
        () => s.exec(`return !!document.querySelector('#root > *')`),
        "the reload to finish",
        { timeout: 20000 },
      )
      await sleep(400)
    },

    /** A sidebar row by its visible label. */
    rail: (label) => s.byText("aside button", label),

    async railOrFail(label) {
      return s.waitFor(() => ctx.rail(label), `"${label}" in the sidebar`)
    },

    /** Right-click a sidebar row and pick an item from its menu. */
    async railMenu(label, item) {
      const row = await ctx.railOrFail(label)
      await row.rightClick()
      const entry = await s.waitFor(
        () => s.byText('[role="menu"] button', item),
        `"${item}" in the context menu`,
      )
      await entry.click()
    },

    /** Fill and confirm the shared prompt dialog, typing like a person would. */
    async prompt(value) {
      await s.waitFor(
        () => s.exec(`return document.querySelector('[role=dialog] button[type=submit]') ?? null`),
        "the prompt to open",
      )
      // The dialog resets and selects its field just after opening. Typing
      // before that lands would be overwritten, so let it settle first.
      await sleep(250)
      if (value !== undefined) {
        const input = await s.find("[role=dialog] input")
        await input.click()
        await s.press("a", { ctrl: true })
        await s.press("Backspace")
        await s.type(value)
      }
      const confirm = await s.find("[role=dialog] button[type=submit]")
      await confirm.click()
      await s.waitFor(
        () => s.exec(`return !document.querySelector('[role=dialog] button[type=submit]')`),
        "the prompt to close",
      )
    },

    /**
     * Intercept one Tauri command in the page and answer it ourselves,
     * recording every call. Used for things that would leave the app: the
     * native open and save dialogs, the print dialog, the system browser.
     */
    async trap(cmd, answer = null) {
      // __TAURI_INTERNALS__.invoke is non-writable, so the trap sits one layer
      // down: the IPC is a fetch to http://ipc.localhost/<command>.
      await s.exec(
        `const [cmd, answer] = arguments;
         window.__trapped = window.__trapped || {};
         window.__answers = window.__answers || {};
         window.__trapped[cmd] = [];
         window.__answers[cmd] = answer;
         if (!window.__realFetch) {
           window.__realFetch = window.fetch.bind(window);
           window.fetch = (input, init) => {
             const url = typeof input === 'string' ? input : input.url;
             const at = url.indexOf('ipc.localhost/');
             const name = at === -1 ? null : decodeURIComponent(url.slice(at + 14).split('?')[0]);
             if (name && name in window.__answers) {
               let args = null;
               try { args = init && init.body ? JSON.parse(init.body) : null } catch {}
               window.__trapped[name].push(args);
               return Promise.resolve(new Response(JSON.stringify(window.__answers[name]), {
                 status: 200,
                 headers: { 'Tauri-Response': 'ok', 'content-type': 'application/json' },
               }));
             }
             return window.__realFetch(input, init);
           };
         }`,
        cmd,
        answer,
      )
    },

    /** Calls a trapped command received, oldest first. */
    trapped: (cmd) => s.exec(`return (window.__trapped || {})[arguments[0]] || []`, cmd),

    /** Replace window.print so the native print dialog cannot block the run. */
    async trapPrint() {
      await s.exec(`window.__printed = 0; window.print = () => { window.__printed += 1 }`)
    },

    /** Leave Home for the ordinary feed views. */
    async leaveHome() {
      const home = await s.exec(`return !!document.getElementById('turbo-home-search') || /TODAY/.test(document.body.innerText)`)
      if (home) {
        const all = await ctx.railOrFail("All articles")
        await all.click()
        await sleep(300)
      }
    },

    /** Switch the article area to list or cards. */
    async view(mode) {
      const want = mode === "list" ? "Switch to list view" : "Switch to card view"
      // The view switch lives in the title bar's menu.
      await (await s.waitFor(() => s.byLabel("Menu"), "the menu button")).click()
      const item = await s.waitFor(() => s.byText('[role="menu"] button', "Switch to"), "the view item")
      const text = await s.exec(`return arguments[0].textContent`, item)
      if (text.includes(want)) await item.click()
      else await s.press("Escape")
      await sleep(300)
    },

    /** Titles of the articles currently listed, top to bottom. */
    titles: () =>
      s.exec(`return [...document.querySelectorAll('main article h3, section article h3')]
                .filter(h => h.offsetParent !== null).map(h => h.textContent.trim())`),

    /** The open article's heading, or null. */
    readerTitle: () =>
      s.exec(`return document.querySelector('article.reader-column h1')?.textContent.trim() ?? null`),

    /** Open an article by clicking its row or card. */
    async open(title) {
      const el = await s.waitFor(() => s.byText("article", title), `the article "${title}"`)
      await el.click()
      await s.waitFor(async () => (await ctx.readerTitle()) === title, `the reader to show "${title}"`)
    },

    /** The reader's More menu, then one of its items. */
    async more(item) {
      const btn = await s.waitFor(() => s.byLabel("More"), "the More button")
      await btn.click()
      const el = await s.waitFor(() => s.byText('[role="menu"] button', item), `"${item}" in More`)
      await el.click()
    },

    /** A reader toolbar button by its label. */
    async tool(label) {
      const btn = await s.waitFor(() => s.byLabel(label), `the "${label}" button`)
      await btn.click()
    },

    /** Open Settings with the keyboard, on one tab when given. */
    async settings(tab) {
      await s.exec(`document.activeElement?.blur()`)
      await s.press(",")
      await s.waitFor(() => s.exec(`return !!document.getElementById('settings-title')`), "Settings to open")
      await sleep(250)
      if (tab) await ctx.settingsTab(tab)
    },

    /** Switch Settings to a tab by its label. */
    async settingsTab(label) {
      const el = await s.waitFor(
        () => s.exec(
          `return [...document.querySelectorAll('[role=tab]')].find(b => b.textContent.trim() === arguments[0]) ?? null`,
          label,
        ),
        `the ${label} tab`,
      )
      await s.exec(`arguments[0].click()`, el)
      await s.waitFor(
        () => s.exec(`return document.querySelector('[data-settings-heading]')?.textContent === arguments[0]`, label),
        `the ${label} tab to show`,
      )
      await sleep(120)
    },

    /** Open About from the title bar. */
    async about() {
      await (await s.waitFor(() => s.byLabel("Menu"), "the menu button")).click()
      const btn = await s.waitFor(() => s.byText('[role="menu"] button', "About Turbo Reader"), "About in the menu")
      await btn.click()
      await s.waitFor(() => s.exec(`return !!document.getElementById('about-title')`), "About to open")
      await sleep(200)
    },

    async closeAbout() {
      await s.press("Escape")
      await s.waitFor(() => s.exec(`return !document.getElementById('about-title')`), "About to close")
    },

    async closeSettings() {
      await s.press("Escape")
      await s.waitFor(() => s.exec(`return !document.getElementById('settings-title')`), "Settings to close")
    },

    /**
     * Go through the Add Feed dialog: type, Check, optionally pick a folder,
     * Add. Returns { error } when Check or Add refuses, or { added: true }.
     */
    async addFeed(address, { folder, keepOpen = false } = {}) {
      const plus = await s.waitFor(() => s.byLabel("Add feed"), "the add feed button")
      await plus.click()
      const field = await s.waitFor(
        () => s.exec(`return document.querySelector('[aria-label="Feed or site address"]')`),
        "the add feed dialog",
      )
      await s.waitFor(
        () => s.exec(`return document.activeElement === arguments[0]`, field),
        "the address field to take focus",
      )
      await s.type(address)
      const check = await s.byText("[role=dialog] button", "Check")
      await check.click()
      const outcome = await s.waitFor(
        () => s.exec(`return document.querySelector('[data-add-preview]') ? 'preview'
                     : document.querySelector('[data-add-error]')?.textContent ?? null`),
        "the check to finish",
        { timeout: 15000 },
      )
      if (outcome !== "preview") {
        if (!keepOpen) await s.press("Escape")
        return { error: outcome }
      }
      const existing = await s.exec(`return /Already subscribed/.test(document.querySelector('[data-add-preview]').textContent)`)
      if (existing) {
        if (!keepOpen) await s.press("Escape")
        return { existing: true }
      }
      if (folder) {
        await s.exec(
          `const sel = document.querySelector('[role=dialog] select');
           const opt = [...sel.options].find(o => o.textContent === arguments[0]);
           const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
           set.call(sel, opt.value); sel.dispatchEvent(new Event('change', { bubbles: true }));`,
          folder,
        )
      }
      if (keepOpen) return { preview: true }
      const add = await s.byText("[role=dialog] button", "Add feed")
      await add.click()
      await s.waitFor(
        () => s.exec(`return !document.querySelector('[aria-label="Feed or site address"]')`),
        "the dialog to close after adding",
        { timeout: 15000 },
      )
      return { added: true }
    },

    /** The text of the newest toast, or null. */
    toast: () => s.exec(`const t = [...document.querySelectorAll('[data-toast]')].pop(); return t ? t.textContent : null`),

    /** Cancel whatever dialog is open with Escape, and wait for it to go. */
    /** Cancel the topmost dialog with Escape. Settings is a dialog too, so
        wait for the count to drop rather than for none to be left. */
    async cancelDialog() {
      const before = await s.exec(`return document.querySelectorAll('[role=dialog]').length`)
      await s.press("Escape")
      await s.waitFor(
        async () => (await s.exec(`return document.querySelectorAll('[role=dialog]').length`)) < before,
        "the dialog to close",
      )
    },

    /** Click a menu entry by its text, looked up fresh at the moment of the
        click, since an expanding submenu re-renders its siblings. */
    async clickMenu(text) {
      await s.waitFor(
        () => s.exec(
          `const b = [...document.querySelectorAll('[role="menu"] button')]
             .find(b => b.offsetParent !== null && b.getBoundingClientRect().height > 4 && b.textContent.trim().includes(arguments[0]));
           if (!b) return false; b.click(); return true`,
          text,
        ),
        `"${text}" in the menu`,
      )
      await sleep(150)
    },

    /** Make sure a fixture feed is subscribed, whatever earlier tests did. */
    async ensure(p, name) {
      const existing = await ctx.source(name)
      if (existing) return existing
      await s.invoke("add_source", { url: `${base}${p}`, groupId: null })
      await ctx.reloadUi()
      return ctx.source(name)
    },

    async confirmDialog() {
      return ctx.prompt(undefined)
    },

    /** Relaunching the page re-runs every startup read from the same profile.
        WebDriver gives each session a fresh WebView2 profile, so a true restart
        cannot test localStorage; this is the honest substitute. */
    async reloadAndCheck() {
      await sleep(400)
      await ctx.reloadUi()
    },

    /** Visible text anywhere on the page. */
    pageText: () => s.exec(`return document.body.innerText`),

    async waitText(text, what = `"${text}" on screen`, opts) {
      return s.waitFor(async () => (await ctx.pageText()).includes(text), what, opts)
    },

    async waitNoText(text, what = `"${text}" to disappear`, opts) {
      return s.waitFor(async () => !(await ctx.pageText()).includes(text), what, opts)
    },

    /** What the OS clipboard holds right now. */
    clipboard() {
      return execFileSync("powershell", ["-NoProfile", "-Command", "Get-Clipboard"], {
        encoding: "utf8",
      }).trim()
    },

    async shot(name) {
      mkdirSync(ARTIFACTS, { recursive: true })
      writeFileSync(path.join(ARTIFACTS, `${name}.png`), await s.screenshot())
    },
  }
  return ctx
}

/** Wrap a test body so a failure leaves a screenshot behind. */
export function withShot(getCtx, name, fn) {
  return async (t) => {
    try {
      await fn(t)
    } catch (err) {
      const ctx = getCtx()
      if (ctx) await ctx.shot(name.replace(/[^\w-]+/g, "_")).catch(() => undefined)
      throw err
    }
  }
}
