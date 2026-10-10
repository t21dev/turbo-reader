import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react"
import { GripVertical } from "lucide-react"
import { cn } from "@/lib/utils"

type Props = {
  /** Stable keys, in the current order. */
  keys: string[]
  onReorder: (next: string[]) => void
  /** What a row is called, for the handle's label and the announcement. */
  label: (key: string) => string
  /** One row. Put `handle` first, on the left. */
  row: (key: string, handle: ReactNode) => ReactNode
  className?: string
  /** Hooks for tests, such as `data-home-sections`. */
  data?: Record<`data-${string}`, string | boolean>
}

type Drag = { key: string; from: number; to: number; dy: number; step: number }

/** A list the reader puts in order by dragging the grip on the left of each
    row. Pointer events rather than HTML5 drag and drop, which the webview's
    own file-drop handling gets in the way of. Focus a grip and Up or Down
    moves the row one place, so there is a keyboard path too. */
export function SortableList({ keys, onReorder, label, row, className, data }: Props) {
  const list = useRef<HTMLDivElement>(null)
  const rows = useRef(new Map<string, HTMLDivElement>())
  const handles = useRef(new Map<string, HTMLButtonElement>())
  const start = useRef<{ y: number; mids: number[] } | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [said, setSaid] = useState("")

  // Positions relative to the list, so scrolling mid-drag doesn't throw it off.
  const listTop = () => list.current?.getBoundingClientRect().top ?? 0

  function begin(e: PointerEvent<HTMLButtonElement>, key: string) {
    if (e.button !== 0 || keys.length < 2) return
    e.preventDefault()
    e.currentTarget.focus()
    const top = listTop()
    const rects = keys.map((k) => rows.current.get(k)!.getBoundingClientRect())
    const step = rects[1].top - rects[0].top
    start.current = {
      y: e.clientY - top,
      mids: rects.map((r) => r.top - top + r.height / 2),
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    const from = keys.indexOf(key)
    setDrag({ key, from, to: from, dy: 0, step })
  }

  function move(e: PointerEvent<HTMLButtonElement>) {
    if (!drag || !start.current) return
    const dy = e.clientY - listTop() - start.current.y
    const centre = start.current.mids[drag.from] + dy
    const to = Math.max(
      0,
      Math.min(keys.length - 1, Math.round((centre - start.current.mids[0]) / drag.step)),
    )
    setDrag({ ...drag, dy, to })
  }

  function end() {
    if (!drag) return
    if (drag.to !== drag.from) commit(drag.from, drag.to)
    setDrag(null)
    start.current = null
  }

  function commit(from: number, to: number) {
    const next = [...keys]
    const [k] = next.splice(from, 1)
    next.splice(to, 0, k)
    onReorder(next)
    setSaid(`${label(k)} moved to position ${to + 1} of ${keys.length}`)
  }

  function onKey(e: KeyboardEvent<HTMLButtonElement>, key: string) {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return
    e.preventDefault()
    e.stopPropagation()
    const from = keys.indexOf(key)
    const to = from + (e.key === "ArrowUp" ? -1 : 1)
    if (to < 0 || to >= keys.length) return
    commit(from, to)
    // Moving a node can drop its focus. Put it back on the same grip.
    requestAnimationFrame(() => handles.current.get(key)?.focus())
  }

  // Where each row sits while a drag is live: the dragged one follows the
  // pointer, and the ones it passes step aside to show where it will land.
  function offset(i: number): number {
    if (!drag) return 0
    if (i === drag.from) return drag.dy
    if (drag.from < drag.to && i > drag.from && i <= drag.to) return -drag.step
    if (drag.to < drag.from && i >= drag.to && i < drag.from) return drag.step
    return 0
  }

  return (
    <div ref={list} className={cn("space-y-1.5", drag && "select-none", className)} {...data}>
      {keys.map((key, i) => {
        const dragging = drag?.key === key
        const handle = (
          <button
            ref={(el) => {
              if (el) handles.current.set(key, el)
              else handles.current.delete(key)
            }}
            type="button"
            aria-label={`Reorder ${label(key)}`}
            title="Drag to reorder, or use Up and Down"
            onPointerDown={(e) => begin(e, key)}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={() => {
              setDrag(null)
              start.current = null
            }}
            onKeyDown={(e) => onKey(e, key)}
            className={cn(
              "row grid h-8 w-5 shrink-0 touch-none place-items-center text-subtle outline-hidden",
              "transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
              dragging ? "cursor-grabbing text-foreground" : "cursor-grab",
            )}
          >
            <GripVertical size={13} aria-hidden />
          </button>
        )
        return (
          <div
            key={key}
            ref={(el) => {
              if (el) rows.current.set(key, el)
              else rows.current.delete(key)
            }}
            data-sortable-row={key}
            style={{ translate: `0 ${offset(i)}px` }}
            className={cn(
              "relative rounded-lg",
              // Only animate while a drag is live: after the drop the rows
              // are already in their new places and must not slide again.
              drag && !dragging && "transition-[translate] duration-200 ease-out",
              dragging && "z-10 bg-popover shadow-float",
            )}
          >
            {row(key, handle)}
          </div>
        )
      })}
      <span role="status" className="sr-only">
        {said}
      </span>
    </div>
  )
}
