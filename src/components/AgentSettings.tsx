import { useCallback, useEffect, useState } from "react"
import { Check, Copy, KeyRound, Trash2 } from "lucide-react"
import { api, type McpActivity, type McpKey, type McpStatus } from "@/lib/api"
import { cn, relativeTime } from "@/lib/utils"
import type { PromptSpec } from "@/components/Prompt"
import { ListFilter } from "@/components/ListFilter"
import { SkillSettings } from "@/components/SkillSettings"

/** "5m ago", "just now". */
function ago(unixSeconds: number): string {
  const r = relativeTime(unixSeconds)
  return r === "now" ? "just now" : /\d$/.test(r) ? r : `${r} ago`
}

const CLIENTS = ["Claude Code", "Codex", "Claude Desktop", "Cursor"] as const
type Client = (typeof CLIENTS)[number]

/**
 * Settings > AI agents: the MCP server that lets Claude Code, Codex and
 * other agents read the library. Off by default; nothing listens until it is
 * switched on, and keys decide what each agent may do.
 */
export function AgentSettings({ confirm }: { confirm: (spec: PromptSpec) => void }) {
  const [status, setStatus] = useState<McpStatus | null>(null)
  const [keys, setKeys] = useState<McpKey[]>([])
  const [activity, setActivity] = useState<McpActivity[]>([])
  const [activityQuery, setActivityQuery] = useState("")
  // Newest first stays the order: a filter narrows the log, it does not rank it.
  const activityWords = activityQuery.toLowerCase().split(/\s+/).filter(Boolean)
  const shownActivity = activityWords.length
    ? activity.filter((a) => activityWords.every((w) => `${a.key} ${a.tool}`.toLowerCase().includes(w)))
    : activity
  const [lanIps, setLanIps] = useState<string[]>([])
  const [exe, setExe] = useState("")
  const [port, setPort] = useState("")
  const [note, setNote] = useState<string | null>(null)
  const [newName, setNewName] = useState("")
  const [newWrite, setNewWrite] = useState(false)
  const [fresh, setFresh] = useState<string | null>(null)
  const [client, setClient] = useState<Client>("Claude Code")

  const load = useCallback(async () => {
    const [s, k, a] = await Promise.all([api.mcpStatus(), api.mcpKeys(), api.mcpActivity()])
    setStatus(s)
    setPort(String(s.config.port))
    setKeys(k)
    setActivity(a)
  }, [])

  useEffect(() => {
    void load().catch((e) => setNote(String(e)))
    api.mcpLanAddresses().then(setLanIps).catch(() => undefined)
    api.mcpExePath().then(setExe).catch(() => undefined)
  }, [load])

  async function configure(patch: Partial<McpStatus["config"]>) {
    if (!status) return
    setNote(null)
    try {
      const next = await api.mcpConfigure({ ...status.config, ...patch })
      setStatus(next)
      setPort(String(next.config.port))
      if (next.error) setNote(next.error)
    } catch (e) {
      setNote(String(e))
    }
  }

  async function createKey() {
    setNote(null)
    try {
      setFresh(await api.mcpCreateKey(newName, newWrite))
      setNewName("")
      setKeys(await api.mcpKeys())
    } catch (e) {
      setNote(String(e))
    }
  }

  function revoke(k: McpKey) {
    confirm({
      title: `Revoke "${k.name}"?`,
      detail: "Anything using this key loses access at once. This cannot be undone; make a new key to reconnect.",
      confirmLabel: "Revoke",
      destructive: true,
      onConfirm: async () => {
        await api.mcpRevokeKey(k.id)
        setKeys(await api.mcpKeys())
      },
    })
  }

  if (!status) return <p className="text-[12px] text-subtle">Loading</p>
  const on = status.config.enabled
  const local = `http://127.0.0.1:${status.config.port}/mcp`
  const remote = lanIps.map((ip) => `http://${ip}:${status.config.port}/mcp`)
  const key = fresh ?? "<your key>"

  return (
    <div className="space-y-5" data-agent-settings>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p id="mcp-enabled" className="text-[12.5px] font-medium text-foreground">
            Allow AI agents to connect
          </p>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-subtle">
            Lets Claude Code, Codex, Cursor and other agents use your feeds as a news source, over
            MCP. Agents that start Turbo Reader themselves (see below) work without this.
          </p>
        </div>
        <Switch on={on} labelledBy="mcp-enabled" onToggle={() => void configure({ enabled: !on })} />
      </div>

      {on && (
        <div className="space-y-3">
          <p className="text-[11.5px] text-muted-foreground">
            {status.listening ? (
              <>
                Listening at <Code>{local}</Code>
              </>
            ) : (
              "Not listening."
            )}
          </p>
          <div className="flex items-center gap-2">
            <label htmlFor="mcp-port" className="text-[12px] text-muted-foreground">
              Port
            </label>
            <input
              id="mcp-port"
              inputMode="numeric"
              value={port}
              onChange={(e) => setPort(e.target.value.replace(/\D/g, "").slice(0, 5))}
              onBlur={() => {
                const p = Number(port)
                if (p >= 1024 && p <= 65535 && p !== status.config.port) void configure({ port: p })
                else setPort(String(status.config.port))
              }}
              className="h-8 w-20 rounded-md border border-input bg-secondary px-2 font-mono text-[12px] outline-hidden focus:border-system"
            />
          </div>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p id="mcp-lan" className="text-[12.5px] font-medium text-foreground">
                Allow other computers on my network
              </p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-subtle">
                {status.config.lan ? (
                  <>
                    Reachable at {remote.map((u) => <Code key={u}>{u}</Code>)}. Anyone on this network with
                    a key can connect, and traffic is not encrypted: use it only on networks you trust.
                  </>
                ) : (
                  "Off: only programs on this computer can connect."
                )}
              </p>
            </div>
            <Switch
              on={status.config.lan}
              labelledBy="mcp-lan"
              onToggle={() => {
                if (status.config.lan) void configure({ lan: false })
                else
                  confirm({
                    title: "Allow other computers to connect?",
                    detail:
                      "Agents on other machines on this network will be able to connect with a key. Traffic is plain HTTP, so use this only on a network you trust.",
                    confirmLabel: "Allow",
                    onConfirm: () => configure({ lan: true }),
                  })
              }}
            />
          </div>
        </div>
      )}

      {/* Keys */}
      <div>
        <p className="text-[12.5px] font-medium text-foreground">API keys</p>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-subtle">
          Each agent connecting over HTTP needs a key. Read-only keys can search and read; keys with
          write access can also subscribe, star and mark articles read.
        </p>
        <div className="mt-2 flex gap-1.5">
          <input
            aria-label="Key name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && newName.trim() && void createKey()}
            placeholder="Name, e.g. Claude Code on laptop"
            className="h-8 min-w-0 flex-1 rounded-md border border-input bg-secondary px-2.5 text-[12px] outline-hidden placeholder:text-subtle focus:border-system"
          />
          <div role="radiogroup" aria-label="Key access" className="flex rounded-md border border-border p-[2px]">
            {[
              [false, "Read"],
              [true, "Read + write"],
            ].map(([w, label]) => (
              <button
                key={String(w)}
                type="button"
                role="radio"
                aria-checked={newWrite === w}
                onClick={() => setNewWrite(w as boolean)}
                className={cn(
                  "rounded px-2 text-[11px] font-medium",
                  newWrite === w ? "bg-elevated text-foreground" : "text-subtle hover:text-muted-foreground",
                )}
              >
                {label as string}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={!newName.trim()}
            onClick={() => void createKey()}
            className="row flex h-8 items-center gap-1.5 border border-system px-2.5 text-[12px] font-medium text-foreground hover:bg-secondary disabled:border-border disabled:opacity-50"
          >
            <KeyRound size={12} />
            Create
          </button>
        </div>

        {fresh && (
          <div className="mt-2 rounded-md border border-system/50 bg-elevated p-2.5" data-fresh-key>
            <p className="text-[11.5px] text-foreground">
              Copy this key now. It is shown once and not stored anywhere you can see it again.
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all font-mono text-[11.5px] text-foreground">{fresh}</code>
              <CopyButton text={fresh} />
            </div>
          </div>
        )}

        {keys.length > 0 && (
          <ul className="mt-2 divide-y divide-border rounded-md border border-border">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center gap-2 px-2.5 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] text-foreground">{k.name}</p>
                  <p className="font-mono text-[10.5px] text-subtle">
                    {k.prefix}… · {k.write ? "read + write" : "read"} ·{" "}
                    {k.lastUsed ? `used ${ago(k.lastUsed)}` : "never used"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => revoke(k)}
                  title="Revoke"
                  aria-label={`Revoke ${k.name}`}
                  className="row grid h-7 w-7 place-items-center text-subtle hover:bg-secondary hover:text-destructive"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Connecting */}
      <div>
        <p className="text-[12.5px] font-medium text-foreground">Connect an agent</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {CLIENTS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setClient(c)}
              className={cn(
                "rounded-md px-2 py-1 text-[11.5px]",
                client === c ? "bg-elevated text-foreground" : "text-subtle hover:text-muted-foreground",
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <Snippets client={client} url={local} exe={exe} keyText={key} serverOn={on} />
        <p className="mt-2 text-[11px] leading-relaxed text-subtle">
          The full guide, with every tool and an example of each answer, is in docs/mcp.md in the
          Turbo Reader repository.
        </p>
      </div>

      <SkillSettings />

      {/* Activity */}
      <div>
        <div className="flex items-center justify-between">
          <p className="text-[12.5px] font-medium text-foreground">Recent agent activity</p>
          <button type="button" onClick={() => void load()} className="text-[11px] text-subtle hover:text-foreground">
            Refresh
          </button>
        </div>
        {activity.length > 6 && (
          <div className="mt-1.5">
            <ListFilter
              value={activityQuery}
              onChange={setActivityQuery}
              placeholder="Filter by key or tool"
              label="Filter agent activity"
            />
          </div>
        )}
        {activity.length === 0 ? (
          <p className="mt-1 text-[11.5px] text-subtle">No calls yet.</p>
        ) : shownActivity.length === 0 ? (
          <p className="mt-1.5 text-[11.5px] text-subtle">No call matches.</p>
        ) : (
          <ul className="mt-1.5 max-h-40 space-y-0.5 overflow-y-auto font-mono text-[10.5px] text-muted-foreground" data-activity>
            {shownActivity.map((a, i) => (
              <li key={i}>
                {ago(a.at)} · {a.key} · {a.tool}
              </li>
            ))}
          </ul>
        )}
      </div>

      {note && (
        <p role="alert" className="text-[11.5px] leading-relaxed text-destructive">
          {note}
        </p>
      )}
    </div>
  )
}

/** Ready-to-paste setup for each agent. HTTP needs the server on and a key;
    stdio needs neither, because the agent starts Turbo Reader itself. */
function Snippets({ client, url, exe, keyText, serverOn }: { client: Client; url: string; exe: string; keyText: string; serverOn: boolean }) {
  const q = (s: string) => JSON.stringify(s)
  const blocks: { title: string; text: string }[] = []
  if (client === "Claude Code") {
    blocks.push({
      title: "Over HTTP (this app running, with a key)",
      text: `claude mcp add --transport http turbo-reader ${url} --header "Authorization: Bearer ${keyText}"`,
    })
    blocks.push({
      title: "Or let Claude Code start it (read-only; add --allow-write to change things)",
      // A shell command: the path is quoted as-is, not JSON-escaped.
      text: `claude mcp add turbo-reader -- "${exe}" --mcp`,
    })
  } else if (client === "Codex") {
    blocks.push({
      title: "In ~/.codex/config.toml (Codex starts Turbo Reader itself)",
      text: `[mcp_servers.turbo-reader]\ncommand = ${q(exe)}\nargs = ["--mcp"]`,
    })
  } else if (client === "Claude Desktop") {
    blocks.push({
      title: "In claude_desktop_config.json (Settings > Developer > Edit Config)",
      text: JSON.stringify({ mcpServers: { "turbo-reader": { command: exe, args: ["--mcp"] } } }, null, 2),
    })
  } else {
    blocks.push({
      title: "In ~/.cursor/mcp.json (this app running, with a key)",
      text: JSON.stringify({ mcpServers: { "turbo-reader": { url, headers: { Authorization: `Bearer ${keyText}` } } } }, null, 2),
    })
  }
  return (
    <div className="mt-2 space-y-2">
      {blocks.map((b) => (
        <div key={b.title}>
          <p className="text-[11px] text-subtle">{b.title}</p>
          <div className="mt-1 flex items-start gap-2 rounded-md border border-border bg-secondary p-2">
            <pre className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-foreground">{b.text}</pre>
            <CopyButton text={b.text} />
          </div>
        </div>
      ))}
      {!serverOn && client !== "Codex" && client !== "Claude Desktop" && (
        <p className="text-[11px] text-subtle">The HTTP setup needs "Allow AI agents to connect" on.</p>
      )}
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      title="Copy"
      aria-label="Copy"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true)
          window.setTimeout(() => setDone(false), 1500)
        })
      }}
      className="row grid h-7 w-7 shrink-0 place-items-center text-subtle hover:bg-background hover:text-foreground"
    >
      {done ? <Check size={13} className="text-system" /> : <Copy size={13} />}
    </button>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="mx-0.5 break-all font-mono text-[11px] text-foreground">{children}</code>
}

function Switch({ on, labelledBy, onToggle }: { on: boolean; labelledBy: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-labelledby={labelledBy}
      onClick={onToggle}
      className={cn(
        "relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors duration-200 ease-out",
        on ? "border-system bg-system" : "border-border bg-elevated",
      )}
    >
      <span
        className={cn(
          "absolute left-0.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full transition-transform duration-200 ease-out",
          on ? "translate-x-4 bg-background" : "translate-x-0 bg-muted-foreground",
        )}
      />
    </button>
  )
}
