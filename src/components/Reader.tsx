import { ExternalLink, Star } from "lucide-react"
import { openUrl } from "@tauri-apps/plugin-opener"
import type { ItemFull } from "@/lib/api"
import { hostOf } from "@/lib/utils"

export function Reader({
  item,
  onStar,
}: {
  item: ItemFull | null
  onStar: (item: ItemFull) => void
}) {
  if (!item) {
    return (
      <section className="grid h-full flex-1 place-items-center bg-background">
        <p className="text-[13px] text-subtle">Select an article</p>
      </section>
    )
  }

  const published = new Date(item.published * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-background">
      <header className="flex items-center gap-2 border-b border-border px-5 py-2">
        <span className="truncate text-[12px] text-subtle">
          {item.sourceName}
          {item.link ? ` · ${hostOf(item.link)}` : ""}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => onStar(item)}
          title={item.starred ? "Unstar" : "Star"}
          className="row grid h-7 w-7 place-items-center text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Star size={14} className={item.starred ? "fill-starred text-starred" : undefined} />
        </button>
        {item.link && (
          <button
            type="button"
            onClick={() => void openUrl(item.link as string)}
            title="Open in browser"
            className="row grid h-7 w-7 place-items-center text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <ExternalLink size={14} />
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <article className="mx-auto max-w-[68ch] px-7 py-8">
          <h1 className="text-[1.6rem] font-semibold leading-tight tracking-tight">
            {item.title}
          </h1>
          <p className="mt-2 text-[12px] text-subtle">
            {item.author ? `${item.author} · ` : ""}
            {published}
          </p>
          {/* Sanitised in Rust by feed::sanitise before it was ever stored —
              that allowlist is the security boundary, not this component. */}
          <div
            className="prose-feed mt-7"
            dangerouslySetInnerHTML={{ __html: item.content }}
          />
        </article>
      </div>
    </section>
  )
}
