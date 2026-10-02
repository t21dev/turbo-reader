import {
  Check,
  ExternalLink,
  FolderPlus,
  Link2,
  Pencil,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react"
import { openUrl } from "@tauri-apps/plugin-opener"
import type { Group, Source } from "@/lib/api"
import { ContextMenu, type MenuPoint } from "@/components/ContextMenu"
import { MenuGroup, MenuItem, MenuSeparator } from "@/components/Menu"
import { cn } from "@/lib/utils"

/** How many articles a feed keeps. 0 is everything. Issue #334. */
export const KEEP_LIMITS = [0, 50, 100, 250, 1000] as const

export type SourceTarget = { kind: "source"; source: Source; at: MenuPoint }
export type GroupTarget = { kind: "group"; group: Group; at: MenuPoint }
export type RailTarget = { kind: "rail"; at: MenuPoint }
export type Target = SourceTarget | GroupTarget | RailTarget

export type SidebarActions = {
  renameSource: (s: Source) => void
  moveSource: (s: Source, groupId: number | null) => void
  setKeepLimit: (s: Source, limit: number) => void
  togglePin: (s: Source) => void
  deleteSource: (s: Source) => void
  renameGroup: (g: Group) => void
  deleteGroup: (g: Group) => void
  newGroup: () => void
}

export function SidebarContextMenu({
  target,
  groups,
  onClose,
  actions,
}: {
  target: Target | null
  groups: Group[]
  onClose: () => void
  actions: SidebarActions
}) {
  return (
    <ContextMenu at={target?.at ?? null} onClose={onClose} width={224}>
      {(close) => {
        const run = (fn: () => void) => () => {
          close()
          fn()
        }
        if (!target) return null

        if (target.kind === "rail") {
          return (
            <MenuItem icon={<FolderPlus size={13} />} onClick={run(actions.newGroup)}>
              New folder
            </MenuItem>
          )
        }

        if (target.kind === "group") {
          const g = target.group
          return (
            <>
              <MenuItem icon={<Pencil size={13} />} onClick={run(() => actions.renameGroup(g))}>
                Rename folder
              </MenuItem>
              <MenuItem icon={<FolderPlus size={13} />} onClick={run(actions.newGroup)}>
                New folder
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                icon={<Trash2 size={13} />}
                danger
                onClick={run(() => actions.deleteGroup(g))}
              >
                Delete folder
              </MenuItem>
            </>
          )
        }

        const s = target.source
        return (
          <>
            <MenuItem icon={<Pencil size={13} />} onClick={run(() => actions.renameSource(s))}>
              Rename
            </MenuItem>
            <MenuItem
              icon={s.pinned ? <PinOff size={13} /> : <Pin size={13} />}
              onClick={run(() => actions.togglePin(s))}
            >
              {s.pinned ? "Unpin from home" : "Pin to home"}
            </MenuItem>

            <MenuGroup icon={<FolderPlus size={13} />} label="Move to">
              <Choice
                label="No folder"
                active={s.groupId === null}
                onClick={run(() => actions.moveSource(s, null))}
              />
              {groups.map((g) => (
                <Choice
                  key={g.id}
                  label={g.name}
                  active={s.groupId === g.id}
                  onClick={run(() => actions.moveSource(s, g.id))}
                />
              ))}
            </MenuGroup>

            <MenuGroup icon={<span className="text-[11px]">#</span>} label="Keep">
              {KEEP_LIMITS.map((n) => (
                <Choice
                  key={n}
                  label={n === 0 ? "Everything" : `Last ${n}`}
                  active={s.keepLimit === n}
                  onClick={run(() => actions.setKeepLimit(s, n))}
                />
              ))}
            </MenuGroup>

            <MenuSeparator />

            {s.siteUrl && (
              <MenuItem
                icon={<ExternalLink size={13} />}
                onClick={run(() => void openUrl(s.siteUrl as string))}
              >
                Open website
              </MenuItem>
            )}
            <MenuItem
              icon={<Link2 size={13} />}
              onClick={run(() => void copy(s.url))}
            >
              Copy feed URL
            </MenuItem>

            <MenuSeparator />

            <MenuItem
              icon={<Trash2 size={13} />}
              danger
              onClick={run(() => actions.deleteSource(s))}
            >
              Delete feed
            </MenuItem>
          </>
        )
      }}
    </ContextMenu>
  )
}

function Choice({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[12px]",
        "transition-colors duration-100 ease-out",
        active ? "text-foreground" : "text-subtle hover:bg-secondary hover:text-muted-foreground",
      )}
    >
      <span className="grid w-3 shrink-0 place-items-center">
        {active && <Check size={11} className="text-system" />}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  )
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const el = document.createElement("textarea")
    el.value = text
    el.style.position = "fixed"
    el.style.opacity = "0"
    document.body.appendChild(el)
    el.select()
    document.execCommand("copy")
    el.remove()
  }
}
