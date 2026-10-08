#!/usr/bin/env sh
# Write node-sources.json and cargo-sources.json next to the manifest: every
# npm package and crate the build needs, so flatpak-builder can run offline.
# Run again whenever package-lock.json or src-tauri/Cargo.lock changes.
#
# Needs git and python3. The generators and their Python packages go into a
# private virtualenv under flatpak/, so nothing is installed system-wide.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
root=$(dirname "$here")
tools="$here/.flatpak-builder-tools"
venv="$here/.venv"

if [ ! -d "$tools" ]; then
  git clone --depth 1 https://github.com/flatpak/flatpak-builder-tools.git "$tools"
fi
if [ ! -x "$venv/bin/flatpak-node-generator" ]; then
  python3 -m venv "$venv"
  "$venv/bin/pip" install --quiet "$tools/node" aiohttp toml tomlkit
fi

"$venv/bin/flatpak-node-generator" --no-requests-cache \
  -o "$here/node-sources.json" npm "$root/package-lock.json"
"$venv/bin/python" "$tools/cargo/flatpak-cargo-generator.py" \
  -o "$here/cargo-sources.json" "$root/src-tauri/Cargo.lock"

echo "Wrote node-sources.json and cargo-sources.json in $here"
