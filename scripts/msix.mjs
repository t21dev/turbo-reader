// Builds the Microsoft Store package: src-tauri/target/msix/Turbo.Reader_<version>_x64.msix.
//
//   npm run msix                      build the app, then package it unsigned for the Store
//   npm run msix -- --no-build        package the exe already in target/release
//   npm run msix -- --cert dev.pfx    sign with a test certificate, to install it locally
//
// Needs the winapp CLI: winget install microsoft.winappcli --source winget
// The Store signs the package itself, so an upload to Partner Center stays unsigned.

import { execFileSync } from "node:child_process"
import { copyFileSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const args = process.argv.slice(2)
const certAt = args.indexOf("--cert")
const cert = certAt >= 0 ? resolve(args[certAt + 1] ?? "") : null
if (certAt >= 0 && !args[certAt + 1]) throw new Error("--cert needs a .pfx path")

const run = (cmd, argv, opts = {}) =>
  execFileSync(cmd, argv, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, WINAPP_CLI_TELEMETRY_OPTOUT: "1" },
    ...opts,
  })

const { version } = JSON.parse(readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8"))
// MSIX wants four parts, and the Store reserves the fourth: 0.32.0 -> 0.32.0.0.
const msixVersion = `${version.split("-")[0]}.0`
if (!/^\d+\.\d+\.\d+\.0$/.test(msixVersion)) throw new Error(`Cannot turn ${version} into an MSIX version`)

if (!args.includes("--no-build")) run("npm", ["run", "tauri", "--", "build", "--no-bundle"])

const out = join(root, "src-tauri/target/msix")
const stage = join(out, "stage")
rmSync(stage, { recursive: true, force: true })
mkdirSync(stage, { recursive: true })
copyFileSync(join(root, "src-tauri/target/release/turbo-reader.exe"), join(stage, "turbo-reader.exe"))
cpSync(join(root, "msix/Assets"), join(stage, "Assets"), { recursive: true })
const manifest = readFileSync(join(root, "msix/Package.appxmanifest"), "utf8")
if (!manifest.includes('Version="0.0.0.0"')) throw new Error("Package.appxmanifest should carry the placeholder Version=\"0.0.0.0\"")
writeFileSync(join(stage, "Package.appxmanifest"), manifest.replace('Version="0.0.0.0"', `Version="${msixVersion}"`))

const file = join(out, `Turbo.Reader_${version}_x64.msix`)
rmSync(file, { force: true })
run("winapp", [
  "package",
  stage,
  "--manifest",
  join(stage, "Package.appxmanifest"),
  "--output",
  file,
  ...(cert ? ["--cert", cert] : ["--no-sign"]),
])
console.log(`\nMSIX ${msixVersion}: ${file}`)
