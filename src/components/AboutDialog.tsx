import { useEffect, useState } from "react"
import { ArrowUpCircle, CheckCircle2, Download, Github, MessageSquare, RefreshCw, X } from "lucide-react"
import { getVersion } from "@tauri-apps/api/app"
import { openUrl } from "@tauri-apps/plugin-opener"
import { api, type UpdateCheck } from "@/lib/api"
import type { AppPrefs } from "@/lib/prefs"
import { recordUpdateCheck } from "@/lib/updates"
import { TurboMark } from "@/components/TitleBar"
import { useDismissible } from "@/lib/presence"
import { cn } from "@/lib/utils"

const REPO = "https://github.com/t21dev/turbo-reader"

/**
 * About Turbo Reader: the running version, a check for a newer one, and
 * whether that check also runs at launch. Opened from the title bar.
 */
export function AboutDialog({
  onClose,
  prefs,
  onPrefs,
}: {
  onClose: () => void
  prefs: AppPrefs
  onPrefs: (next: AppPrefs) => void
}) {
  const { closing, dismiss } = useDismissible(onClose)
  const [version, setVersion] = useState<string | null>(null)
  const [update, setUpdate] = useState<UpdateCheck | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    getVersion().then(setVersion).catch(() => undefined)
  }, [])

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => ev.key === "Escape" && dismiss()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [dismiss])

  async function check() {
    setChecking(true)
    setError(null)
    try {
      const result = await api.checkForUpdates()
      setUpdate(result)
      // So the title bar's update pill agrees with what this says.
      recordUpdateCheck(result)
    } catch (err) {
      setError(String(err))
    } finally {
      setChecking(false)
    }
  }

  return (
    <div
      className={cn(
        "absolute inset-0 z-[60] grid place-items-center bg-black/50 p-6",
        closing ? "animate-fade-out" : "animate-fade",
      )}
      onClick={dismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        className={cn(
          "w-full max-w-[440px] overflow-hidden rounded-xl border border-border bg-popover shadow-float",
          closing ? "animate-pop-out" : "animate-pop",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 pb-5 pt-6">
          <div className="flex items-center gap-3.5">
            <div className="grid h-12 w-12 place-items-center rounded-[11px] border border-border bg-background">
              <TurboMark className="h-7 w-7" />
            </div>
            <div>
              <h2 id="about-title" className="text-[16px] font-semibold tracking-tight text-foreground">
                Turbo Reader
              </h2>
              <p className="tabular mt-0.5 text-[12px] text-muted-foreground" data-version>
                Version {version ?? ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={dismiss}
            title="Close (Esc)"
            aria-label="Close"
            className="row grid h-7 w-7 place-items-center text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-6">
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            A fast, small reader for everything you follow. By{" "}
            <button
              type="button"
              onClick={() => void openUrl("https://github.com/t21dev")}
              className="text-foreground underline underline-offset-2 hover:text-system"
            >
              t21 dev
            </button>{" "}
            and{" "}
            <button
              type="button"
              onClick={() => void openUrl("https://github.com/TriptoAfsin")}
              className="text-foreground underline underline-offset-2 hover:text-system"
            >
              TriptoAfsin
            </button>
            . Free and open source under the MIT licence.
          </p>
        </div>

        <div className="mt-5 border-t border-border px-6 py-5">
          <button
            type="button"
            onClick={() => void check()}
            disabled={checking}
            className="row flex h-9 w-full items-center justify-center gap-2 border border-border text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <RefreshCw size={13} className={checking ? "animate-spin" : undefined} />
            {checking ? "Checking" : "Check for updates"}
          </button>

          {update && !error && (
            <div className="animate-rise mt-3" role="status">
              {update.newer ? (
                <>
                  <p className="flex items-start gap-2 text-[12px] leading-relaxed text-foreground">
                    <ArrowUpCircle size={14} className="mt-[1px] shrink-0 text-system" />
                    <span>
                      Version <span className="tabular">{update.latest}</span> is out.
                      {update.published ? ` Published ${update.published}.` : ""} You are on{" "}
                      <span className="tabular">{update.current}</span>.
                    </span>
                  </p>
                  <button
                    type="button"
                    onClick={() => void openUrl(update.url)}
                    className="row mt-2 flex h-9 w-full items-center justify-center gap-2 border border-system bg-elevated text-[12px] text-foreground hover:bg-secondary"
                  >
                    <Download size={13} />
                    Get it from GitHub
                  </button>
                </>
              ) : (
                <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
                  <CheckCircle2 size={14} className="shrink-0 text-system" />
                  Up to date on <span className="tabular">{update.current}</span>.
                </p>
              )}
            </div>
          )}
          {error && (
            <p role="alert" className="animate-rise mt-3 text-[11.5px] leading-relaxed text-destructive">
              {error}
            </p>
          )}

          <div className="mt-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p id="about-launch" className="text-[12.5px] font-medium text-foreground">
                Check at launch
              </p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-subtle">
                Asks GitHub for the newest release when Turbo Reader opens, and shows a note in the
                title bar when there is one. Nothing about your feeds is sent.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs.updateCheck}
              aria-labelledby="about-launch"
              onClick={() => onPrefs({ ...prefs, updateCheck: !prefs.updateCheck })}
              className={cn(
                "relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors duration-200 ease-out",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                prefs.updateCheck ? "border-system bg-system" : "border-border bg-elevated",
              )}
            >
              <span
                className={cn(
                  "absolute left-0.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full transition-transform duration-200 ease-out",
                  prefs.updateCheck ? "translate-x-4 bg-background" : "translate-x-0 bg-muted-foreground",
                )}
              />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={() => void openUrl(REPO)}
            className="row flex h-9 items-center justify-center gap-2 border border-border text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <Github size={13} />
            Source
          </button>
          <button
            type="button"
            onClick={() => void openUrl(`${REPO}/issues/new`)}
            className="row flex h-9 items-center justify-center gap-2 border border-border text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <MessageSquare size={13} />
            Feedback
          </button>
        </div>
      </div>
    </div>
  )
}
