import { useEffect, useState, type ReactNode } from "react"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { openUrl } from "@tauri-apps/plugin-opener"
import { ArrowUpCircle, PanelLeftClose, PanelLeftOpen, RefreshCw } from "lucide-react"
import { isMac } from "@/lib/platform"
import { cn } from "@/lib/utils"

const appWindow = getCurrentWindow()

/** How far the pointer must travel with the button held before the window moves. */
const DRAG_THRESHOLD = 4

export function TitleBar({
  children,
  unread,
  busy,
  sidebarOpen,
  onToggleSidebar,
  update,
  onRefresh,
}: {
  children?: ReactNode
  unread: number
  busy: boolean
  sidebarOpen: boolean
  onToggleSidebar: () => void
  /** A newer release, shown as a pill that opens its page. */
  update?: { latest: string; url: string } | null
  /** Fetch every feed now; sits beside the unread count. */
  onRefresh?: () => void
}) {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    const check = async () => {
      try {
        setIsMaximized(await appWindow.isMaximized())
      } catch {
        /* window gone */
      }
    }
    void check()
    const unlisten = appWindow.onResized(check)
    return () => {
      void unlisten.then((fn) => fn())
    }
  }, [])

  /** True for the parts of the bar that should move the window, so a click on
      a control is never mistaken for a grab. */
  const isDragSurface = (ev: React.MouseEvent) =>
    !(ev.target as HTMLElement).closest("button, input, a, [role='menu']")

  // Dragging and double-click-to-maximize are wired explicitly rather than
  // left to `data-tauri-drag-region`. The injected handler does not fire
  // reliably once the bar has its own React handlers on top of it, and this
  // way both behaviours go through the same hit test.
  //
  // The drag starts only once the pointer has moved a few pixels with the
  // button held, as a native title bar does. Starting it on mousedown handed
  // the press to the system, so the page never saw that click's mouseup: the
  // next click within the double-click time then counted as the second half
  // of a double-click, and a single click maximized the window.
  const onMouseDown = (ev: React.MouseEvent) => {
    // A second press counts too: moved, it drags; released in place, the
    // dblclick below maximizes.
    if (ev.button !== 0 || !isDragSurface(ev)) return
    const x0 = ev.screenX
    const y0 = ev.screenY
    const stop = () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", stop)
      window.removeEventListener("blur", stop)
    }
    const onMove = (m: MouseEvent) => {
      if ((m.buttons & 1) === 0) return stop()
      if (Math.abs(m.screenX - x0) + Math.abs(m.screenY - y0) < DRAG_THRESHOLD) return
      stop()
      void appWindow.startDragging()
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", stop)
    window.addEventListener("blur", stop)
  }

  const onDoubleClick = (ev: React.MouseEvent) => {
    if (!isDragSurface(ev)) return
    void appWindow.toggleMaximize()
  }

  return (
    <div
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      className={cn(
        "relative z-30 flex h-10 shrink-0 select-none items-center justify-between",
        "border-b border-border/70 bg-background/80 backdrop-blur-md",
        isMac ? "pl-[78px]" : "pl-1.5",
      )}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onToggleSidebar}
          title={sidebarOpen ? "Hide sidebar (Ctrl+B)" : "Show sidebar (Ctrl+B)"}
          aria-label="Toggle sidebar"
          className="row grid h-7 w-7 place-items-center text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          {sidebarOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
        </button>

        <div className="pointer-events-none flex items-center gap-2 pl-1.5">
          <TurboMark />
          <span className="text-[13px] font-semibold tracking-[-0.01em] text-foreground">
            Turbo Reader
          </span>
          {unread > 0 && (
            <span className="tabular ml-1 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {unread > 999 ? "999+" : unread}
            </span>
          )}
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={busy}
              title="Refresh all feeds (r)"
              aria-label="Refresh all feeds"
              className="row pointer-events-auto grid h-7 w-7 place-items-center text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-60"
            >
              <RefreshCw size={13} className={busy ? "animate-spin" : undefined} />
            </button>
          )}
          {busy && <span className="text-[11px] font-medium text-subtle">Refreshing</span>}
          {update && (
            <button
              type="button"
              // The wordmark row ignores the pointer so it can drag the window;
              // the controls in it take clicks again.
              onClick={() => void openUrl(update.url)}
              title={`Turbo Reader ${update.latest} is out. Open the release page.`}
              className="pointer-events-auto ml-1 flex h-6 items-center gap-1.5 rounded-full border border-system/40 px-2.5 text-[11px] font-medium text-system transition-colors duration-150 hover:bg-system/10"
            >
              <ArrowUpCircle size={12} />
              Update to <span className="tabular">{update.latest}</span>
            </button>
          )}
        </div>
      </div>

      {/* The gap between the wordmark and the controls has to stay draggable. */}
      <div className="h-full flex-1" />

      <div className="flex h-full items-center">
        <div className="flex items-center gap-0.5 pr-2">{children}</div>

        {!isMac && (
          <div className="flex h-full items-center border-l border-border/70">
            <WindowButton label="Minimize" onClick={() => void appWindow.minimize()}>
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                <path d="M1 5.5h8" stroke="currentColor" strokeWidth="1" />
              </svg>
            </WindowButton>
            <WindowButton
              label={isMaximized ? "Restore" : "Maximize"}
              onClick={() => void appWindow.toggleMaximize()}
            >
              {isMaximized ? (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
                  <rect x="1.5" y="3" width="5.5" height="5.5" rx="1" stroke="currentColor" />
                  <path
                    d="M3.5 3V2.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H7"
                    stroke="currentColor"
                  />
                </svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
                  <rect x="1.5" y="1.5" width="7" height="7" rx="1.25" stroke="currentColor" />
                </svg>
              )}
            </WindowButton>
            <WindowButton label="Close" onClick={() => void appWindow.close()} danger>
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1" />
              </svg>
            </WindowButton>
          </div>
        )}
      </div>
    </div>
  )
}

function WindowButton({
  children,
  label,
  onClick,
  danger,
}: {
  children: ReactNode
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-full w-11 items-center justify-center text-muted-foreground",
        "transition-colors duration-150 ease-out",
        "focus-visible:bg-accent focus-visible:text-foreground focus-visible:outline-hidden",
        danger
          ? "hover:bg-[#e81123] hover:text-white active:bg-[#c50f1f]"
          : "hover:bg-accent hover:text-foreground active:bg-elevated",
      )}
    >
      {children}
    </button>
  )
}

/** The double chevron from the app icon, drawn at UI scale. */
export function TurboMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={cn("h-[17px] w-[17px]", className)} fill="none" aria-hidden>
      <path
        d="M4 5.5L8.5 10L4 14.5"
        stroke="hsl(var(--system))"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.5 5.5L15 10L10.5 14.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-foreground"
      />
    </svg>
  )
}
