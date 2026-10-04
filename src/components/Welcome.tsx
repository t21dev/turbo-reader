import { useState } from "react"
import { ArrowLeft, ArrowRight, Check, FileUp, Keyboard, Loader2, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTheme, type Mode } from "@/lib/theme"
import { BackgroundPrefs } from "@/components/BackgroundPrefs"

/** A few well-known feeds across subjects, so a new reader has something to
    read within seconds. Each was checked to serve a working feed. */
const STARTERS = [
  { name: "Hacker News", topic: "Tech links and discussion", url: "https://news.ycombinator.com/rss" },
  { name: "The Verge", topic: "Technology news", url: "https://www.theverge.com/rss/index.xml" },
  { name: "Ars Technica", topic: "Science and technology", url: "https://feeds.arstechnica.com/arstechnica/index" },
  { name: "BBC News", topic: "World news", url: "https://feeds.bbci.co.uk/news/rss.xml" },
  { name: "Smashing Magazine", topic: "Web design and development", url: "https://www.smashingmagazine.com/feed/" },
  { name: "xkcd", topic: "A webcomic", url: "https://xkcd.com/atom.xml" },
] as const

const STEPS = ["Your feeds", "A look", "How it runs"] as const

/** Each theme card renders in that theme's own tokens. */
const LOOKS: { mode: Mode; label: string; note: string; scope: string }[] = [
  { mode: "light", label: "Light", note: "Bright and neutral", scope: "light-preview" },
  { mode: "dark", label: "Dark", note: "Easy at night", scope: "dark" },
  { mode: "paper", label: "Paper", note: "Warm, for long reads", scope: "light-preview paper" },
  { mode: "system", label: "System", note: "Follows your computer", scope: "" },
]

/** A small page of the app, drawn in whichever theme the card is scoped to. */
function Preview() {
  return (
    <div className="flex h-full gap-1.5 bg-background p-2">
      <div className="w-1/4 space-y-1 rounded-[3px] bg-card p-1">
        <div className="h-1 w-3/4 rounded-full bg-system" />
        <div className="h-1 w-full rounded-full bg-muted-foreground/40" />
        <div className="h-1 w-2/3 rounded-full bg-muted-foreground/40" />
      </div>
      <div className="flex-1 space-y-1.5 py-0.5">
        <div className="h-1.5 w-2/3 rounded-full bg-foreground/80" />
        <div className="h-1 w-full rounded-full bg-muted-foreground/40" />
        <div className="h-1 w-5/6 rounded-full bg-muted-foreground/40" />
        <div className="h-1 w-3/4 rounded-full bg-muted-foreground/40" />
      </div>
    </div>
  )
}

/**
 * What a fresh install shows instead of an empty page, in three short steps:
 * bring feeds in, pick a look, and choose how the app runs. Every step can be
 * skipped; only reading needs at least one feed.
 */
export function Welcome({
  feedCount,
  onAddFeed,
  onImportOpml,
  onSubscribe,
  onDone,
}: {
  /** Feeds subscribed so far, so step one can say so. */
  feedCount: number
  onAddFeed: () => void
  /** Resolves once the import has finished, or was cancelled. */
  onImportOpml: () => Promise<void>
  /** Subscribes to the given feed addresses and fetches them. */
  onSubscribe: (urls: string[]) => Promise<void>
  /** Leave the welcome for the library. */
  onDone: () => void
}) {
  const theme = useTheme()
  const [step, setStep] = useState(0)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<"import" | "starters" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const last = step === STEPS.length - 1

  function toggle(url: string) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(url)) next.delete(url)
      else next.add(url)
      return next
    })
  }

  async function run(kind: "import" | "starters", work: () => Promise<void>) {
    setBusy(kind)
    setError(null)
    try {
      await work()
      if (kind === "starters") setPicked(new Set())
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="min-h-0 flex-1 overflow-y-auto bg-background" data-welcome>
      <div className="mx-auto flex min-h-full w-full max-w-[640px] flex-col px-6 pb-10 pt-12">
        <header>
          <p className="text-[12px] text-subtle" data-welcome-step>
            Step {step + 1} of {STEPS.length} · {STEPS[step]}
          </p>
          <div className="mt-2 flex gap-1.5" aria-hidden>
            {STEPS.map((s, i) => (
              <span
                key={s}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors duration-300 ease-out",
                  i <= step ? "bg-system" : "bg-border",
                )}
              />
            ))}
          </div>
        </header>

        <div key={step} className="animate-rise mt-9 flex-1">
          {step === 0 && (
            <>
              <h1 className="text-[1.6rem] font-semibold leading-tight tracking-tight">Welcome to Turbo Reader</h1>
              <p className="mt-2 max-w-[52ch] text-[13.5px] leading-relaxed text-muted-foreground">
                Follow the sites you read and their new articles come to you, all in one place. Your feeds and
                articles stay on this computer.
              </p>

              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={onAddFeed}
                  className="row flex flex-col items-start gap-1.5 border border-system/50 bg-card p-4 text-left transition-[border-color,transform] duration-200 ease-out hover:-translate-y-[2px] hover:border-system active:translate-y-0"
                >
                  <span className="flex items-center gap-2 text-[13.5px] font-semibold text-foreground">
                    <Plus size={15} className="text-system" />
                    Add a feed
                  </span>
                  <span className="text-[12px] leading-relaxed text-muted-foreground">
                    Paste a website or feed address. Turbo Reader finds the feed for you.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void run("import", onImportOpml)}
                  disabled={busy !== null}
                  className="row flex flex-col items-start gap-1.5 border border-border bg-card p-4 text-left transition-[border-color,transform] duration-200 ease-out hover:-translate-y-[2px] hover:border-system/60 active:translate-y-0 disabled:opacity-60"
                >
                  <span className="flex items-center gap-2 text-[13.5px] font-semibold text-foreground">
                    {busy === "import" ? (
                      <Loader2 size={15} className="animate-spin text-system" />
                    ) : (
                      <FileUp size={15} className="text-system" />
                    )}
                    Import an OPML file
                  </span>
                  <span className="text-[12px] leading-relaxed text-muted-foreground">
                    Bring your subscriptions from another reader. Most can export one.
                  </span>
                </button>
              </div>

              <h2 className="mt-9 text-[13px] font-semibold tracking-tight">Or start with a few</h2>
              <p className="mt-1 text-[12px] text-muted-foreground">Pick any you like. You can remove them later.</p>
              <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
                {STARTERS.map((s) => {
                  const on = picked.has(s.url)
                  return (
                    <button
                      key={s.url}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggle(s.url)}
                      disabled={busy !== null}
                      className={cn(
                        "row flex items-center gap-3 border px-3 py-2.5 text-left transition-colors duration-150",
                        on ? "border-system bg-elevated" : "border-border hover:bg-secondary",
                      )}
                    >
                      <span
                        className={cn(
                          "grid h-4 w-4 shrink-0 place-items-center rounded-[4px] border transition-colors duration-150",
                          on ? "border-system bg-system text-background" : "border-input",
                        )}
                      >
                        {on && <Check size={11} strokeWidth={3} />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[12.5px] font-medium text-foreground">{s.name}</span>
                        <span className="block truncate text-[11.5px] text-subtle">{s.topic}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  disabled={picked.size === 0 || busy !== null}
                  onClick={() => void run("starters", () => onSubscribe([...picked]))}
                  className="row flex h-9 items-center gap-2 border border-system bg-elevated px-4 text-[12.5px] font-medium text-foreground transition-colors duration-150 hover:bg-secondary disabled:cursor-default disabled:border-border disabled:opacity-50"
                >
                  {busy === "starters" && <Loader2 size={13} className="animate-spin" />}
                  {busy === "starters"
                    ? "Subscribing"
                    : picked.size === 0
                      ? "Choose feeds above"
                      : `Subscribe to ${picked.size} feed${picked.size === 1 ? "" : "s"}`}
                </button>
                {feedCount > 0 && (
                  <span className="animate-rise flex items-center gap-1.5 text-[12px] text-muted-foreground" data-welcome-count>
                    <Check size={13} className="text-system" />
                    {feedCount} feed{feedCount === 1 ? "" : "s"} added
                  </span>
                )}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h1 className="text-[1.6rem] font-semibold leading-tight tracking-tight">Pick a look</h1>
              <p className="mt-2 max-w-[52ch] text-[13.5px] leading-relaxed text-muted-foreground">
                Choose how Turbo Reader looks. Fonts, accent colour and more are in Settings.
              </p>
              <div role="radiogroup" aria-label="Theme" className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {LOOKS.map((l) => {
                  const on = theme.mode === l.mode
                  return (
                    <button
                      key={l.mode}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => theme.set("mode", l.mode)}
                      className={cn(
                        "row flex flex-col gap-2 border p-2 text-left transition-colors duration-150",
                        on ? "border-system bg-elevated" : "border-border hover:bg-secondary",
                      )}
                    >
                      <span className="block h-16 overflow-hidden rounded-[6px] border border-border">
                        {l.mode === "system" ? (
                          <span className="flex h-full">
                            <span className="light-preview block w-1/2 overflow-hidden">
                              <Preview />
                            </span>
                            <span className="dark block w-1/2 overflow-hidden">
                              <Preview />
                            </span>
                          </span>
                        ) : (
                          <span className={cn("block h-full", l.scope)}>
                            <Preview />
                          </span>
                        )}
                      </span>
                      <span className="px-0.5">
                        <span className="block text-[12.5px] font-medium text-foreground">{l.label}</span>
                        <span className="block text-[11px] text-subtle">{l.note}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h1 className="text-[1.6rem] font-semibold leading-tight tracking-tight">How it runs</h1>
              <p className="mt-2 max-w-[52ch] text-[13.5px] leading-relaxed text-muted-foreground">
                All off to start, so it stays light. Change these any time in Settings.
              </p>
              <div className="mt-7 max-w-[520px]">
                <BackgroundPrefs withAgents />
              </div>
              <p className="mt-9 flex items-center gap-2 text-[11.5px] text-subtle">
                <Keyboard size={13} />
                Press <kbd className="font-mono text-foreground">?</kbd> any time for keyboard shortcuts, or{" "}
                <kbd className="font-mono text-foreground">n</kbd> to add a feed.
              </p>
            </>
          )}

          {error && (
            <p role="alert" className="animate-rise mt-4 text-[12px] leading-relaxed text-destructive">
              {error}
            </p>
          )}
        </div>

        <footer className="mt-10 flex items-center justify-between gap-3 border-t border-border pt-5">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="row flex h-9 items-center gap-1.5 px-3 text-[12.5px] text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <ArrowLeft size={14} />
              Back
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-3">
            {last && feedCount === 0 && (
              <span className="text-[11.5px] text-subtle">Add a feed in step 1 to start reading.</span>
            )}
            <button
              type="button"
              disabled={last && feedCount === 0}
              onClick={() => (last ? onDone() : setStep((s) => s + 1))}
              className="row flex h-9 items-center gap-1.5 border border-system bg-elevated px-4 text-[12.5px] font-medium text-foreground transition-colors duration-150 hover:bg-secondary disabled:cursor-default disabled:border-border disabled:opacity-50"
            >
              {last ? "Start reading" : step === 0 && feedCount === 0 ? "Skip for now" : "Next"}
              {!last && <ArrowRight size={14} />}
            </button>
          </div>
        </footer>
      </div>
    </section>
  )
}
