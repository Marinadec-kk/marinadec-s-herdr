import { div } from "gpui-kit";
import type { Element } from "gpui-kit";
import { h_flex } from "gpui-base";
import type { Theme } from "../appearance-model.js";
import { pixelIcon } from "../pixel-ui.js";
import type { PixelGlyph } from "../pixel-ui.js";
import { iconButton } from "./controls.js";
import type { Action } from "./controls.js";
import { UI, HIERARCHY, SPACING, RAIL } from "./tokens.js";
import type { HierarchyLevel } from "./tokens.js";

// All levels share column centers; worktrees keep one size at every depth.
export function hierarchyButton(t: Theme, level: HierarchyLevel, id: string, glyph: PixelGlyph, label: string, action: Action): Element {
  const size = HIERARCHY[level];
  return iconButton(t, id, label, pixelIcon(glyph, t.muted, size.glyph), action, { quiet: true })
    .size(size.target);
}
export function hierarchyActions(primary?: Element | null, secondary?: Element | null): Element {
  const slot = (child?: Element | null) => h_flex().size(UI.machineTarget).flex_none().items_center().justify_center()
    .children(child ? [child] : []);
  return h_flex().flex_none().gap(UI.actionGap).items_center().child(slot(primary)).child(slot(secondary));
}

// Frame compensation aligns machine actions with framed space rows. These
// directional insets express alignment, not separate spacing decisions.
export const machineInsets = () => ({
  left: SPACING.row.inset + UI.stroke - SPACING.sidebar.machineInset,
  right: SPACING.row.inset + UI.stroke,
});
export const branchGeometry = () => ({
  elbow: SPACING.sidebar.indent - SPACING.metadata.gap,
  middle: UI.stroke + SPACING.sidebar.spaceInsetY + HIERARCHY.worktree.row / 2,
});

// Measure the interior, not the full sidebar. Center the entire identity/status
// cluster; smaller worktree avatars end on the same identity column.
export function railGeometry(width: number, avatar: number = RAIL.avatar) {
  const content = width - 2 * (RAIL.outer + UI.stroke + RAIL.inset);
  const identity = (content - RAIL.avatar - RAIL.status) / 2;
  return {
    content, avatar: identity + RAIL.avatar - avatar, status: identity + RAIL.avatar,
    tree: Math.max(UI.stroke, identity - SPACING.metadata.gap),
  };
}

export interface TreePosition { depth: number; last: boolean; continuations: boolean[] }
// A compact tree has two visible lanes at 44 px; full ancestry remains in its tooltip.
export function treeLines(color: `#${string}`, position: TreePosition, children: boolean, height: number, end: number = RAIL.tree): Element {
  const { depth, last, continuations } = position, mid = height / 2, step = UI.stroke * 2;
  const lane = (level: number) => Math.min(level, 1) * step;
  const full = new Set(continuations.slice(1, depth).flatMap((value, level) => value ? [lane(level)] : []));
  const line = (left: number, top: number, height: number) => div().absolute().left(left).top(top).w(UI.stroke).h(height).bg(color);
  return div().absolute().inset_0()
    .children([...full].map(left => line(left, 0, height)))
    .when(depth > 0, el => el.child(line(lane(depth - 1), 0, last ? mid : height))
      .child(div().absolute().left(lane(depth - 1)).top(mid).w(end - lane(depth - 1)).h(UI.stroke).bg(color)))
    .when(children, el => el.child(line(lane(depth), mid, height - mid))
      .when(depth === 0, el => el.child(div().absolute().left(0).top(mid).w(Math.min(UI.stroke * 2, end)).h(UI.stroke).bg(color))));
}
