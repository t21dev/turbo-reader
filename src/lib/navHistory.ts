import { useCallback, useEffect, useMemo, useRef } from "react"

/** Keep this many steps each way. */
const LIMIT = 100

/**
 * Browser-style back and forward over the places the reader has been. A place
 * is anything `key` tells apart; `apply` puts the app back there. Moving
 * anywhere new drops the forward steps, as a browser does.
 *
 * Applying a place can take more than one render (opening an article loads it
 * first), so changes are ignored until the app arrives where it was sent, or
 * a second has passed.
 */
export function useNavHistory<T>(here: T, key: (place: T) => string, apply: (place: T) => void) {
  const back = useRef<T[]>([])
  const forward = useRef<T[]>([])
  const last = useRef<T | null>(null)
  const heading = useRef<{ key: string; until: number } | null>(null)
  const hereKey = key(here)

  useEffect(() => {
    const target = heading.current
    if (target) {
      if (target.key !== hereKey && Date.now() < target.until) return
      heading.current = null
      last.current = here
      return
    }
    const prev = last.current
    if (prev !== null && key(prev) !== hereKey) {
      back.current.push(prev)
      if (back.current.length > LIMIT) back.current.shift()
      forward.current = []
    }
    last.current = here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hereKey])

  const go = useCallback(
    (dir: "back" | "forward") => {
      const from = dir === "back" ? back.current : forward.current
      const to = dir === "back" ? forward.current : back.current
      const target = from.pop()
      if (target === undefined) return false
      if (last.current !== null) to.push(last.current)
      heading.current = { key: key(target), until: Date.now() + 1000 }
      apply(target)
      return true
    },
    [key, apply],
  )

  return useMemo(
    () => ({
      back: () => go("back"),
      forward: () => go("forward"),
      canGoBack: () => back.current.length > 0,
      canGoForward: () => forward.current.length > 0,
    }),
    [go],
  )
}
