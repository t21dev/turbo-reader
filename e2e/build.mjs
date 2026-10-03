// Build the binary the suite drives: a release build under its own identifier,
// in its own target directory, so it never overwrites or shares data with a
// real build.
import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const r = spawnSync(
  "npx",
  ["tauri", "build", "--no-bundle", "--config", "e2e/tauri.e2e.json"],
  {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, CARGO_TARGET_DIR: path.join(root, "src-tauri", "target-e2e") },
  },
)
process.exit(r.status ?? 1)
