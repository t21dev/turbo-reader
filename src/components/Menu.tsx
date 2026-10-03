import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { ChevronRight } from "lucide-react"
import { motionOff } from "@/lib/presence"
import { cn } from "@/lib/utils"

/** The menu's exit is shorter than a panel's; a dropdown that lingers feels
    unresponsive, because the next click is usually already on its way. */
const MENU_EXIT_MS = 110

/** A dropdown anchored to its trigger. Scales up from the trigger on open and
    back down on close, and flips to the other side when it would run off the
    window. Escape closes it, as does a click anywhere outside. */
export function Menu({
  trigger,
  children,
  align = "end",
  width = 216,
  label,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode
  children: ReactNode | ((close: () => void) => ReactNode)
  align?: "start" | "end"
  width?: number
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [up, setUp] = useState(false)
  const host = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const timer = useRef<number | null>(null)

  // The panel stays mounted while it animates out, so a close reads as a
  // close rather than the menu blinking out of existence.
  const close = useCallback(() => {
    if (timer.current !== null) return
    if (motionOff()) {
      setOpen(false)
      return
    }
    setClosing(true)
    timer.current = window.setTimeout(() => {
      timer.current = null
      setClosing(false)
      setOpen(false)
    }, MENU_EXIT_MS)
  }, [])

  const toggle = useCallback(() => {
    // A click on the trigger while the menu is still animating out means
    // "open it again". Treating it as another close swallowed the click.
    if (closing) {
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = null
      setClosing(false)
      return
    }
    if (open) close()
    else setOpen(true)
  }, [open, closing, close])

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    [],
  )

  useEffect(() => {
    if (!open || closing) return
    const onDown = (ev: MouseEvent) => {
      if (!host.current?.contains(ev.target as Node)) close()
    }
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.stopPropagation()
        close()
      }
    }
    window.addEventListener("mousedown", onDown)
    window.addEventListener("keydown", onKey, true)
    return () => {
      window.removeEventListener("mousedown", onDown)
      window.removeEventListener("keydown", onKey, true)
    }
  }, [open, closing, close])

  // Flip above the trigger when there is no room below.
  useLayoutEffect(() => {
    if (!open || closing || !host.current) return
    const r = host.current.getBoundingClientRect()
    setUp(window.innerHeight - r.bottom < 260 && r.top > 260)
  }, [open, closing])

  return (
    <div ref={host} className="relative">
      {trigger({ open, toggle })}
      {open && (
        <div
          ref={panel}
          role="menu"
          aria-label={label}
          style={{ width }}
          className={cn(
            "absolute z-50 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-float",
            align === "end" ? "right-0" : "left-0",
            up ? "bottom-full mb-1.5 origin-bottom" : "top-full mt-1.5 origin-top",
            closing ? "animate-menu-out" : "animate-menu",
          )}
        >
          {typeof children === "function" ? children(close) : children}
        </div>
      )}
    </div>
  )
}

export function MenuItem({
  icon,
  children,
  onClick,
  danger,
  disabled,
  hint,
}: {
  icon?: ReactNode
  children: ReactNode
  onClick?: () => void
  danger?: boolean
  disabled?: boolean
  hint?: string
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-left text-[12.5px]",
        "transition-colors duration-100 ease-out disabled:opacity-40",
        danger
          ? "text-destructive hover:bg-destructive/12"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      {icon && <span className="grid w-4 shrink-0 place-items-center">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <span className="tabular shrink-0 text-[10.5px] text-subtle">{hint}</span>}
    </button>
  )
}

/** A nested list that opens in place, so the panel never has to float twice. */
export function MenuGroup({
  icon,
  label,
  children,
  defaultOpen,
}: {
  icon?: ReactNode
  label: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-left text-[12.5px]",
          "text-muted-foreground transition-colors duration-100 ease-out",
          "hover:bg-secondary hover:text-foreground",
        )}
      >
        {icon && <span className="grid w-4 shrink-0 place-items-center">{icon}</span>}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronRight
          size={12}
          className={cn("shrink-0 transition-transform duration-200 ease-out", open && "rotate-90")}
        />
      </button>
      <div className="collapse-grid" data-open={open}>
        <div className="overflow-hidden">
          <div className="pb-1 pl-6 pr-1 pt-0.5">{children}</div>
        </div>
      </div>
    </div>
  )
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-border" />
}

/** A row of mutually exclusive choices, used for font and size pickers. */
export function MenuChoices<T extends string | number>({
  value,
  options,
  onChange,
  columns,
}: {
  value: T
  options: { value: T; label: string; style?: React.CSSProperties }[]
  onChange: (v: T) => void
  columns?: number
}) {
  return (
    <div
      className="grid gap-0.5"
      style={{ gridTemplateColumns: `repeat(${columns ?? 1}, minmax(0, 1fr))` }}
    >
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          style={o.style}
          className={cn(
            "flex h-7 items-center justify-center rounded-md px-2 text-[12px]",
            "transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.96]",
            value === o.value
              ? "bg-elevated text-foreground"
              : "text-subtle hover:bg-secondary hover:text-muted-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
