import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { motionOff } from "@/lib/presence"
import { cn } from "@/lib/utils"

export type MenuPoint = { x: number; y: number }

const EXIT_MS = 110

/**
 * A menu that opens where the pointer is.
 *
 * Rendered through a portal so it is never clipped by the scrolling rail it
 * was summoned from, and flipped back inside the window when it would run off
 * an edge. Closing is animated for the same reason everything else here is:
 * a surface that blinks out of existence reads as a glitch.
 */
export function ContextMenu({
  at,
  onClose,
  width = 212,
  children,
}: {
  at: MenuPoint | null
  onClose: () => void
  width?: number
  children: ReactNode | ((close: () => void) => ReactNode)
}) {
  const [closing, setClosing] = useState(false)
  const [pos, setPos] = useState<MenuPoint | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  const timer = useRef<number | null>(null)

  const close = () => {
    if (timer.current !== null) return
    if (motionOff()) {
      onClose()
      return
    }
    setClosing(true)
    timer.current = window.setTimeout(() => {
      timer.current = null
      setClosing(false)
      onClose()
    }, EXIT_MS)
  }

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    [],
  )

  useEffect(() => {
    if (!at) return
    const onDown = (ev: MouseEvent) => {
      if (!panel.current?.contains(ev.target as Node)) close()
    }
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.stopPropagation()
        close()
      }
    }
    // A second right-click elsewhere should move the menu, not stack one.
    window.addEventListener("mousedown", onDown)
    window.addEventListener("contextmenu", onDown)
    window.addEventListener("keydown", onKey, true)
    window.addEventListener("resize", close)
    return () => {
      window.removeEventListener("mousedown", onDown)
      window.removeEventListener("contextmenu", onDown)
      window.removeEventListener("keydown", onKey, true)
      window.removeEventListener("resize", close)
    }
  })

  // Measure, then place. Doing it in a layout effect means the menu never
  // paints at the wrong spot first.
  useLayoutEffect(() => {
    if (!at) {
      setPos(null)
      return
    }
    const h = panel.current?.offsetHeight ?? 260
    const margin = 8
    setPos({
      x: Math.min(at.x, window.innerWidth - width - margin),
      y: Math.max(margin, Math.min(at.y, window.innerHeight - h - margin)),
    })
  }, [at, width])

  if (!at) return null

  return createPortal(
    <div
      ref={panel}
      role="menu"
      style={{
        width,
        left: pos?.x ?? at.x,
        top: pos?.y ?? at.y,
        visibility: pos ? "visible" : "hidden",
      }}
      className={cn(
        "fixed z-70 origin-top-left overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-float",
        closing ? "animate-menu-out" : "animate-menu",
      )}
    >
      {typeof children === "function" ? children(close) : children}
    </div>,
    document.body,
  )
}
