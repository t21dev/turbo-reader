import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Download, ExternalLink, Maximize, X, ZoomIn, ZoomOut } from "lucide-react"
import { openUrl } from "@tauri-apps/plugin-opener"
import { save as saveDialog } from "@tauri-apps/plugin-dialog"
import { api } from "@/lib/api"
import { imageFileName } from "@/lib/contextMenu"
import { useDismissible } from "@/lib/presence"
import { cn } from "@/lib/utils"

const MIN = 1
const MAX = 6
const STEP = 1.25

const clamp = (z: number) => Math.min(MAX, Math.max(MIN, z))

/**
 * An article's image at full size, over the app. Zoom with the buttons, the
 * wheel, a double click or + and -; drag to pan once zoomed in. Escape, the
 * close button or a click outside the image closes it. A linked image's page
 * opens in the browser from here, never in the app window.
 */
export function Lightbox({
  src,
  alt,
  link,
  onClose,
}: {
  src: string
  alt: string
  link: string | null
  onClose: () => void
}) {
  const { closing, dismiss } = useDismissible(onClose)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null)
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null)

  const zoomTo = (z: number) => {
    const next = clamp(z)
    setZoom(next)
    if (next === 1) setPan({ x: 0, y: 0 })
  }

  async function download() {
    try {
      const path = await saveDialog({ defaultPath: imageFileName(src) })
      if (!path) return
      setStatus({ text: "Downloading", error: false })
      await api.downloadImage(src, path)
      setStatus({ text: "Image saved", error: false })
    } catch (err) {
      setStatus({ text: String(err), error: true })
    }
  }

  useEffect(() => {
    if (!status || status.text === "Downloading") return
    const t = window.setTimeout(() => setStatus(null), 2400)
    return () => window.clearTimeout(t)
  }, [status])

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const keys: Record<string, () => void> = {
        Escape: dismiss,
        "+": () => zoomTo(zoom * STEP),
        "=": () => zoomTo(zoom * STEP),
        "-": () => zoomTo(zoom / STEP),
        "0": () => zoomTo(1),
      }
      const run = keys[ev.key]
      if (!run) return
      // The image has the keyboard while it is open, not the article behind it.
      ev.stopPropagation()
      ev.preventDefault()
      run()
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [dismiss, zoom])

  const btn =
    "row grid h-8 w-8 place-items-center text-white/85 hover:bg-white/15 hover:text-white disabled:opacity-35 disabled:hover:bg-transparent"

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt || "Image"}
      data-lightbox
      onClick={dismiss}
      onWheel={(ev) => zoomTo(zoom * (ev.deltaY < 0 ? STEP : 1 / STEP))}
      className={cn(
        "fixed inset-0 z-[90] flex select-none items-center justify-center overflow-hidden bg-black/85 pb-16",
        closing ? "animate-fade-out" : "animate-fade",
      )}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={() => zoomTo(zoom > 1 ? 1 : 2)}
        onPointerDown={(e) => {
          if (zoom === 1) return
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, moved: false }
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d) return
          d.moved = true
          setPan({ x: d.px + (e.clientX - d.x) / zoom, y: d.py + (e.clientY - d.y) / zoom })
        }}
        onPointerUp={() => (drag.current = null)}
        style={{ transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)` }}
        className={cn(
          "max-h-[calc(100vh-160px)] max-w-[calc(100vw-64px)] rounded-lg object-contain shadow-float transition-transform duration-150 ease-out",
          zoom > 1 ? "cursor-grab active:cursor-grabbing active:transition-none" : "cursor-zoom-in",
          closing ? "animate-pop-out" : "animate-pop",
        )}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        // At the bottom, away from the window controls in the corner.
        className="row absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-1 bg-black/60 p-1"
      >
        <button type="button" onClick={() => zoomTo(zoom / STEP)} disabled={zoom <= MIN} title="Zoom out (-)" aria-label="Zoom out" className={btn}>
          <ZoomOut size={15} />
        </button>
        <span className="w-11 text-center text-[12px] tabular-nums text-white/80">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => zoomTo(zoom * STEP)} disabled={zoom >= MAX} title="Zoom in (+)" aria-label="Zoom in" className={btn}>
          <ZoomIn size={15} />
        </button>
        <button type="button" onClick={() => zoomTo(1)} disabled={zoom === 1} title="Fit to window (0)" aria-label="Fit to window" className={btn}>
          <Maximize size={14} />
        </button>
        {/^https?:/i.test(src) && (
          <button type="button" onClick={() => void download()} title="Download image" aria-label="Download image" className={btn}>
            <Download size={15} />
          </button>
        )}
        {link && (
          <button type="button" onClick={() => void openUrl(link)} title="Open link in browser" aria-label="Open link in browser" className={btn}>
            <ExternalLink size={14} />
          </button>
        )}
        <button type="button" onClick={dismiss} title="Close (Esc)" aria-label="Close image" className={cn(btn, "ml-1")}>
          <X size={15} />
        </button>
      </div>
      {status && (
        <div
          role={status.error ? "alert" : "status"}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "row absolute bottom-[72px] left-1/2 -translate-x-1/2 bg-black/70 px-3 py-1.5 text-[12px]",
            status.error ? "text-destructive" : "text-white/90",
          )}
        >
          {status.text}
        </div>
      )}
    </div>,
    document.body,
  )
}
