// Canonical design sizes (before app zoom). No host imports: build tools also
// consume this module. Change spacing decisions here, not in individual views.
export const SPACE = { none: 0, hair: 2, tight: 4, compact: 6, base: 8, roomy: 12, section: 16 } as const;
export const SPACING = {
  row: { inset: SPACE.base, gap: SPACE.base },
  control: { inset: SPACE.base, gap: SPACE.base },
  dialog: { inset: SPACE.section, gap: SPACE.roomy },
  panel: { inset: SPACE.base, listInset: SPACE.none, listInsetY: SPACE.tight, gap: SPACE.base },
  menu: { inset: SPACE.tight, gap: SPACE.base, rowGap: SPACE.none },
  sidebar: {
    inset: SPACE.base, machineInset: SPACE.tight, spaceInsetY: SPACE.tight,
    machineGap: SPACE.roomy, groupGap: SPACE.tight, indent: SPACE.roomy, sessionIndent: SPACE.base,
  },
  chrome: { inset: SPACE.base, gap: SPACE.base, actionGap: SPACE.tight, footerInset: SPACE.tight, footerGap: SPACE.tight },
  metadata: { gap: SPACE.tight },
  gallery: { gap: SPACE.compact },
  workspace: { inset: SPACE.base, gap: SPACE.base },
  toast: { inset: SPACE.roomy, gap: SPACE.roomy },
} as const;

// Fixed artwork/hit-target geometry is deliberately separate from whitespace.
export const UI = {
  stroke: 2, iconTarget: 24, machineTarget: 28, icon: 14, machineIcon: 18,
  actionGap: SPACING.chrome.actionGap, control: 32, secondary: 12, sourceLine: 18, programIcon: 14, inset: SPACING.row.inset,
  menuInset: SPACING.menu.inset, menuMaxHeight: 480,
  status: 16, statusCompact: 10,
  railCell: 32, railBelow: 160, compactBelow: 240, gitFrom: 340, sidebar: 299,
} as const;
export const HIERARCHY = {
  machine: { row: 44, avatar: 36, text: 16, target: UI.machineTarget, glyph: UI.machineIcon, railRow: 36, railAvatar: 28 },
  space: { row: UI.control, avatar: 20, text: 14, target: UI.iconTarget, glyph: UI.icon, railRow: UI.railCell, railAvatar: 18 },
  worktree: { row: 28, avatar: 16, text: 12, target: 20, glyph: 10, railRow: 28, railAvatar: 14 },
} as const;
export type HierarchyLevel = keyof typeof HIERARCHY;
const FOOTER_ROW = 28;
export const CHROME = {
  brand: 42, tabs: 42, tab: 30, pane: 32, status: 28, footerRow: FOOTER_ROW,
  footer: UI.stroke + SPACING.chrome.footerInset * 2 + FOOTER_ROW * 2 + SPACING.chrome.footerGap,
  macRail: 76, trafficLightsWidth: 64,
} as const;
export const RAIL = {
  min: 44, outer: SPACE.hair, inset: SPACE.none, tree: 8, selectionInset: SPACE.tight,
  avatar: HIERARCHY.space.railAvatar, status: UI.statusCompact,
} as const;
export const GALLERY = { cell: 48, gap: SPACING.gallery.gap } as const;
export const FILES = { row: 28, indent: 18, disclosure: 12, diffRow: 20, numberLane: 30 } as const;
export const menuHeight = (rows: number): number => Math.min(UI.menuMaxHeight,
  UI.stroke * 2 + UI.menuInset * 2 + rows * UI.control + Math.max(0, rows - 1) * SPACING.menu.rowGap);
