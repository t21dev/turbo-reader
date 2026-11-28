// Copies the app's CHANGELOG.md from the app branch (or a release tag) into
// content/, where prerender.mjs reads the newest release for /latest.json.
// Never edit content/CHANGELOG.md by hand on this branch: run `npm run sync`
// (or let the Website workflow on main do it when a release is published), so
// the site and the app never disagree.
//
//   npm run sync              from origin/main
//   npm run sync -- v0.34.0   from a release tag
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const ref = process.argv[2] ?? "origin/main";
const show = (f) => execFileSync("git", ["show", `${ref}:${f}`], { encoding: "utf8" });

mkdirSync(new URL("../content/", import.meta.url), { recursive: true });
for (const f of ["CHANGELOG.md"]) {
  writeFileSync(new URL(`../content/${f}`, import.meta.url), show(f));
  console.log(`synced ${f} from ${ref}`);
}
