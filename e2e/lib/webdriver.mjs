// A small W3C WebDriver client. Enough for real clicks, real keys, real
// right-clicks and script execution, with no dependencies to install or keep
// current.

const ELEMENT = "element-6066-11e4-a52e-4f735466cecf"

export class WebDriverError extends Error {}

export class Session {
  constructor(base, id) {
    this.base = base
    this.id = id
  }

  static async create(base, capabilities) {
    const res = await call(base, "POST", "/session", {
      capabilities: { alwaysMatch: capabilities },
    })
    return new Session(base, res.sessionId)
  }

  cmd(method, path, body) {
    return call(this.base, method, `/session/${this.id}${path}`, body)
  }

  close() {
    return this.cmd("DELETE", "").catch(() => undefined)
  }

  /* -------------------------------- script ------------------------------- */

  /** Run a function body in the page. `arguments` holds args. */
  exec(script, ...args) {
    return this.cmd("POST", "/execute/sync", { script, args: args.map(ref) })
  }

  /** Same, with a callback as the last argument. */
  execAsync(script, ...args) {
    return this.cmd("POST", "/execute/async", { script, args: args.map(ref) })
  }

  /** Call a Tauri command from inside the page: the real IPC, the real backend. */
  async invoke(cmd, args = {}) {
    const r = await this.execAsync(
      `const [cmd, args, done] = arguments;
       window.__TAURI_INTERNALS__.invoke(cmd, args)
         .then(v => done({ ok: v === undefined ? null : v }), e => done({ err: String(e) }))`,
      cmd,
      args,
    )
    if (r && "err" in r) throw new WebDriverError(`invoke ${cmd} failed: ${r.err}`)
    return r.ok
  }

  /** Like invoke, but returns the error message instead of throwing. */
  async invokeResult(cmd, args = {}) {
    try {
      return { ok: await this.invoke(cmd, args) }
    } catch (e) {
      return { err: e.message }
    }
  }

  /* ------------------------------- elements ------------------------------ */

  async find(css) {
    const r = await this.cmd("POST", "/element", { using: "css selector", value: css })
    return new El(this, r[ELEMENT])
  }

  async findAll(css) {
    const r = await this.cmd("POST", "/elements", { using: "css selector", value: css })
    return r.map((x) => new El(this, x[ELEMENT]))
  }

  /** The first visible element matching `css` whose text contains `text`. */
  async byText(css, text) {
    const r = await this.exec(
      `const [css, text] = arguments;
       return [...document.querySelectorAll(css)].find(el =>
         el.offsetParent !== null && el.textContent.trim().includes(text)) ?? null`,
      css,
      text,
    )
    return r ? new El(this, r[ELEMENT]) : null
  }

  /** The visible element whose title or aria-label starts with `label`. */
  async byLabel(label) {
    const r = await this.exec(
      `const [label] = arguments;
       return [...document.querySelectorAll('[title],[aria-label]')].find(el =>
         el.offsetParent !== null &&
         ((el.getAttribute('title') ?? '').startsWith(label) ||
          (el.getAttribute('aria-label') ?? '').startsWith(label))) ?? null`,
      label,
    )
    return r ? new El(this, r[ELEMENT]) : null
  }

  /* -------------------------------- input -------------------------------- */

  /** Press a key, with optional modifiers, against whatever has focus. */
  async press(key, { ctrl = false, shift = false } = {}) {
    const k = KEYS[key] ?? key
    const down = []
    const up = []
    if (ctrl) down.push({ type: "keyDown", value: KEYS.Control })
    if (shift) down.push({ type: "keyDown", value: KEYS.Shift })
    down.push({ type: "keyDown", value: k })
    up.push({ type: "keyUp", value: k })
    if (shift) up.push({ type: "keyUp", value: KEYS.Shift })
    if (ctrl) up.push({ type: "keyUp", value: KEYS.Control })
    await this.cmd("POST", "/actions", {
      actions: [{ type: "key", id: "kb", actions: [...down, ...up] }],
    })
    await this.cmd("DELETE", "/actions")
  }

  async type(text) {
    const actions = []
    for (const ch of text) {
      actions.push({ type: "keyDown", value: ch }, { type: "keyUp", value: ch })
    }
    await this.cmd("POST", "/actions", { actions: [{ type: "key", id: "kb", actions }] })
    await this.cmd("DELETE", "/actions")
  }

  async screenshot() {
    return Buffer.from(await this.cmd("GET", "/screenshot"), "base64")
  }

  /* -------------------------------- waits -------------------------------- */

  /** Poll `fn` until it returns something truthy, or fail with `what`. */
  async waitFor(fn, what, { timeout = 8000, every = 120 } = {}) {
    const end = Date.now() + timeout
    let last
    while (Date.now() < end) {
      try {
        last = await fn()
        if (last) return last
      } catch (e) {
        last = e
      }
      await sleep(every)
    }
    throw new WebDriverError(
      `timed out waiting for ${what}${last instanceof Error ? `: ${last.message}` : ""}`,
    )
  }
}

export class El {
  constructor(session, id) {
    this.s = session
    this.id = id
  }

  /** Click, retrying briefly while the element is still animating into place. */
  async click() {
    const end = Date.now() + 3000
    for (;;) {
      try {
        return await this.s.cmd("POST", `/element/${this.id}/click`, {})
      } catch (e) {
        const retry = /not interactable|click intercepted/i.test(e.message)
        if (!retry || Date.now() > end) throw e
        await sleep(100)
      }
    }
  }

  async rightClick() {
    await this.s.cmd("POST", "/actions", {
      actions: [
        {
          type: "pointer",
          id: "mouse",
          parameters: { pointerType: "mouse" },
          actions: [
            { type: "pointerMove", duration: 0, origin: { [ELEMENT]: this.id }, x: 0, y: 0 },
            { type: "pointerDown", button: 2 },
            { type: "pointerUp", button: 2 },
          ],
        },
      ],
    })
    await this.s.cmd("DELETE", "/actions")
  }

  async doubleClick() {
    await this.s.cmd("POST", "/actions", {
      actions: [
        {
          type: "pointer",
          id: "mouse",
          parameters: { pointerType: "mouse" },
          actions: [
            { type: "pointerMove", duration: 0, origin: { [ELEMENT]: this.id }, x: 0, y: 0 },
            { type: "pointerDown", button: 0 },
            { type: "pointerUp", button: 0 },
            { type: "pointerDown", button: 0 },
            { type: "pointerUp", button: 0 },
          ],
        },
      ],
    })
    await this.s.cmd("DELETE", "/actions")
  }

  text() {
    return this.s.cmd("GET", `/element/${this.id}/text`)
  }

  attr(name) {
    return this.s.cmd("GET", `/element/${this.id}/attribute/${name}`)
  }

  prop(name) {
    return this.s.cmd("GET", `/element/${this.id}/property/${name}`)
  }

  clear() {
    return this.s.cmd("POST", `/element/${this.id}/clear`, {})
  }

  sendKeys(text) {
    return this.s.cmd("POST", `/element/${this.id}/value`, { text })
  }
}

/* --------------------------------- plumbing -------------------------------- */

/** El instances travel to the page as WebDriver element references. */
function ref(arg) {
  if (arg instanceof El) return { [ELEMENT]: arg.id }
  if (arg && typeof arg === "object" && ELEMENT in arg) return arg
  return arg
}

// WebDriver key codes for the non-printing keys the suite uses.
export const KEYS = {
  Enter: "",
  Escape: "",
  Backspace: "",
  Tab: "",
  ArrowDown: "",
  ArrowUp: "",
  Control: "",
  Shift: "",
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function call(base, method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json?.value?.error) {
    const v = json?.value ?? {}
    throw new WebDriverError(`${method} ${path}: ${v.error ?? res.status} ${v.message ?? ""}`.trim())
  }
  return json.value
}
