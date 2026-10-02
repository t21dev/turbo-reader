/** Platform checks the UI needs. Tauri sets the OS on the user agent. */
const ua = typeof navigator !== "undefined" ? navigator.userAgent : ""

export const isMac = /Mac/i.test(ua)
export const isWindows = /Win/i.test(ua)
export const isLinux = !isMac && !isWindows
