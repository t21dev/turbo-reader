import { useState } from "react"
import { cn } from "@/lib/utils"

type IconSource = { name: string; iconUrl: string | null; lastError?: string | null }

/** The site's own favicon, falling back to a letter tile. A feed that failed
    its last fetch shows a dot instead, so the error is visible where it is.
    Fluent Reader issue #169 asked for the favicons. */
export function FeedIcon({
  source,
  size = 14,
  className,
}: {
  source: IconSource
  size?: number
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const box = { width: size, height: size }

  if (source.lastError) {
    return (
      <span
        style={{ width: size * 0.56, height: size * 0.56 }}
        className={cn("block shrink-0 rounded-full bg-destructive", className)}
      />
    )
  }

  if (source.iconUrl && !failed) {
    return (
      <img
        src={source.iconUrl}
        alt=""
        style={box}
        className={cn("shrink-0 rounded-[3px] object-contain", className)}
        onError={() => setFailed(true)}
      />
    )
  }

  return (
    <span
      style={{ ...box, fontSize: Math.max(7, Math.round(size * 0.56)) }}
      className={cn(
        "grid shrink-0 place-items-center rounded-[3px] bg-secondary font-semibold uppercase leading-none text-subtle",
        className,
      )}
    >
      {source.name.trim().charAt(0) || "?"}
    </span>
  )
}
