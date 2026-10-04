// Minimal MCP clients for the tests: stdio (newline-delimited JSON-RPC) and
// Streamable HTTP (JSON-RPC over POST, answered as JSON or as one SSE event).
import { spawn } from "node:child_process"

const PROTOCOL = "2025-06-18"

export class StdioClient {
  constructor(exe, args) {
    this.proc = spawn(exe, args, { stdio: ["pipe", "pipe", "pipe"] })
    this.id = 0
    this.pending = new Map()
    this.stderr = ""
    let buf = ""
    this.proc.stdout.on("data", (d) => {
      buf += d.toString()
      let i
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim()
        buf = buf.slice(i + 1)
        if (!line) continue
        const msg = JSON.parse(line)
        if (msg.id != null && this.pending.has(msg.id)) {
          this.pending.get(msg.id)(msg)
          this.pending.delete(msg.id)
        }
      }
    })
    this.proc.stderr.on("data", (d) => (this.stderr += d.toString()))
  }
  send(msg) {
    this.proc.stdin.write(JSON.stringify(msg) + "\n")
  }
  request(method, params = {}, timeout = 20000) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`no answer to ${method}; stderr: ${this.stderr}`)), timeout)
      this.pending.set(id, (m) => {
        clearTimeout(t)
        resolve(m)
      })
      this.send({ jsonrpc: "2.0", id, method, params })
    })
  }
  async initialize() {
    const r = await this.request("initialize", {
      protocolVersion: PROTOCOL,
      capabilities: {},
      clientInfo: { name: "turbo-e2e", version: "1" },
    })
    this.send({ jsonrpc: "2.0", method: "notifications/initialized" })
    return r
  }
  call(name, args = {}) {
    return this.request("tools/call", { name, arguments: args })
  }
  close() {
    this.proc.stdin.end()
    this.proc.kill()
  }
}

export class HttpClient {
  constructor(url, headers = {}) {
    this.url = url
    this.headers = headers
    this.id = 0
    this.session = null
  }
  async post(body, extra = {}) {
    const res = await fetch(this.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...(this.session ? { "mcp-session-id": this.session } : {}),
        ...(this.session ? { "mcp-protocol-version": PROTOCOL } : {}),
        ...this.headers,
        ...extra,
      },
      body: JSON.stringify(body),
    })
    const sid = res.headers.get("mcp-session-id")
    if (sid) this.session = sid
    const text = await res.text()
    let json = null
    if (res.headers.get("content-type")?.includes("text/event-stream")) {
      const data = text
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .filter(Boolean)
        .pop()
      json = data ? JSON.parse(data) : null
    } else if (text && res.headers.get("content-type")?.includes("json")) {
      json = JSON.parse(text)
    }
    return { status: res.status, json, text }
  }
  request(method, params = {}, extra) {
    return this.post({ jsonrpc: "2.0", id: ++this.id, method, params }, extra)
  }
  async initialize(extra) {
    const r = await this.request(
      "initialize",
      { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: "turbo-e2e", version: "1" } },
      extra,
    )
    if (r.status === 200) await this.post({ jsonrpc: "2.0", method: "notifications/initialized" }, extra)
    return r
  }
  call(name, args = {}) {
    return this.request("tools/call", { name, arguments: args })
  }
}

/** The structured result of a tools/call, or its error message. */
export function result(msg) {
  if (msg.error) return { error: msg.error.message }
  const r = msg.result
  if (r?.isError) return { error: r.content?.map((c) => c.text).join(" ") }
  return r?.structuredContent ?? JSON.parse(r.content[0].text)
}
