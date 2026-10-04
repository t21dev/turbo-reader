import { useEffect, useRef, useState } from "react"
import { AlertCircle, CheckCircle2, Loader2, Rss, Search } from "lucide-react"
import { api, type Group, type SourcePreview } from "@/lib/api"
import { reason } from "@/lib/notify"
import { useDismissible } from "@/lib/presence"
import { cn, relativeTime } from "@/lib/utils"

type Props = {
  open: boolean
  groups: Group[]
  /** The folder to preselect, usually the one being looked at. */
  defaultGroupId: number | null
  onClose: () => void
  /** Called with the new feed's id once it is saved and fetched. */
  onAdded: (id: number) => void
  /** Called when the address is already subscribed and the user wants to see it. */
  onShowExisting: (id: number) => void
}

type State =
  | { step: "idle" }
  | { step: "checking" }
  | { step: "found"; preview: SourcePreview }
  | { step: "error"; message: string }
  | { step: "adding"; preview: SourcePreview }

/**
 * Adding a feed is two steps: Check, then Add.
 *
 * Check resolves whatever was typed, a feed, a site that links to one, or a
 * bare domain, and shows what it found: the feed's name, how many articles it
 * has, its latest few titles, and whether it is already subscribed. Nothing is
 * saved until Add, so a wrong guess costs nothing.
 */
export function AddFeedDialog(props: Props) {
  if (!props.open) return null
  return <Body {...props} />
}

function Body({ groups, defaultGroupId, onClose, onAdded, onShowExisting }: Props) {
  const [url, setUrl] = useState("")
  const [groupId, setGroupId] = useState<number | null>(defaultGroupId)
  const [state, setState] = useState<State>({ step: "idle" })
  const input = useRef<HTMLInputElement>(null)
  const addBtn = useRef<HTMLButtonElement>(null)
  const { closing, dismiss } = useDismissible(onClose)
  // A check that finishes after the address changed must not overwrite the
  // result for the new address.
  const checkId = useRef(0)

  useEffect(() => {
    const t = window.setTimeout(() => input.current?.focus(), 30)
    return () => window.clearTimeout(t)
  }, [])

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.stopPropagation()
        dismiss()
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [dismiss])

  const busy = state.step === "checking" || state.step === "adding"
  const preview = state.step === "found" || state.step === "adding" ? state.preview : null
  const canAdd = !!preview && !preview.existing && state.step === "found"

  async function check() {
    const value = url.trim()
    if (!value || busy) return
    const id = ++checkId.current
    setState({ step: "checking" })
    try {
      const found = await api.previewSource(value)
      if (id !== checkId.current) return
      setState({ step: "found", preview: found })
      // Ready for Enter to confirm, unless there is nothing to add.
      if (!found.existing) window.setTimeout(() => addBtn.current?.focus(), 30)
    } catch (err) {
      if (id !== checkId.current) return
      setState({ step: "error", message: reason(err) })
    }
  }

  async function add() {
    if (!preview || preview.existing) return
    setState({ step: "adding", preview })
    try {
      const id = await api.addSource(preview.url, groupId)
      onAdded(id)
      dismiss()
    } catch (err) {
      setState({ step: "error", message: reason(err) })
    }
  }

  return (
    <div
      className={cn(
        "absolute inset-0 z-80 grid place-items-center bg-black/50 p-6",
        closing ? "animate-fade-out" : "animate-fade",
      )}
      onClick={dismiss}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-feed-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          // Enter checks first, and adds once a check has found something.
          if (canAdd) void add()
          else void check()
        }}
        className={cn(
          "w-full max-w-[460px] overflow-hidden rounded-xl border border-border bg-popover shadow-float",
          closing ? "animate-pop-out" : "animate-pop",
        )}
      >
        <div className="px-5 pb-4 pt-4">
          <h2 id="add-feed-title" className="text-[13.5px] font-semibold tracking-tight">
            Add a feed
          </h2>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            Paste a feed address, or just the site. Turbo Reader finds the feed a site
            advertises.
          </p>

          <div className="mt-3.5 flex gap-1.5">
            <input
              ref={input}
              value={url}
              onChange={(e) => {
                setUrl(e.target.value)
                // Editing the address invalidates whatever was found for the old one.
                if (state.step !== "idle") {
                  checkId.current++
                  setState({ step: "idle" })
                }
              }}
              placeholder="example.com or https://example.com/feed"
              aria-label="Feed or site address"
              spellCheck={false}
              autoComplete="off"
              className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-secondary px-2.5 font-mono text-[12px] outline-hidden transition-colors duration-150 ease-out placeholder:text-subtle focus:border-system"
            />
            <button
              type="button"
              onClick={() => void check()}
              disabled={!url.trim() || busy}
              className="row flex h-9 shrink-0 items-center gap-1.5 border border-border px-3 text-[12px] text-foreground hover:bg-secondary disabled:opacity-40"
            >
              {state.step === "checking" ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Search size={13} />
              )}
              Check
            </button>
          </div>

          {state.step === "error" && (
            <p
              role="alert"
              data-add-error
              className="animate-rise mt-3 flex items-start gap-2 text-[12px] leading-relaxed text-destructive"
            >
              <AlertCircle size={14} className="mt-px shrink-0" />
              {state.message}
            </p>
          )}

          {preview && (
            <div data-add-preview className="animate-rise mt-3.5 rounded-lg border border-border bg-background p-3">
              <div className="flex items-start gap-2.5">
                <span className="mt-px grid h-7 w-7 shrink-0 place-items-center rounded-md bg-secondary text-system">
                  <Rss size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-foreground">{preview.title}</p>
                  <p className="truncate font-mono text-[11px] text-subtle">{preview.url}</p>
                  <p className="mt-1 text-[11.5px] text-muted-foreground">
                    {preview.itemCount === 0
                      ? "No articles yet"
                      : `${preview.itemCount} article${preview.itemCount === 1 ? "" : "s"}`}
                    {preview.discovered && " · found on the page you entered"}
                  </p>
                </div>
              </div>

              {preview.latest.length > 0 && (
                <ul className="mt-2.5 space-y-1 border-t border-border pt-2.5">
                  {preview.latest.map((it, i) => (
                    <li key={i} className="flex items-baseline gap-2 text-[12px]">
                      <span className="min-w-0 flex-1 truncate text-foreground/90">{it.title}</span>
                      <span className="tabular shrink-0 text-[11px] text-subtle">
                        {relativeTime(it.published)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {preview.existing ? (
                <p className="mt-2.5 flex items-center gap-2 border-t border-border pt-2.5 text-[12px] text-muted-foreground">
                  <CheckCircle2 size={14} className="shrink-0 text-system" />
                  <span className="min-w-0 flex-1">
                    Already subscribed as <span className="text-foreground">{preview.existing.name}</span>.
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onShowExisting(preview.existing!.id)
                      dismiss()
                    }}
                    className="shrink-0 text-system underline underline-offset-2"
                  >
                    Show it
                  </button>
                </p>
              ) : (
                <label className="mt-2.5 flex items-center gap-2 border-t border-border pt-2.5 text-[12px] text-muted-foreground">
                  <span className="shrink-0">Folder</span>
                  <select
                    value={groupId ?? ""}
                    onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : null)}
                    className="h-8 min-w-0 flex-1 rounded-md border border-border bg-secondary px-2 text-[12px] text-foreground outline-hidden focus:border-system"
                  >
                    <option value="">No folder</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-1.5 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={dismiss}
            className="row h-8 px-3 text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            Cancel
          </button>
          <button
            ref={addBtn}
            type="button"
            onClick={() => void add()}
            disabled={!canAdd}
            title={preview ? undefined : "Check the address first"}
            className={cn(
              "row flex h-8 items-center gap-1.5 bg-primary px-3 text-[12px] font-medium text-primary-foreground",
              "transition-[background-color,scale] duration-150 ease-out hover:bg-primary/90 active:scale-[0.97]",
              "disabled:opacity-40 disabled:active:scale-100",
            )}
          >
            {state.step === "adding" && <Loader2 size={13} className="animate-spin" />}
            Add feed
          </button>
        </div>
      </form>
    </div>
  )
}
