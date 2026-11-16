import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { pixelIcon } from "../pixel-ui.js";
import { iconButton } from "./controls.js";
import { UI, HIERARCHY } from "./tokens.js";
// All levels share column centers; worktrees keep one size at every depth.
export function hierarchyButton(t, level, id, glyph, label, action) {
    const size = HIERARCHY[level];
    return iconButton(t, id, label, pixelIcon(glyph, t.muted, size.glyph), action, { quiet: true })
        .size(size.target);
}
export function hierarchyActions(primary, secondary) {
    const slot = (child) => h_flex().size(UI.machineTarget).flex_none().items_center().justify_center()
        .children(child ? [child] : []);
    return h_flex().flex_none().gap(UI.actionGap).items_center().child(slot(primary)).child(slot(secondary));
}
// A compact tree has two visible lanes at 44 px; full ancestry remains in its tooltip.
export function treeLines(color, position, children, height) {
    const { depth, last, continuations } = position, mid = height / 2, step = UI.stroke * 2;
    const lane = (level) => Math.min(level, 1) * step;
    const full = new Set(continuations.slice(1, depth).flatMap((value, level) => value ? [lane(level)] : []));
    const line = (left, top, height) => div().absolute().left(left).top(top).w(UI.stroke).h(height).bg(color);
    return div().absolute().inset_0()
        .children([...full].map(left => line(left, 0, height)))
        .when(depth > 0, el => el.child(line(lane(depth - 1), 0, last ? mid + UI.stroke : height))
        .child(div().absolute().left(lane(depth - 1)).top(mid).w(8 - lane(depth - 1)).h(UI.stroke).bg(color)))
        .when(children, el => el.child(line(lane(depth), mid, height - mid))
        .when(depth === 0, el => el.child(div().absolute().left(0).top(mid).w(4).h(UI.stroke).bg(color))))
        .when(depth === 0 && !children, el => el.child(line(0, 6, height - 12)));
}
