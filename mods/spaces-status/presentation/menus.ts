// Static definitions drive both popup sizing and rendering; controllers bind targets.
export const TAB_MENU = [
  { id: "rename", label: "Rename tab", glyph: "file" },
  { id: "new", label: "New tab", glyph: "plus" },
  { id: "close", label: "Close tab", glyph: "close" },
] as const;

export function spaceMenu(checkout: "main" | "linked" | null) {
  return [
    { action: "appearance", label: "Rename & appearance…" },
    { action: "new", label: "New worktree…" },
    { action: "open", label: "Open worktree…" },
    ...(checkout === "linked" ? [{ action: "remove" as const, label: "Remove worktree" }] : []),
    { action: "close", label: "Close space" },
  ] as const;
}
