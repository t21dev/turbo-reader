import { useEffect, useRef, useState } from "react"
import { useDismissible } from "@/lib/presence"
import { cn } from "@/lib/utils"

export type PromptSpec = {
  title: string
  /** Shown under the title. Say what will happen, not what the button says. */
  detail?: string
  /** Omit for a confirmation with no field. */
  field?: { label: string; value: string; placeholder?: string }
  confirmLabel: string
  destructive?: boolean
  onConfirm: (value: string) => void | Promise<void>
}

/**
 * One small dialog behind renaming, creating and deleting.
 *
 * Three nearly identical modals would have been three places to get the focus
 * handling and the keyboard wrong, so this is the only one.
 */
export function Prompt({ spec, onClose }: { spec: PromptSpec | null; onClose: () => void }) {
  const [value, setValue] = useState("")
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const { closing, dismiss } = useDismissible(onClose)

  useEffect(() => {
    if (!spec) return
    setValue(spec.field?.value ?? "")
    setBusy(false)
    // Select rather than place a caret: renaming usually replaces the name.
    const t = window.setTimeout(() => input.current?.select(), 40)
    return () => window.clearTimeout(t)
  }, [spec])

  useEffect(() => {
    if (!spec) return
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.stopPropagation()
        dismiss()
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [spec, dismiss])

  if (!spec) return null

  const invalid = spec.field !== undefined && value.trim().length === 0

  async function confirm() {
    if (invalid || busy || !spec) return
    setBusy(true)
    try {
      await spec.onConfirm(value.trim())
      dismiss()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={cn(
        "absolute inset-0 z-[80] grid place-items-center bg-black/50 p-6",
        closing ? "animate-fade-out" : "animate-fade",
      )}
      onClick={dismiss}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          void confirm()
        }}
        className={cn(
          "w-full max-w-[380px] overflow-hidden rounded-xl border border-border bg-popover shadow-float",
          closing ? "animate-pop-out" : "animate-pop",
        )}
      >
        <div className="px-5 pb-4 pt-4">
          <h2 className="text-[13.5px] font-semibold tracking-tight">{spec.title}</h2>
          {spec.detail && (
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
              {spec.detail}
            </p>
          )}
          {spec.field && (
            <label className="mt-3.5 block">
              <span className="mb-1.5 block text-[11.5px] text-muted-foreground">
                {spec.field.label}
              </span>
              <input
                ref={input}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={spec.field.placeholder}
                spellCheck={false}
                className="h-9 w-full rounded-lg border border-input bg-secondary px-2.5 text-[12.5px] outline-none transition-colors duration-150 ease-out placeholder:text-subtle focus:border-system"
              />
            </label>
          )}
        </div>

        <div className="flex items-center justify-end gap-1.5 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={dismiss}
            className="row h-8 px-3 text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={invalid || busy}
            className={cn(
              "row h-8 px-3 text-[12px] font-medium",
              "transition-[background-color,transform] duration-150 ease-out active:scale-[0.97]",
              "disabled:opacity-40 disabled:active:scale-100",
              spec.destructive
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            {spec.confirmLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
