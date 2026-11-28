# Microsoft Store

Turbo Reader is listed in the Microsoft Store as an MSIX package. The Store
signs the package and hosts it, so there is no certificate to buy or renew.

| Partner Center field | Value |
|---|---|
| Package/Identity/Name | `TriptoAfsin.TurboReader` |
| Package/Identity/Publisher | `CN=83EC5113-24EF-4718-9965-289BB530FA30` |
| PublisherDisplayName | `TriptoAfsin` |
| Package family name | `TriptoAfsin.TurboReader_py9gkaefmesmp` |
| Store ID | `9NLRTCM38V06` |

These values are in `msix/Package.appxmanifest`. The Store rejects a package
whose identity does not match them exactly.

## Building the package

```powershell
winget install microsoft.winappcli --source winget   # once
npm run msix                                         # build the app, then package it
```

The package lands in `src-tauri/target/msix/Turbo.Reader_<version>_x64.msix`.
The version comes from `tauri.conf.json` with `.0` added, because the Store
reserves the fourth part. Every upload needs a higher version than the last.

A release builds the same package on CI. Download it from the
`microsoft-store-msix` artifact of the Release workflow run.

## Uploading a release

1. In Partner Center, open Turbo Reader and start a new submission (or
   *Update* the last one).
2. Under **Packages**, upload the `.msix` and remove the previous one.
3. Under **Store listings**, fill in *What's new in this version* from
   `CHANGELOG.md`.
4. Submit for certification. It usually clears in one to three days.

## Trying it locally

The package for the Store is unsigned and will not install as is. To run the
app with its package identity, without signing anything (Developer Mode on):

```powershell
npm run msix -- --no-build
winapp run src-tauri\target\msix\stage --detach
# ...test...
winapp unregister src-tauri\target\msix\stage
```

Unregistering deletes the test copy's library, as an uninstall would.

## What differs in the Store copy

`src-tauri/src/package.rs` handles these, and its IDs must match the manifest:

- **Start at login** is the `TurboReaderAtLogin` startup task, not the registry
  Run key, which a package cannot use. A launch from it starts in the tray, as
  `--hidden` does for other copies. If the user turns it off in Task Manager >
  Startup apps, only they can turn it back on there, and Settings says so.
- **AI agents** start `%LOCALAPPDATA%\Microsoft\WindowsApps\turbo-reader.exe`,
  the package's execution alias, because the install folder changes with every
  update.
- **The library** is in `%LOCALAPPDATA%\Packages\TriptoAfsin.TurboReader_py9gkaefmesmp\LocalState`.
  It is never shared with an installer copy, and uninstalling removes it.
- **Notifications** carry the package's app ID,
  `TriptoAfsin.TurboReader_py9gkaefmesmp!App`. Inside a package, Windows has
  no notification settings for the installer's ID, `dev.t21.turbo-reader`.

The Store package relies on the WebView2 runtime that ships with Windows 10
and 11, and does not install it.
