import { useState } from "react"
import { Play } from "lucide-react"
import { openUrl } from "@tauri-apps/plugin-opener"
import { embedUrl, posterUrl } from "@/lib/youtube"
import { cn } from "@/lib/utils"

/**
 * The video at the top of a YouTube article.
 *
 * Default is a poster that opens in the browser, because embedding loads
 * Google's player into the app and that should be the reader's decision rather
 * than mine. With inline playback switched on, the poster is replaced by the
 * iframe on the first click, so nothing from YouTube loads until it is asked
 * for.
 */
export function VideoBlock({
  id,
  title,
  link,
  inline,
}: {
  id: string
  title: string
  link: string
  inline: boolean
}) {
  const [playing, setPlaying] = useState(false)
  const [poster, setPoster] = useState(posterUrl(id, "max"))

  if (playing) {
    return (
      <div className="relative mb-6 aspect-video w-full overflow-hidden rounded-xl bg-black">
        <iframe
          src={embedUrl(id)}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 h-full w-full border-0"
        />
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => (inline ? setPlaying(true) : void openUrl(link))}
      title={inline ? "Play here" : "Open on YouTube"}
      className={cn(
        "group relative mb-6 block aspect-video w-full overflow-hidden rounded-xl bg-secondary",
        "transition-[scale,box-shadow] duration-200 ease-out",
        "hover:shadow-float active:scale-[0.995]",
      )}
    >
      <img
        src={poster}
        alt=""
        className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.02]"
        // maxresdefault does not exist for every video, and YouTube answers
        // with a 120px placeholder rather than a 404 when it does not.
        onError={() => setPoster(posterUrl(id, "hq"))}
      />
      <span className="absolute inset-0 bg-black/20 transition-colors duration-200 group-hover:bg-black/10" />
      <span
        className={cn(
          "absolute left-1/2 top-1/2 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center",
          "rounded-full bg-black/65 text-white ring-1 ring-inset ring-white/20 backdrop-blur-xs",
          "transition-transform duration-200 ease-out group-hover:scale-110",
        )}
      >
        <Play size={20} className="ml-0.5 fill-current" />
      </span>
    </button>
  )
}
