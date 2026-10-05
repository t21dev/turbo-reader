import { Menu, MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu"
import { openUrl } from "@tauri-apps/plugin-opener"
import { save as saveDialog } from "@tauri-apps/plugin-dialog"
import { api } from "@/lib/api"
import { isWindows } from "@/lib/platform"

/**
 * The right-click menu, app-wide.
 *
 * The webview's own menu is a browser's: Back, Reload, Inspect. On Windows it
 * stays, trimmed in Rust to the clipboard, links and pictures (see
 * src-tauri/src/ctxmenu.rs), since it opens where it should and looks right.
 * Elsewhere it is replaced: where a right click has something to act on, a
 * native menu offers that, and anywhere else nothing opens. Components with
 * menus of their own (the sidebar) call preventDefault, and this steps aside.
 */
export function installContextMenu() {
  if (isWindows) return
  window.addEventListener("contextmenu", (ev) => {
    if (ev.defaultPrevented) return
    ev.preventDefault()
    void popupFor(ev.target as Element | null)
  })
}

const web = (url: string) => /^https?:/i.test(url)

/** A file name for the save dialog, from the picture's address. */
export function imageFileName(src: string): string {
  try {
    const last = decodeURIComponent(new URL(src).pathname.split("/").pop() ?? "")
    if (/\.(png|jpe?g|gif|webp|avif|svg|bmp)$/i.test(last)) return last
    return (last || "image") + ".jpg"
  } catch {
    return "image.jpg"
  }
}

/** Put a picture on the clipboard. The clipboard takes PNG, so it is redrawn. */
export async function copyImage(src: string) {
  const bytes = await api.imageBytes(src)
  const bitmap = await createImageBitmap(new Blob([bytes]))
  const canvas = document.createElement("canvas")
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0)
  const png = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The picture could not be copied"))), "image/png"),
  )
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })])
}

export async function saveImage(src: string) {
  const path = await saveDialog({ defaultPath: imageFileName(src) })
  if (path) await api.downloadImage(src, path)
}

async function popupFor(target: Element | null) {
  if (!target) return
  const items: (MenuItem | PredefinedMenuItem)[] = []
  const separate = async () => {
    if (items.length) items.push(await PredefinedMenuItem.new({ item: "Separator" }))
  }

  const field = target.closest<HTMLElement>(
    'textarea, [contenteditable="true"], input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit])',
  )
  if (field) {
    for (const item of ["Cut", "Copy", "Paste"] as const) items.push(await PredefinedMenuItem.new({ item }))
    items.push(await PredefinedMenuItem.new({ item: "Separator" }))
    items.push(await PredefinedMenuItem.new({ item: "SelectAll" }))
  } else {
    if (window.getSelection()?.toString().trim()) items.push(await PredefinedMenuItem.new({ item: "Copy" }))

    const link = target.closest<HTMLAnchorElement>("a[href]")?.href
    if (link && (web(link) || link.startsWith("mailto:"))) {
      await separate()
      items.push(await MenuItem.new({ text: "Open link in browser", action: () => void openUrl(link) }))
      items.push(
        await MenuItem.new({
          text: link.startsWith("mailto:") ? "Copy email address" : "Copy link",
          action: () => void navigator.clipboard.writeText(link.replace(/^mailto:/, "")),
        }),
      )
    }

    const img = target.closest("img")
    const src = img ? img.currentSrc || img.src : ""
    if (src && web(src)) {
      await separate()
      items.push(await MenuItem.new({ text: "Copy image", action: () => void copyImage(src).catch(() => undefined) }))
      items.push(await MenuItem.new({ text: "Copy image address", action: () => void navigator.clipboard.writeText(src) }))
      items.push(await MenuItem.new({ text: "Save image as…", action: () => void saveImage(src).catch(() => undefined) }))
    }
  }
  if (!items.length) return
  const menu = await Menu.new({ items })
  // At the pointer. A position from the page is off whenever the UI is
  // zoomed, since page pixels and window pixels then differ.
  await menu.popup()
}
