import { div } from "gpui-kit";
import type { Context, Element } from "gpui-kit";
import { h_flex, Input, InputState } from "gpui-base";
import type { Theme } from "../appearance-model.js";
import { UI_FONT_SIZE } from "../appearance-model.js";
import { UI, SPACING } from "./tokens.js";

export type Action = (cx: Context) => void;
export interface ControlOptions { selected?: boolean; disabled?: boolean; quiet?: boolean }

// Every nested control consumes the whole gesture, not just the click:
// rows also use down/up for selection, dragging and window movement.
export function interactive(el: Element, t: Theme, label: string, action: Action, disabled = false): Element {
  return el.role("button").accessibility_label(disabled ? `${label} (unavailable)` : label)
    .tab_index(0).tab_stop(!disabled)
    .when(disabled, el => el.opacity(.5))
    .when(!disabled, el => el.cursor_pointer().hover(s => s.bg(t.hover).text_color(t.foreground))
      .focus(s => s.bg(t.selected)))
    .on_mouse_down("left", (_event, cx) => cx.stop_propagation())
    .on_mouse_up("left", (_event, cx) => cx.stop_propagation())
    .on_key_down((event, cx) => {
      if (event.key !== "enter" && event.key !== "space") return;
      cx.stop_propagation();
      if (!disabled && !event.is_held) action(cx);
    })
    .on_click((_event, cx) => { cx.stop_propagation(); if (!disabled) action(cx); });
}

export function button(t: Theme, id: string, label: string, action: Action, options: ControlOptions = {}): Element {
  return interactive(h_flex().id(id).h(UI.control).px(SPACING.control.inset).gap(SPACING.control.gap).flex_none().items_center().justify_center()
    .border(UI.stroke).border_color(options.selected ? t.accent : t.border)
    .bg(options.selected ? t.selected : t.raised).text_color(t.foreground), t, label, action, options.disabled)
    .child(label);
}

export function iconButton(t: Theme, id: string, label: string, icon: Element, action: Action, options: ControlOptions = {}): Element {
  return interactive(h_flex().id(id).size(UI.iconTarget).flex_none().items_center().justify_center()
    .text_color(t.muted).tooltip(label)
    .when(!options.quiet, el => el.border(UI.stroke).border_color(options.selected ? t.accent : t.border))
    .when(Boolean(options.selected), el => el.bg(t.selected)), t, label, action, options.disabled).child(icon);
}

export function actionRow(t: Theme, id: string, label: string, action: Action, options: ControlOptions = {}): Element {
  return interactive(h_flex().id(id).h(UI.control).px(SPACING.row.inset).gap(SPACING.row.gap).flex_none().items_center()
    .text_color(t.muted).when(Boolean(options.selected), el => el.bg(t.selected)),
  t, label, action, options.disabled);
}

export function textInput(t: Theme, state: InputState): Element {
  return Input.new(state).h(UI.control).flex_none().px(SPACING.control.inset).rounded(0).border(UI.stroke).border_color(t.input)
    .bg(t.background).text_size(UI_FONT_SIZE).text_color(t.foreground).focus(el => el.border_color(t.accent));
}

export const secondary = (t: Theme, text: string): Element => div().text_size(UI.secondary).text_color(t.muted).child(text);
export const shortcut = (t: Theme, text: string): Element => secondary(t, text).flex_none().text_color(t.dim);
