// The app switcher's list. The same file is on every T21 landing branch (turbo-reader, porter,
// kitab, ttorrent, rkey, plugged, printty, vlz): when an app is added or its line changes,
// change it on all eight, and copy its 72px icon to public/apps/<id>.webp on each.

export type AppId = "kitab" | "turbo-reader" | "porter" | "plugged" | "rkey" | "ttorrent" | "vlz" | "printty";

export type App = {
  id: AppId;
  name: string;
  /** One line on what it does, short enough for one row of the menu. */
  line: string;
  platforms: string;
  url: string;
};

export const APPS: App[] = [
  { id: "kitab", name: "Kitab Reader", line: "A fast, modern PDF and ebook reader", platforms: "Windows, macOS, Linux", url: "https://kitab.t21.dev" },
  { id: "turbo-reader", name: "Turbo Reader", line: "A fast, small RSS reader", platforms: "Windows, macOS, Linux", url: "https://turbo-reader.t21.dev" },
  { id: "porter", name: "Porter", line: "See what's on every port, and stop it", platforms: "Windows, macOS, Linux", url: "https://porter.t21.dev" },
  { id: "plugged", name: "Plugged", line: "See what's plugged in and if it runs at full speed", platforms: "Windows, macOS, Linux", url: "https://plugged.t21.dev" },
  { id: "rkey", name: "rKey", line: "Global hotkeys, a lighter WinHotKey", platforms: "Windows", url: "https://rkey.t21.dev" },
  { id: "ttorrent", name: "tTorrent", line: "A modern torrent client, built on qBittorrent", platforms: "Windows", url: "https://ttorrent.t21.dev" },
  { id: "vlz", name: "VLZ", line: "A VLC fork with a more modern interface", platforms: "Windows", url: "https://vlz.t21.dev" },
  { id: "printty", name: "Printty", line: "Make your printer wireless, approve every job", platforms: "Windows, macOS, Linux", url: "https://printty.t21.dev" },
];
