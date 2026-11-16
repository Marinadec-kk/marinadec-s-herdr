import { div } from "gpui-kit";
import type { AsyncContext, Context, Element, KeyEvent } from "gpui-kit";
import { h_flex, v_flex, ScrollHandle } from "gpui-base";
import { UI_FONT, UI_FONT_SIZE } from "../appearance-model.js";
import type { Theme } from "../appearance-model.js";
import { iconButton, secondary } from "./controls.js";
import { UI } from "./tokens.js";

export function surface(t: Theme, kind: "bar" | "panel" | "dialog" | "menu"): Element {
  const el = kind === "bar" ? h_flex().items_center() : v_flex();
  return el.min_w(0).min_h(0).font_family(UI_FONT).text_size(UI_FONT_SIZE).text_color(t.foreground)
    .bg(kind === "bar" ? t.chrome : kind === "panel" ? t.background : t.popover)
    .when(kind !== "bar", el => el.border(UI.stroke).border_color(t.border));
}

export function dialog(t: Theme, id: string): Element {
  return surface(t, "dialog").id(id).size_full().p(16).gap(12);
}

export function dialogHeader(t: Theme, title: string, close: () => void, id: string): Element {
  return h_flex().flex_none().items_center().gap(8)
    .child(div().flex_1().min_w(0).text_size(16).font_semibold().child(title))
    .child(iconButton(t, id, "Close", div().child("×"), close, { quiet: true }));
}
export function dialogFocus(cx: AsyncContext, input?: { focus(): void }): ReturnType<Context["focus_handle"]> {
  const handle = cx.focus_handle(); handle.focus(); input?.focus(); return handle;
}
export function dialogFrame(t: Theme, id: string, title: string, handle: ReturnType<Context["focus_handle"]>,
  close: () => void, closeId: string, key?: (event: KeyEvent, cx: Context) => void): Element {
  return dialog(t, id).track_focus(handle).on_key_down((event, cx) => {
    if (event.key === "escape") { cx.stop_propagation(); close(); }
    else key?.(event, cx);
  }).child(dialogHeader(t, title, close, closeId));
}
export function panelHeader(t: Theme, title: string, leading?: Element): Element {
  return h_flex().h(42).flex_none().px(12).gap(8).items_center().border_b(UI.stroke).border_color(t.border)
    .children(leading ? [leading] : []).child(div().font_semibold().child(title));
}
export const emptyState = (t: Theme, message: string): Element => secondary(t, message).p(8);
export const dialogError = (t: Theme, message: string): Element => secondary(t, message).text_color(t.blocked);

export const dialogActions = (): Element => h_flex().flex_none().gap(8).items_center().justify_end();
export function scrollBody(id: string, handle: ScrollHandle): Element {
  return v_flex().id(id).flex_1().min_h(0).gap(12).overflow_y_scrollbar().track_scroll(handle);
}
