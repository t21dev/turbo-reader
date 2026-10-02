import { useEffect } from "react"
import { X } from "lucide-react"
import { isMac } from "@/lib/platform"

const MOD = isMac ? "⌘" : "Ctrl"

const GROUPS: { title: string; keys: [string, string][] }[] = [
  {
    title: "Moving around",
    keys: [
      ["j  ↓", "Next article"],
      ["k  ↑", "Previous article"],
      ["Esc", "Back to the list"],
      [`${MOD} B`, "Show or hide the sidebar"],
      ["v", "Switch between cards and list"],
    ],
  },
  {
    title: "The article",
    keys: [
      ["s", "Star or unstar"],
      ["m", "Mark read or unread"],
      ["h", "Hide this article"],
      ["o", "Open in the browser"],
    ],
  },
  {
    title: "The list",
    keys: [
      ["r", "Refresh every feed"],
      ["a", "Mark all as read"],
      ["u", "Unread only"],
      ["d", "Hide duplicates"],
      ["t", "Newest or oldest first"],
      ["/", "Search"],
      ["n", "Add a feed"],
    ],
  },
  {
    title: "The window",
    keys: [
      [`${MOD} + / -`, "Interface size"],
      [`${MOD} 0`, "Reset the interface size"],
      [",", "Settings"],
      ["?", "This list"],
    ],
  },
]

export function Shortcuts({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" || ev.key === "?") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div
      className="animate-fade absolute inset-0 z-[60] grid place-items-center bg-black/50 p-6"
      onClick={onClose}
    >
      <div
        className="animate-pop w-full max-w-[620px] overflow-hidden rounded-xl border border-border bg-popover shadow-float"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="text-[14px] font-semibold tracking-tight">Keyboard shortcuts</h2>
          <button
            type="button"
            onClick={onClose}
            title="Close (Esc)"
            className="row grid h-7 w-7 place-items-center text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X size={14} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-x-7 gap-y-5 px-5 py-5">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-subtle">
                {g.title}
              </h3>
              <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5">
                {g.keys.map(([key, what]) => (
                  <div key={key} className="contents">
                    <dt>
                      <kbd className="inline-block min-w-[2.1rem] rounded-md border border-border bg-background px-1.5 py-0.5 text-center font-mono text-[10.5px] text-foreground">
                        {key}
                      </kbd>
                    </dt>
                    <dd className="text-[12px] text-muted-foreground">{what}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
