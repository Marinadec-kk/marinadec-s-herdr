import { div } from "gpui-kit";
import { h_flex, Input } from "gpui-base";
import { UI_FONT_SIZE } from "../appearance-model.js";
import { UI } from "./tokens.js";
// Every nested control consumes the whole gesture, not just the click:
// rows also use down/up for selection, dragging and window movement.
export function interactive(el, t, label, action, disabled = false) {
    return el.role("button").accessibility_label(disabled ? `${label} (unavailable)` : label)
        .tab_index(disabled ? -1 : 0)
        .when(disabled, el => el.opacity(.5))
        .when(!disabled, el => el.cursor_pointer().hover(s => s.bg(t.hover).text_color(t.foreground))
        .focus(s => s.bg(t.selected)))
        .on_mouse_down("left", (_event, cx) => cx.stop_propagation())
        .on_mouse_up("left", (_event, cx) => cx.stop_propagation())
        .on_key_down((event, cx) => {
        if (event.key !== "enter" && event.key !== "space")
            return;
        cx.stop_propagation();
        if (!disabled && !event.is_held)
            action(cx);
    })
        .on_click((_event, cx) => { cx.stop_propagation(); if (!disabled)
        action(cx); });
}
export function button(t, id, label, action, options = {}) {
    return interactive(h_flex().id(id).h(UI.control).px(10).gap(8).flex_none().items_center().justify_center()
        .border(UI.stroke).border_color(options.selected ? t.accent : t.border)
        .bg(options.selected ? t.selected : t.raised).text_color(t.foreground), t, label, action, options.disabled)
        .child(label);
}
export function iconButton(t, id, label, icon, action, options = {}) {
    return interactive(h_flex().id(id).size(UI.iconTarget).flex_none().items_center().justify_center()
        .text_color(t.muted).tooltip(label)
        .when(!options.quiet, el => el.border(UI.stroke).border_color(options.selected ? t.accent : t.border))
        .when(Boolean(options.selected), el => el.bg(t.selected)), t, label, action, options.disabled).child(icon);
}
export function actionRow(t, id, label, action, options = {}) {
    return interactive(h_flex().id(id).h(UI.control).px(UI.inset).gap(8).flex_none().items_center()
        .text_color(t.muted).when(Boolean(options.selected), el => el.bg(t.selected)), t, label, action, options.disabled);
}
export function textInput(t, state) {
    return Input.new(state).h(UI.control).flex_none().px(9).rounded(0).border(UI.stroke).border_color(t.input)
        .bg(t.background).text_size(UI_FONT_SIZE).text_color(t.foreground).focus(el => el.border_color(t.accent));
}
export const secondary = (t, text) => div().text_size(UI.secondary).text_color(t.muted).child(text);
export const shortcut = (t, text) => secondary(t, text).flex_none().text_color(t.dim);
