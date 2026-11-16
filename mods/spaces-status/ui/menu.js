import { div } from "gpui-kit";
import { h_flex, v_flex, ScrollHandle } from "gpui-base";
import { shortcut } from "./controls.js";
import { surface } from "./surfaces.js";
import { UI, menuHeight } from "./tokens.js";
export class Menu {
    constructor(cx, close) {
        this.close = close;
        this.scroll = ScrollHandle.new();
        this.handle = cx.focus_handle();
        this.handle.focus();
    }
    render(t, id, items) {
        const enabled = items.filter(item => item.enabled !== false);
        this.selected = enabled.find(item => item.id === this.selected)?.id ?? enabled[0]?.id;
        const choose = (item, cx) => {
            if (!item || item.enabled === false)
                return;
            this.close();
            item.action(cx);
        };
        const reveal = () => {
            const index = items.findIndex(item => item.id === this.selected);
            if (index >= 0)
                this.scroll.scroll_to_item(index);
        };
        // Scroll containers have no intrinsic content height in native layout. Give
        // the menu a real extent before flexing its scrollable list inside it.
        return surface(t, "menu").id(id).role("menu").track_focus(this.handle).w_full()
            .h(menuHeight(items.length)).max_h_full().p(UI.menuInset).gap(2)
            .on_key_down((event, cx) => {
            const at = enabled.findIndex(item => item.id === this.selected);
            if (event.key === "escape")
                this.close();
            else if (event.key === "down" || event.key === "up") {
                if (enabled.length)
                    this.selected = enabled[(at + (event.key === "down" ? 1 : enabled.length - 1)) % enabled.length].id;
                reveal();
            }
            else if (event.key === "home" || event.key === "end") {
                this.selected = (event.key === "home" ? enabled[0] : enabled[enabled.length - 1])?.id;
                reveal();
            }
            else if (event.key === "enter" || event.key === "space")
                choose(enabled[at], cx);
            else if (!event.modifiers.control && !event.modifiers.platform && !event.modifiers.alt) {
                const item = enabled.find(item => item.hotkey === event.key);
                if (!item)
                    return;
                choose(item, cx);
            }
            else
                return;
            cx.stop_propagation();
            cx.notify();
        })
            .child(v_flex().id(`${id}-list`).flex_1().min_h(0).overflow_y_scrollbar().track_scroll(this.scroll)
            .on_size_change(reveal)
            .children(items.map(item => h_flex().id(item.id).role("menu_item").accessibility_label(item.label)
            .h(UI.control).flex_none().px(UI.inset).gap(8).items_center()
            .text_color(item.enabled === false ? t.dim : t.foreground)
            .when(item.id === this.selected, el => el.bg(t.selected))
            .when(item.enabled !== false, el => el.cursor_pointer().hover(el => el.bg(t.hover))
            .on_hover((hovered, cx) => { if (hovered) {
            this.selected = item.id;
            cx.notify();
        } }))
            .on_click((_event, cx) => { cx.stop_propagation(); choose(item, cx); })
            .children(item.icon ? [item.icon] : [])
            .child(div().flex_1().min_w(0).child(item.label)).child(shortcut(t, item.hint ?? "")))));
    }
}
