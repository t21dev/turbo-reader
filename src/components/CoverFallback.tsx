import { Image as ImageIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/** A stable hue per source, so the same feed always looks the same and two
    feeds side by side usually do not. Hashing the name rather than the id
    means it survives a re-import. */
function hueOf(name: string): number {
  let h = 2166136261
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h) % 360
}

/**
 * What sits where the cover image would be when an article has none.
 *
 * The alternative is a card that is mostly empty, or a stretched grid with
 * holes in it. This keeps the shape of the row intact without pretending to be
 * a photograph: a low-contrast wash tinted from the source's own hue, a soft
 * highlight, and a faint picture outline, the usual sign for "no image here".
 * It used to centre the feed's icon in a frosted chip, which on a picture
 * frame read as a video's play button.
 */
export function CoverFallback({
  source,
  aspect = "16/10",
  className,
}: {
  source: { name: string; iconUrl: string | null }
  aspect?: string
  className?: string
}) {
  const hue = hueOf(source.name)

  return (
    <div
      aria-hidden
      style={{ aspectRatio: aspect }}
      className={cn("relative w-full overflow-hidden bg-secondary", className)}
    >
      {/* The wash. Two stops, both barely there, so it reads as a surface
          rather than as a colour the reader has to interpret. */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(135deg,
            hsl(${hue} 60% 50% / 0.14) 0%,
            hsl(${(hue + 48) % 360} 55% 50% / 0.05) 55%,
            transparent 100%)`,
        }}
      />
      {/* A single soft highlight, off centre, to stop it looking like a flat
          swatch at large sizes. */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(120% 90% at 22% 12%,
            hsl(0 0% 100% / 0.07) 0%, transparent 60%)`,
        }}
      />
      {/* Hairline, so the panel has an edge against the card in both themes. */}
      <div className="absolute inset-0 ring-1 ring-inset ring-foreground/[0.045]" />

      <div className="absolute inset-0 grid place-items-center">
        <ImageIcon size={26} strokeWidth={1.25} className="text-foreground/20" />
      </div>
    </div>
  )
}
