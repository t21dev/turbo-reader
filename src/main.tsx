import React from "react"
import ReactDOM from "react-dom/client"
import { getCurrentWindow } from "@tauri-apps/api/window"
import App from "./App"
import { api } from "./lib/api"
import { ThemeProvider } from "./lib/theme"
import { installContextMenu } from "./lib/contextMenu"
import "./index.css"

installContextMenu()

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
)

/**
 * The window starts hidden and is shown once there is something to look at.
 *
 * Two frames are waited on rather than one: the first lands after React has
 * committed, the second after the browser has actually painted that commit.
 * Showing on the first still catches an empty window on a slow start.
 */
async function reveal() {
  // Started at login with the tray on: stay in the tray until opened.
  if (await api.startHidden().catch(() => false)) {
    document.getElementById("splash")?.remove()
    return
  }
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const splash = document.getElementById("splash")
      if (splash) {
        splash.hidden = true
        window.setTimeout(() => splash.remove(), 260)
      }
      const win = getCurrentWindow()
      void api
        .revealWindow()
        // The restored size is corrected here rather than at startup: a window
        // that has not been shown yet reports sizes that were never laid out.
        // A maximized window has no size of its own to correct.
        .then((maximized) => (maximized ? undefined : api.settleWindow()))
        .catch(() => win.show())
    }),
  )
}

if (document.fonts?.ready) {
  // Geist loading late would otherwise show one frame of fallback type.
  void document.fonts.ready.then(reveal).catch(reveal)
} else {
  void reveal()
}
