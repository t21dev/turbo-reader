import { useState } from "react"
import { Check, FileUp, Keyboard, Loader2, Plus } from "lucide-react"
import { cn } from "@/lib/utils"

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

/**
 * What a fresh install shows instead of an empty page: the two ways to bring
 * feeds in, and a handful of starters to subscribe to in one go.
 */
export function Welcome({
  onAddFeed,
  onImportOpml,
  onSubscribe,
}: {
  onAddFeed: () => void
  /** Resolves once the import has finished, or was cancelled. */
  onImportOpml: () => Promise<void>
  /** Subscribes to the given feed addresses and fetches them. */
  onSubscribe: (urls: string[]) => Promise<void>
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<"import" | "starters" | null>(null)
  const [error, setError] = useState<string | null>(null)

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
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="min-h-0 flex-1 overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-[640px] px-6 pb-16 pt-14">
        <header className="animate-rise">
          <h1 className="text-[1.6rem] font-semibold leading-tight tracking-tight">
            Welcome to Turbo Reader
          </h1>
          <p className="mt-2 max-w-[52ch] text-[13.5px] leading-relaxed text-muted-foreground">
            Follow the sites you read and their new articles come to you, all in one place. Your
            feeds and articles stay on this computer.
          </p>
        </header>

        <div className="animate-rise mt-8 grid gap-3 sm:grid-cols-2" style={{ animationDelay: "40ms" }}>
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

        <div className="animate-rise mt-10" style={{ animationDelay: "80ms" }}>
          <h2 className="text-[13px] font-semibold tracking-tight">Or start with a few</h2>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Pick any you like. You can remove them later from the sidebar.
          </p>
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
                    <span className="block truncate text-[12.5px] font-medium text-foreground">
                      {s.name}
                    </span>
                    <span className="block truncate text-[11.5px] text-subtle">{s.topic}</span>
                  </span>
                </button>
              )
            })}
          </div>
          <button
            type="button"
            disabled={picked.size === 0 || busy !== null}
            onClick={() => void run("starters", () => onSubscribe([...picked]))}
            className="row mt-3 flex h-9 items-center gap-2 border border-system bg-elevated px-4 text-[12.5px] font-medium text-foreground transition-colors duration-150 hover:bg-secondary disabled:cursor-default disabled:border-border disabled:opacity-50"
          >
            {busy === "starters" && <Loader2 size={13} className="animate-spin" />}
            {busy === "starters"
              ? "Subscribing"
              : picked.size === 0
                ? "Choose feeds above"
                : `Subscribe to ${picked.size} feed${picked.size === 1 ? "" : "s"}`}
          </button>
        </div>

        {error && (
          <p role="alert" className="animate-rise mt-4 text-[12px] leading-relaxed text-destructive">
            {error}
          </p>
        )}

        <p className="animate-rise mt-12 flex items-center gap-2 text-[11.5px] text-subtle" style={{ animationDelay: "120ms" }}>
          <Keyboard size={13} />
          Press <kbd className="font-mono text-foreground">?</kbd> any time for keyboard shortcuts, or{" "}
          <kbd className="font-mono text-foreground">n</kbd> to add a feed.
        </p>
      </div>
    </section>
  )
}
