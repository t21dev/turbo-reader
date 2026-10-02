/**
 * YouTube feeds are Atom documents whose entries carry a media:group and no
 * article body, so a reader that only renders the body shows a list of titles
 * with nothing behind them. Fluent Reader issues #211 and #663.
 */

/** The eleven character video id, or null for anything that is not a video. */
export function videoId(link: string | null): string | null {
  if (!link) return null
  let url: URL
  try {
    url = new URL(link)
  } catch {
    return null
  }
  const host = url.hostname.replace(/^www\./, "")

  if (host === "youtu.be") {
    return clean(url.pathname.slice(1))
  }
  if (host !== "youtube.com" && host !== "m.youtube.com" && host !== "youtube-nocookie.com") {
    return null
  }
  if (url.pathname === "/watch") {
    return clean(url.searchParams.get("v"))
  }
  // /embed/ID, /shorts/ID, /live/ID
  const m = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/)
  return clean(m?.[1] ?? null)
}

function clean(id: string | null | undefined): string | null {
  if (!id) return null
  return /^[\w-]{11}$/.test(id) ? id : null
}

/** The embed URL. Always the no-cookie host: there is no reason to hand over
    more than the view itself, and it costs nothing. */
export function embedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`
}

/** A poster, for the times the video is not being embedded. Falls back
    through YouTube's sizes, since maxres does not exist for every video. */
export function posterUrl(id: string, size: "max" | "hq" = "hq"): string {
  const name = size === "max" ? "maxresdefault" : "hqdefault"
  return `https://i.ytimg.com/vi/${id}/${name}.jpg`
}
