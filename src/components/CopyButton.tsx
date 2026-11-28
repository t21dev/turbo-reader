import { useState } from "react"
import { Check, Copy } from "lucide-react"

/** Copies `text`, and shows a tick for a moment once it has. */
export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      title="Copy"
      aria-label="Copy"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true)
          window.setTimeout(() => setDone(false), 1500)
        })
      }}
      className="row grid h-7 w-7 shrink-0 place-items-center text-subtle hover:bg-background hover:text-foreground"
    >
      {done ? <Check size={13} className="text-system" /> : <Copy size={13} />}
    </button>
  )
}
