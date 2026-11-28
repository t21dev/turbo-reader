// The "other apps" menu next to the logo. Same component on every T21 landing branch;
// only `current` and `home` change. Styles: src/styles/switcher.css.
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { APPS, type AppId } from "../apps";

type Props = {
  /** The site this menu is on: marked "You're here". */
  current: AppId;
  /** Where the current app's row goes: the top of this page or its home. */
  home?: string;
};

export function AppSwitcher({ current, home = "#top" }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  // Up and down arrows move between the apps; Tab works as usual.
  const onKey = (e: ReactKeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const links = Array.from(list.current?.querySelectorAll<HTMLAnchorElement>("a") ?? []);
    if (!links.length) return;
    e.preventDefault();
    if (!open) setOpen(true);
    const at = links.indexOf(document.activeElement as HTMLAnchorElement);
    const next = at < 0 ? (e.key === "ArrowDown" ? 0 : links.length - 1) : (at + (e.key === "ArrowDown" ? 1 : -1) + links.length) % links.length;
    requestAnimationFrame(() => links[next].focus());
  };

  return (
    <div className="apps" ref={root} onKeyDown={onKey}>
      <button
        ref={button}
        type="button"
        className="apps-btn"
        aria-expanded={open}
        aria-controls="apps-panel"
        aria-label="Other apps by T21"
        title="Other apps by T21"
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>
      <div id="apps-panel" className="apps-panel" data-open={open} inert={!open}>
        <p className="apps-head">Apps by T21</p>
        <ul ref={list} className="apps-list">
          {APPS.map((a) => {
            const here = a.id === current;
            return (
              <li key={a.id}>
                <a
                  className="apps-row"
                  href={here ? home : a.url}
                  aria-current={here ? "page" : undefined}
                  onClick={() => setOpen(false)}
                >
                  <img src={`/apps/${a.id}.webp`} width="34" height="34" alt="" loading="lazy" decoding="async" />
                  <span className="apps-text">
                    <span className="apps-name">
                      {a.name}
                      {here ? <span className="apps-here">You're here</span> : null}
                      <span className="apps-os">{a.platforms}</span>
                    </span>
                    <span className="apps-line">{a.line}</span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
        <p className="apps-foot">
          <a href="https://t21.dev">t21.dev</a>
        </p>
      </div>
    </div>
  );
}
