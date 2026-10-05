import { Search } from "lucide-react"

/**
 * A small search box above a long list in Settings. Escape clears it first,
 * and only closes Settings once it is empty, like the box in the tab rail.
 */
export function ListFilter({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
}) {
  return (
    <div className="relative">
      <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.preventDefault()
            e.stopPropagation()
            e.nativeEvent.stopImmediatePropagation()
            onChange("")
          }
        }}
        placeholder={placeholder}
        aria-label={label}
        spellCheck={false}
        autoComplete="off"
        className="h-8 w-full rounded-lg border border-border bg-background/60 pl-7 pr-2 text-[12px] outline-hidden transition-colors duration-150 ease-out placeholder:text-subtle focus:border-system [&::-webkit-search-cancel-button]:hidden"
      />
    </div>
  )
}
