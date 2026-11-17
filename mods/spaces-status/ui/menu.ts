import type { AsyncContext, Context, Element } from "gpui-kit";
import { div } from "gpui-kit";
import { h_flex, v_flex, ScrollHandle } from "gpui-base";
import type { Theme } from "../appearance-model.js";
import { shortcut } from "./controls.js";
import { surface } from "./surfaces.js";
import { UI, SPACING, menuHeight } from "./tokens.js";

export interface MenuItem {
  id: string; label: string; action: (cx: Context) => void;
  icon?: Element | null; hint?: string; hotkey?: string; enabled?: boolean;
}

export class Menu {
  private handle: ReturnType<Context["focus_handle"]>;
  private scroll = ScrollHandle.new();
  private selected: string | undefined;
  constructor(cx: AsyncContext, private close: () => void) {
    this.handle = cx.focus_handle(); this.handle.focus();
  }
  render(t: Theme, id: string, items: MenuItem[]): Element {
    const enabled = items.filter(item => item.enabled !== false);
    this.selected = enabled.find(item => item.id === this.selected)?.id ?? enabled[0]?.id;
    const choose = (item: MenuItem | undefined, cx: Context) => {
      if (!item || item.enabled === false) return;
      this.close(); item.action(cx);
    };
    const reveal = () => {
      const index = items.findIndex(item => item.id === this.selected);
      if (index >= 0) this.scroll.scroll_to_item(index);
    };
    // Scroll containers have no intrinsic content height in native layout. Give
    // the menu a real extent before flexing its scrollable list inside it.
    return surface(t, "menu").id(id).role("menu").track_focus(this.handle).w_full()
      .h(menuHeight(items.length)).max_h_full().p(SPACING.menu.inset)
      .on_key_down((event, cx) => {
        const at = enabled.findIndex(item => item.id === this.selected);
        if (event.key === "escape") this.close();
        else if (event.key === "down" || event.key === "up") {
          if (enabled.length) this.selected = enabled[(at + (event.key === "down" ? 1 : enabled.length - 1)) % enabled.length].id;
          reveal();
        } else if (event.key === "home" || event.key === "end") {
          this.selected = (event.key === "home" ? enabled[0] : enabled[enabled.length - 1])?.id; reveal();
        } else if (event.key === "enter" || event.key === "space") choose(enabled[at], cx);
        else if (!event.modifiers.control && !event.modifiers.platform && !event.modifiers.alt) {
          const item = enabled.find(item => item.hotkey === event.key);
          if (!item) return;
          choose(item, cx);
        } else return;
        cx.stop_propagation(); cx.notify();
      })
      .child(v_flex().id(`${id}-list`).flex_1().min_h(0).gap(SPACING.menu.rowGap).overflow_y_scrollbar().track_scroll(this.scroll)
        .on_size_change(reveal)
        .children(items.map(item => h_flex().id(item.id).role("menu_item").accessibility_label(item.label)
          .h(UI.control).flex_none().px(SPACING.row.inset).gap(SPACING.menu.gap).items_center()
          .text_color(item.enabled === false ? t.dim : t.foreground)
          .when(item.id === this.selected, el => el.bg(t.selected))
          .when(item.enabled !== false, el => el.cursor_pointer().hover(el => el.bg(t.hover))
            .on_hover((hovered, cx) => { if (hovered) { this.selected = item.id; cx.notify(); } }))
          .on_click((_event, cx) => { cx.stop_propagation(); choose(item, cx); })
          .children(item.icon ? [item.icon] : [])
          .child(div().flex_1().min_w(0).truncate().tooltip(item.label).child(item.label))
          .child(shortcut(t, item.hint ?? "").max_w(100).truncate().tooltip(item.hint ?? "")))));
  }
}
