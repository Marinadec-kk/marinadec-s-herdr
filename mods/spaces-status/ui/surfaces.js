import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { UI_FONT, UI_FONT_SIZE } from "../appearance-model.js";
import { iconButton, secondary } from "./controls.js";
import { UI, SPACING, CHROME } from "./tokens.js";
export function surface(t, kind) {
    const el = kind === "bar" ? h_flex().items_center() : v_flex();
    return el.min_w(0).min_h(0).font_family(UI_FONT).text_size(UI_FONT_SIZE).text_color(t.foreground)
        .bg(kind === "bar" ? t.chrome : kind === "panel" ? t.background : t.popover)
        .when(kind !== "bar", el => el.border(UI.stroke).border_color(t.border));
}
export function dialog(t, id) {
    return surface(t, "dialog").id(id).size_full().p(SPACING.dialog.inset).gap(SPACING.dialog.gap);
}
export function dialogHeader(t, title, close, id) {
    return h_flex().flex_none().items_center().gap(SPACING.row.gap)
        .child(div().flex_1().min_w(0).text_size(16).font_semibold().truncate().tooltip(title).child(title))
        .child(iconButton(t, id, "Close", div().child("×"), close, { quiet: true }));
}
export function dialogFocus(cx, input) {
    const handle = cx.focus_handle();
    handle.focus();
    input?.focus();
    return handle;
}
export function dialogFrame(t, id, title, handle, close, closeId, key) {
    return dialog(t, id).track_focus(handle).on_key_down((event, cx) => {
        if (event.key === "escape") {
            cx.stop_propagation();
            close();
        }
        else
            key?.(event, cx);
    }).child(dialogHeader(t, title, close, closeId));
}
export function panelHeader(t, title, leading) {
    return h_flex().h(CHROME.tabs).flex_none().px(SPACING.panel.inset).gap(SPACING.panel.gap).items_center().border_b(UI.stroke).border_color(t.border)
        .children(leading ? [leading] : []).child(div().font_semibold().child(title));
}
export const emptyState = (t, message) => secondary(t, message).p(SPACING.panel.inset);
export const dialogError = (t, message) => secondary(t, message).text_color(t.blocked);
export const dialogActions = () => h_flex().flex_none().flex_wrap().gap(SPACING.control.gap).items_center().justify_end();
export function scrollBody(id, handle) {
    return v_flex().id(id).flex_1().min_h(0).gap(SPACING.dialog.gap).overflow_y_scrollbar().track_scroll(handle);
}
