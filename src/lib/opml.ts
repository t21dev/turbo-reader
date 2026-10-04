import { open as openDialog } from "@tauri-apps/plugin-dialog"
import { api } from "@/lib/api"

/**
 * Ask for an OPML file and import every feed in it. Resolves to how many
 * feeds were added, or null when the dialog was cancelled. Shared by the
 * welcome screen and Settings, so both import the same way.
 */
export async function pickAndImportOpml(): Promise<number | null> {
  const path = await openDialog({
    multiple: false,
    filters: [{ name: "OPML", extensions: ["opml", "xml"] }],
  })
  if (typeof path !== "string") return null
  return api.importOpml(await api.readTextFile(path))
}
