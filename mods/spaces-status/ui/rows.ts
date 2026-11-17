import { div } from "gpui-kit";
import type { Element } from "gpui-kit";
import { h_flex } from "gpui-base";
import type { Theme } from "../appearance-model.js";
import { UI, SPACING } from "./tokens.js";

export const rowEnd = (): Element => h_flex().size(UI.status).flex_none().items_center().justify_center();

// A presentation-only row: callers keep entity-specific selection/drag semantics.
export function entityRow(t: Theme, label: string, leading?: Element | null, trailing?: Element | null): Element {
  return h_flex().min_w(0).items_center().gap(SPACING.row.gap)
    .children(leading ? [leading] : [])
    .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).tooltip(label).child(label))
    .children(trailing ? [trailing] : []);
}
