import { useEffect, useRef, useState } from "react"
import {
  ArrowLeft,
  Check,
  Circle,
  CircleDot,
  Download,
  ExternalLink,
  EyeOff,
  FileDown,
  Globe,
  Link2,
  Loader2,
  MoreHorizontal,
  Printer,
  QrCode,
  Star,
  Type,
} from "lucide-react"
import { openUrl } from "@tauri-apps/plugin-opener"
import { save as saveDialog } from "@tauri-apps/plugin-dialog"
import { api, type ItemFull } from "@/lib/api"
import { READER_FONTS, READER_SIZES, useTheme, type LineWidth } from "@/lib/theme"
import { EXIT_MS, motionOff } from "@/lib/presence"
import { videoId } from "@/lib/youtube"
import { VideoBlock } from "@/components/VideoBlock"
import { cn, hostOf } from "@/lib/utils"
import { Menu, MenuChoices, MenuGroup, MenuItem, MenuSeparator } from "@/components/Menu"

type Props = {
  item: ItemFull | null
  /** Play YouTube inline rather than handing off to the browser. */
  youtubeInline: boolean
  onStar: (item: ItemFull) => void
  onToggleRead: (item: ItemFull) => void
  onHide: (item: ItemFull) => void
  onContentLoaded: (id: number, content: string) => void
  /** Card view has no list beside the reader, so it needs a way back. */
  onBack?: () => void
}

export function Reader({
  item,
  youtubeInline,
  onStar,
  onToggleRead,
  onHide,
  onContentLoaded,
  onBack,
}: Props) {
  const theme = useTheme()
  const body = useRef<HTMLDivElement>(null)
  const [loadingFull, setLoadingFull] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [noteLeaving, setNoteLeaving] = useState(false)
  const [qr, setQr] = useState<string | null>(null)

  // A new article always starts at the top, and the old one's toast goes away.
  useEffect(() => {
    body.current?.scrollTo({ top: 0 })
    setNote(null)
    setNoteLeaving(false)
    setQr(null)
  }, [item?.id])

  // The toast fades out on its own rather than blinking away at 2.6s.
  useEffect(() => {
    if (!note) return
    setNoteLeaving(false)
    const leave = window.setTimeout(() => setNoteLeaving(true), 2600)
    const gone = window.setTimeout(() => setNote(null), 2600 + (motionOff() ? 0 : EXIT_MS))
    return () => {
      window.clearTimeout(leave)
      window.clearTimeout(gone)
    }
  }, [note])

  if (!item) {
    return (
      <section className="grid h-full flex-1 place-items-center bg-background">
        <p className="animate-rise text-[13px] text-subtle">Select an article</p>
      </section>
    )
  }

  const video = videoId(item.link)

  const published = new Date(item.published * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })

  async function copyLink() {
    if (!item?.link) return
    try {
      await navigator.clipboard.writeText(item.link)
    } catch {
      // Older webviews refuse the async clipboard outside a secure context.
      const el = document.createElement("textarea")
      el.value = item.link
      el.style.position = "fixed"
      el.style.opacity = "0"
      document.body.appendChild(el)
      el.select()
      document.execCommand("copy")
      el.remove()
    }
    setNote("Link copied")
  }

  async function loadFull() {
    if (!item) return
    setLoadingFull(true)
    try {
      const html = await api.loadFullContent(item.id)
      onContentLoaded(item.id, html)
      setNote("Full article loaded")
    } catch (err) {
      setNote(String(err))
    } finally {
      setLoadingFull(false)
    }
  }

  async function saveMarkdown() {
    if (!item) return
    try {
      const { filename, markdown } = await api.articleMarkdown(item.id)
      const path = await saveDialog({
        defaultPath: filename,
        filters: [{ name: "Markdown", extensions: ["md"] }],
      })
      if (!path) return
      await api.writeTextFile(path, markdown)
      setNote("Saved as Markdown")
    } catch (err) {
      setNote(String(err))
    }
  }

  /** The print dialog's "Save as PDF" is the whole feature. A print stylesheet
      strips the chrome, so what lands in the file is the article alone. */
  function savePdf() {
    window.print()
  }

  async function showQr() {
    if (!item?.link) return
    if (qr) {
      setQr(null)
      return
    }
    try {
      setQr(await api.qrSvg(item.link))
    } catch (err) {
      setNote(String(err))
    }
  }

  return (
    <section className="relative flex h-full min-w-0 flex-1 flex-col bg-background">
      <header className="no-print flex items-center gap-1 border-b border-border px-3 py-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            title="Back to articles (Esc)"
            className="row grid h-7 w-7 shrink-0 place-items-center text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <ArrowLeft size={15} />
          </button>
        )}
        <span className="truncate px-1 text-[12px] text-subtle">
          {item.sourceName}
          {item.link ? ` · ${hostOf(item.link)}` : ""}
        </span>
        <div className="flex-1" />

        <ToolButton
          label={item.read ? "Mark as unread (m)" : "Mark as read (m)"}
          onClick={() => onToggleRead(item)}
        >
          {item.read ? <Circle size={14} /> : <CircleDot size={14} className="text-system" />}
        </ToolButton>

        <ToolButton
          label={item.starred ? "Unstar (s)" : "Star (s)"}
          onClick={() => onStar(item)}
        >
          <Star size={14} className={item.starred ? "fill-starred text-starred" : undefined} />
        </ToolButton>

        <ToolButton
          label="Load full content (f)"
          onClick={loadFull}
          disabled={loadingFull || !item.link}
        >
          {loadingFull ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Download size={14} />
          )}
        </ToolButton>

        {item.link && (
          <ToolButton label="Open in browser (o)" onClick={() => void openUrl(item.link!)}>
            <Globe size={14} />
          </ToolButton>
        )}

        <Menu
          label="Article actions"
          width={232}
          trigger={({ open, toggle }) => (
            <button
              type="button"
              onClick={toggle}
              title="More"
              className={cn(
                "row grid h-7 w-7 place-items-center hover:bg-secondary hover:text-foreground",
                open ? "bg-secondary text-foreground" : "text-muted-foreground",
              )}
            >
              <MoreHorizontal size={15} />
            </button>
          )}
        >
          {(close) => (
            <>
              <MenuItem
                icon={<ExternalLink size={13} />}
                disabled={!item.link}
                onClick={() => {
                  close()
                  if (item.link) void openUrl(item.link)
                }}
                hint="O"
              >
                Open externally
              </MenuItem>
              <MenuItem
                icon={<Link2 size={13} />}
                disabled={!item.link}
                onClick={() => {
                  close()
                  void copyLink()
                }}
              >
                Copy link
              </MenuItem>
              <MenuItem
                icon={<FileDown size={13} />}
                onClick={() => {
                  close()
                  void saveMarkdown()
                }}
              >
                Save as Markdown
              </MenuItem>
              <MenuItem
                icon={<Printer size={13} />}
                onClick={() => {
                  close()
                  savePdf()
                }}
              >
                Save as PDF
              </MenuItem>
              <MenuItem
                icon={<EyeOff size={13} />}
                onClick={() => {
                  close()
                  onHide(item)
                }}
              >
                Hide article
              </MenuItem>

              <MenuSeparator />

              <MenuGroup icon={<Type size={13} />} label="Font">
                <MenuChoices
                  value={theme.font}
                  onChange={(v) => theme.set("font", v)}
                  options={READER_FONTS.map((f) => ({
                    value: f.key,
                    label: f.label,
                    style: { fontFamily: f.stack },
                  }))}
                />
              </MenuGroup>

              <MenuGroup icon={<span className="text-[11px] font-semibold">Aa</span>} label="Font size">
                <MenuChoices
                  columns={5}
                  value={theme.fontSize}
                  onChange={(v) => theme.set("fontSize", v)}
                  options={READER_SIZES.map((size, i) => ({
                    value: size,
                    label: "Aa",
                    style: { fontSize: `${10 + i * 1.5}px` },
                  }))}
                />
              </MenuGroup>

              <MenuGroup icon={<span className="text-[11px]">↔</span>} label="Line width">
                <MenuChoices
                  columns={3}
                  value={theme.lineWidth}
                  onChange={(v) => theme.set("lineWidth", v as LineWidth)}
                  options={[
                    { value: "narrow", label: "Narrow" },
                    { value: "normal", label: "Normal" },
                    { value: "wide", label: "Wide" },
                  ]}
                />
              </MenuGroup>

              <MenuGroup icon={<span className="text-[11px]">¶</span>} label="Text direction">
                <MenuChoices
                  columns={2}
                  value={theme.direction}
                  onChange={(v) => theme.set("direction", v)}
                  options={[
                    { value: "ltr", label: "Left to right" },
                    { value: "rtl", label: "Right to left" },
                  ]}
                />
              </MenuGroup>

              <MenuSeparator />

              <MenuItem
                icon={<QrCode size={13} />}
                disabled={!item.link}
                onClick={() => void showQr()}
              >
                {qr ? "Hide QR code" : "QR code"}
              </MenuItem>
              {qr && (
                <div
                  className="animate-rise mx-1 mb-1 mt-1 overflow-hidden rounded-lg bg-white p-2"
                  dangerouslySetInnerHTML={{ __html: qr }}
                />
              )}
            </>
          )}
        </Menu>
      </header>

      <div ref={body} key={item.id} className="animate-rise min-h-0 flex-1 overflow-y-auto">
        <article
          className="reader-column mx-auto px-7 py-8"
          dir={theme.direction}
          style={{ maxWidth: "var(--reader-width)" }}
        >
          <h1 className="text-[1.6rem] font-semibold leading-tight tracking-tight">{item.title}</h1>
          <p className="no-print mt-2 text-[12px] text-subtle">
            {item.author ? `${item.author} · ` : ""}
            {published}
          </p>
          {video && item.link && (
            <VideoBlock
              id={video}
              title={item.title}
              link={item.link}
              inline={youtubeInline}
            />
          )}
          {/* Sanitised in Rust by feed::sanitise before it was ever stored.
              That allowlist is the security boundary, not this component. */}
          <div
            className="prose-feed mt-7"
            dangerouslySetInnerHTML={{ __html: item.content }}
          />
        </article>
      </div>

      {note && (
        <div
          role="status"
          className={cn(
            "no-print pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5",
            "rounded-full border border-border bg-popover px-3 py-1.5 text-[11.5px] text-foreground shadow-float",
            noteLeaving ? "animate-fade-out" : "animate-rise",
          )}
        >
          <Check size={12} className="text-system" />
          {note}
        </div>
      )}
    </section>
  )
}

function ToolButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      disabled={disabled}
      className="row grid h-7 w-7 place-items-center text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-35 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}
