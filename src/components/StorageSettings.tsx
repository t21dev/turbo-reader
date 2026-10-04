import { useEffect, useState } from "react"
import { api, type OldRead, type StorageInfo } from "@/lib/api"
import type { PromptSpec } from "@/components/Prompt"
import { cn } from "@/lib/utils"

const AGES = [30, 90, 180] as const

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

/**
 * Settings > Storage: what the library and the webview take on disk, and four
 * ways to give space back. Every action that deletes something asks first;
 * compacting deletes nothing.
 */
export function StorageSettings({
  confirm,
  onChanged,
}: {
  confirm: (spec: PromptSpec) => void
  /** Articles were removed or changed, so lists and counts are stale. */
  onChanged: () => void
}) {
  const [info, setInfo] = useState<StorageInfo | null>(null)
  const [age, setAge] = useState<(typeof AGES)[number]>(90)
  const [old, setOld] = useState<OldRead | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    api.storageInfo().then(setInfo).catch((err) => setNote(String(err)))
  }, [])

  useEffect(() => {
    setOld(null)
    api.storageOldRead(age).then(setOld).catch(() => undefined)
  }, [age, info])

  async function run(key: string, fn: () => Promise<string>) {
    setBusy(key)
    setNote(null)
    try {
      setNote(await fn())
      setInfo(await api.storageInfo())
    } catch (err) {
      setNote(String(err))
    } finally {
      setBusy(null)
    }
  }

  function compact() {
    void run("compact", async () => {
      const before = info?.dbBytes ?? 0
      const after = await api.storageCompact()
      const saved = Math.max(before - after.dbBytes, 0)
      return saved > 0 ? `Compacted. ${formatBytes(saved)} freed.` : "Compacted. Nothing to free."
    })
  }

  function clearFull() {
    if (!info) return
    confirm({
      title: "Remove downloaded full articles?",
      detail: `${info.fullCount.toLocaleString()} article${info.fullCount === 1 ? "" : "s"} go back to the text their feed sent. You can load the full article again at any time.`,
      confirmLabel: "Remove",
      destructive: true,
      onConfirm: () =>
        run("full", async () => {
          const n = await api.storageClearFull()
          onChanged()
          return `${n.toLocaleString()} article${n === 1 ? "" : "s"} back to the feed's text.`
        }),
    })
  }

  function deleteOld() {
    if (!old || old.count === 0) return
    confirm({
      title: `Delete ${old.count.toLocaleString()} read article${old.count === 1 ? "" : "s"}?`,
      detail: `Read articles published more than ${age} days ago. Starred and unread articles are kept, and deleted ones will not come back when their feed refreshes. This cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: () =>
        run("old", async () => {
          const n = await api.storageDeleteOldRead(age)
          onChanged()
          return `${n.toLocaleString()} article${n === 1 ? "" : "s"} deleted. Compact the database to give the space back.`
        }),
    })
  }

  function clearWebview(on: boolean) {
    void run("webview", async () => {
      await api.storageClearWebview(on)
      return on ? "The cache is cleared the next time Turbo Reader starts." : "Cancelled."
    })
  }

  if (!info) {
    return note ? <Alert text={note} /> : <p className="text-[12px] text-subtle">Measuring</p>
  }

  return (
    <div className="space-y-4" data-storage>
      <Row
        id="st-db"
        title="Compact the database"
        detail="Gives back the space left by deleted articles and tidies the search index. Nothing is deleted."
        size={`${formatBytes(info.dbBytes)}${info.reclaimableBytes > 0 ? `, ${formatBytes(info.reclaimableBytes)} free inside` : ""}`}
      >
        <Action busy={busy === "compact"} disabled={!!busy} onClick={compact}>
          {busy === "compact" ? "Compacting" : "Compact"}
        </Action>
      </Row>

      <Row
        id="st-full"
        title="Downloaded full articles"
        detail="Full text fetched with Load full content. Removing it puts back what the feed sent. Articles downloaded before version 0.10 cannot be put back and are not counted."
        size={
          info.fullCount > 0
            ? `${info.fullCount.toLocaleString()} article${info.fullCount === 1 ? "" : "s"}, ${formatBytes(info.fullBytes)}`
            : "None"
        }
      >
        <Action tone="destructive" busy={busy === "full"} disabled={!!busy || info.fullCount === 0} onClick={clearFull}>
          Remove
        </Action>
      </Row>

      <Row
        id="st-old"
        title="Old read articles"
        detail="Read articles published before the age you pick. Starred and unread articles always stay."
        below
      >
        <div
          role="radiogroup"
          aria-label="Older than"
          className="mt-2.5 grid grid-cols-3 gap-0.5 rounded-lg border border-border bg-background p-[3px]"
        >
          {AGES.map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={age === d}
              onClick={() => setAge(d)}
              className={cn(
                "flex h-8 items-center justify-center rounded-md px-2 text-[12px] font-medium leading-none",
                "transition-[background-color,color,scale] duration-200 ease-out active:scale-[0.96]",
                "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50",
                age === d ? "bg-elevated text-foreground" : "text-subtle hover:text-muted-foreground",
              )}
            >
              {d} days
            </button>
          ))}
        </div>
        <div className="mt-2.5 flex items-center justify-between gap-3">
          <p className="tabular min-w-0 text-[12px] text-muted-foreground" data-old-summary>
            {!old
              ? "Counting"
              : old.count === 0
                ? `No read articles older than ${age} days.`
                : `${old.count.toLocaleString()} article${old.count === 1 ? "" : "s"}, about ${formatBytes(old.bytes)}`}
          </p>
          <Action
            tone="destructive"
            busy={busy === "old"}
            disabled={!!busy || !old || old.count === 0}
            onClick={deleteOld}
          >
            {old && old.count > 0 ? `Delete ${old.count.toLocaleString()}` : "Delete"}
          </Action>
        </div>
      </Row>

      <Row
        id="st-webview"
        title="Webview cache"
        detail="Images and page files the built-in browser keeps. Safe to clear, though pictures load a little slower for a while. Your settings are kept."
        size={info.webviewPending ? "Clears at next start" : formatBytes(info.webviewBytes)}
      >
        {info.webviewPending ? (
          <div className="flex shrink-0 gap-1.5">
            <Action disabled={!!busy} onClick={() => clearWebview(false)}>
              Cancel
            </Action>
            <Action tone="primary" disabled={!!busy} onClick={() => void api.restartApp()}>
              Restart now
            </Action>
          </div>
        ) : (
          <Action busy={busy === "webview"} disabled={!!busy || info.webviewBytes === 0} onClick={() => clearWebview(true)}>
            Clear
          </Action>
        )}
      </Row>

      {note && (
        <p role="status" className="animate-rise text-[11.5px] leading-relaxed text-muted-foreground">
          {note}
        </p>
      )}
    </div>
  )
}

function Row({
  id,
  title,
  detail,
  size,
  below = false,
  children,
}: {
  id: string
  title: string
  detail: string
  /** Shown beside the title. Rows that summarise below leave it out. */
  size?: string
  /** Controls too wide to sit beside the text go under it. */
  below?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={below ? "block" : "flex items-start justify-between gap-4"}
      aria-labelledby={id}
      role="group"
    >
      <div className="min-w-0">
        <p id={id} className="flex items-baseline gap-2 text-[12.5px] font-medium text-foreground">
          {title}
          {size !== undefined && (
            <span className="tabular text-[11.5px] font-normal text-muted-foreground" data-size>
              {size}
            </span>
          )}
        </p>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-subtle">{detail}</p>
      </div>
      {children}
    </div>
  )
}

function Action({
  busy,
  disabled,
  tone = "default",
  onClick,
  children,
}: {
  busy?: boolean
  disabled?: boolean
  /** Destructive is for anything that deletes or cannot be undone. */
  tone?: "default" | "primary" | "destructive"
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={busy || undefined}
      className={cn(
        "row h-8 shrink-0 border px-3 text-[12px] font-medium disabled:opacity-50",
        "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50",
        tone === "primary" && "border-system bg-elevated text-foreground hover:bg-secondary",
        tone === "destructive" &&
          "border-destructive/40 text-destructive hover:border-destructive/70 hover:bg-destructive/10 disabled:hover:bg-transparent",
        tone === "default" && "border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}

function Alert({ text }: { text: string }) {
  return (
    <p role="alert" className="text-[11.5px] leading-relaxed text-destructive">
      {text}
    </p>
  )
}
