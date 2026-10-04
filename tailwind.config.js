/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        // The system fonts and colour emoji come last, for every character
        // Geist does not draw: other scripts, symbols and emoji.
        sans: [
          '"Geist Variable"',
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          '"Segoe UI"',
          '"Noto Sans"',
          "sans-serif",
          '"Apple Color Emoji"',
          '"Segoe UI Emoji"',
          '"Segoe UI Symbol"',
          '"Noto Color Emoji"',
        ],
        mono: [
          '"Geist Mono Variable"',
          "ui-monospace",
          "SFMono-Regular",
          "monospace",
          '"Apple Color Emoji"',
          '"Segoe UI Emoji"',
          '"Noto Color Emoji"',
        ],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        elevated: "hsl(var(--elevated))",
        subtle: "hsl(var(--subtle))",
        unread: "hsl(var(--unread))",
        starred: "hsl(var(--starred))",
        system: "hsl(var(--system))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      transitionTimingFunction: {
        out: "var(--ease-out)",
        in: "var(--ease-in)",
        "in-out": "var(--ease-in-out)",
      },
      boxShadow: {
        float:
          "0 1px 0 0 hsl(0 0% 100% / 0.03) inset, 0 12px 32px -8px rgb(0 0 0 / 0.45), 0 2px 6px -2px rgb(0 0 0 / 0.3)",
        card: "0 1px 2px rgb(0 0 0 / 0.44), 0 8px 20px -8px rgb(0 0 0 / 0.55)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
