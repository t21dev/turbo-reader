import { AlertCircle, Check, X } from "lucide-react"
import { dismissToast, useToasts } from "@/lib/notify"
import { cn } from "@/lib/utils"

/** Bottom-right stack of app-wide messages. Errors stay longer than notes. */
export function Toaster() {
  const toasts = useToasts()
  if (toasts.length === 0) return null
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-90 flex max-w-[380px] flex-col items-end gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === "error" ? "alert" : "status"}
          data-toast={t.kind}
          className={cn(
            "animate-rise pointer-events-auto flex items-start gap-2 rounded-xl border bg-popover px-3 py-2.5",
            "text-[12px] leading-relaxed text-foreground shadow-float",
            t.kind === "error" ? "border-destructive/40" : "border-border",
          )}
        >
          {t.kind === "error" ? (
            <AlertCircle size={14} className="mt-px shrink-0 text-destructive" />
          ) : (
            <Check size={14} className="mt-px shrink-0 text-system" />
          )}
          <span className="min-w-0 flex-1">{t.text}</span>
          <button
            type="button"
            onClick={() => dismissToast(t.id)}
            aria-label="Dismiss"
            className="row -mr-1 grid h-5 w-5 shrink-0 place-items-center text-subtle hover:bg-secondary hover:text-foreground"
          >
            <X size={11} />
          </button>
        </div>
      ))}
    </div>
  )
}
