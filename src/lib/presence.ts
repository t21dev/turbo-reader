import { useCallback, useEffect, useRef, useState } from "react"

/** How long an exit animation is allowed to run before the node is pulled.
    Kept just under the CSS duration so the element never sits finished. */
export const EXIT_MS = 160

/** True when motion is off, either by the app's own switch or the OS setting. */
export function motionOff(): boolean {
  if (document.documentElement.dataset.motion === "none") return true
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/**
 * Holds a dismissable surface in the tree long enough for it to animate out.
 *
 * Without this, `open && <Panel />` unmounts on the same frame as the click:
 * the panel animates in and then vanishes, which reads as a glitch rather than
 * a close. `closing` drives the exit class; `dismiss` starts it and calls
 * `onClose` once the animation has had its time.
 */
export function useDismissible(onClose: () => void, ms: number = EXIT_MS) {
  const [closing, setClosing] = useState(false)
  const timer = useRef<number | null>(null)

  const dismiss = useCallback(() => {
    if (timer.current !== null) return
    const wait = motionOff() ? 0 : ms
    setClosing(true)
    timer.current = window.setTimeout(onClose, wait)
  }, [onClose, ms])

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    [],
  )

  return { closing, dismiss }
}
