import { useEffect } from "react"
import { useDismissible } from "@/lib/presence"
import { cn } from "@/lib/utils"

/**
 * An article opened from home, in a full-height panel over it. Closing it
 * puts the reader back where they were on home, scroll position and all,
 * which leaving home for the article view could not do.
 */
export function HomeReader({
  onClose,
  covered,
  children,
}: {
  onClose: () => void
  /** Another dialog is open over this one, and Escape is its to take. */
  covered: boolean
  /** The reader, given a close button wired to `dismiss`. */
  children: (dismiss: () => void) => React.ReactNode
}) {
  const { closing, dismiss } = useDismissible(onClose)

  // Menus and the lightbox inside the reader take Escape first, in the
  // capture phase. A dialog over the panel, like Settings, closes on the same
  // keypress, so the panel waits until it is the one on top.
  useEffect(() => {
    if (covered) return
    const onKey = (ev: KeyboardEvent) => ev.key === "Escape" && dismiss()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [dismiss, covered])

  return (
    <div
      className={cn(
        "absolute inset-0 z-40 flex justify-center bg-black/50 p-4",
        closing ? "animate-fade-out" : "animate-fade",
      )}
      onClick={dismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Article"
        className={cn(
          "flex h-full w-[min(920px,100%)] overflow-hidden rounded-xl border border-border bg-background shadow-float",
          closing ? "animate-pop-out" : "animate-pop",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {children(dismiss)}
      </div>
    </div>
  )
}
