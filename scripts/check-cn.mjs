// Proves the class merging the app relies on: the token colours, the px type
// scale and the density variables merge like Tailwind's own names.
// Run: node scripts/check-cn.mjs
import assert from "node:assert/strict"
import { cn } from "cn"

const cases = [
  // custom colour names: the last colour wins
  [["text-subtle", "text-foreground"], "text-foreground"],
  [["text-muted-foreground", "text-system"], "text-system"],
  [["text-subtle", "text-unread"], "text-unread"],
  [["bg-system/10", "bg-elevated"], "bg-elevated"],
  [["bg-secondary", "bg-destructive/10"], "bg-destructive/10"],
  [["border-border", "border-system"], "border-system"],
  [["border-border/60", "border-system/50"], "border-system/50"],
  [["bg-elevated text-system", "bg-secondary text-foreground"], "bg-secondary text-foreground"],
  [["fill-starred text-starred", "text-subtle"], "fill-starred text-subtle"],
  // a px size and a colour are different groups: both stay
  [["text-[12px]", "text-foreground"], "text-[12px] text-foreground"],
  [["text-[11px] text-subtle", "text-[12px]"], "text-subtle text-[12px]"],
  [["text-[12.5px]", "text-[13px]"], "text-[13px]"],
  // ring width and ring colour are different groups
  [["ring-2", "ring-ring/50"], "ring-2 ring-ring/50"],
  [["focus-visible:ring-2 focus-visible:ring-ring/50", "focus-visible:ring-1"], "focus-visible:ring-ring/50 focus-visible:ring-1"],
  // sizes, radii, density variables, arbitrary values
  [["h-7 w-7", "h-8"], "w-7 h-8"],
  [["rounded-lg", "rounded-xl"], "rounded-xl"],
  [["h-(--row-h)", "h-8"], "h-8"],
  [["px-(--card-pad)", "px-3"], "px-3"],
  [["w-[min(880px,100%)]", "w-full"], "w-full"],
  // the custom shadows merge with each other, and not across states
  [["shadow-card", "shadow-float"], "shadow-float"],
  [["shadow-card", "hover:shadow-float"], "shadow-card hover:shadow-float"],
  // clsx semantics
  [["a", false, null, undefined, { c: true, d: false }, ["e", ["f"]]], "a c e f"],
]

for (const [input, want] of cases) {
  assert.equal(cn(...input), want, `cn(${JSON.stringify(input)})`)
}
console.log(`cn: ${cases.length} cases pass`)
