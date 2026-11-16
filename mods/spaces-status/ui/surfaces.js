import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { UI_FONT, UI_FONT_SIZE } from "../appearance-model.js";
import { iconButton } from "./controls.js";
import { UI } from "./tokens.js";
export function surface(t, kind) {
    const el = kind === "bar" ? h_flex().items_center() : v_flex();
    return el.min_w(0).min_h(0).font_family(UI_FONT).text_size(UI_FONT_SIZE).text_color(t.foreground)
        .bg(kind === "bar" ? t.chrome : kind === "panel" ? t.background : t.popover)
        .when(kind !== "bar", el => el.border(UI.stroke).border_color(t.border));
}
export function dialog(t, id) {
    return surface(t, "dialog").id(id).size_full().p(16).gap(12);
}
export function dialogHeader(t, title, close, id) {
    return h_flex().flex_none().items_center().gap(8)
        .child(div().flex_1().min_w(0).text_size(16).font_semibold().child(title))
        .child(iconButton(t, id, "Close", div().child("×"), close, { quiet: true }));
}
export const dialogActions = () => h_flex().flex_none().gap(8).items_center().justify_end();
export function scrollBody(id, handle) {
    return v_flex().id(id).flex_1().min_h(0).gap(12).overflow_y_scrollbar().track_scroll(handle);
}
