import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { UI } from "./tokens.js";
export const rowEnd = () => h_flex().size(UI.status).flex_none().items_center().justify_center();
// A presentation-only row: callers keep entity-specific selection/drag semantics.
export function entityRow(t, label, leading, trailing) {
    return h_flex().min_w(0).items_center().gap(8)
        .children(leading ? [leading] : [])
        .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).tooltip(label).child(label))
        .children(trailing ? [trailing] : []);
}
