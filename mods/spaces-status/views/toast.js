import { div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { closeOverlay, run, theme } from "herdr";
import { record } from "../appearance-model.js";
import { button, interactive } from "../ui/controls.js";
import { surface } from "../ui/surfaces.js";
import { pixelButton } from "../pixel-ui.js";
import { UI } from "../ui/tokens.js";
export class Toast {
    constructor(data, overlay) {
        this.data = data;
        this.overlay = overlay;
        this.copied = false;
    }
    render() {
        const t = theme(), p = this.data;
        const body = typeof p.body === "string" ? p.body : "", title = typeof p.title === "string" ? p.title : "";
        const login = /^([a-z0-9][a-z0-9_.-]{0,31}) needs login; run hc machine login \1$/.exec(body);
        const command = login ? `hc machine login ${login[1]}` : "";
        const color = { error: t.blocked, warning: t.working, success: t.done }[String(p.level)] ?? t.accent;
        return interactive(surface(t, "bar").id("toast").size_full().px(12).gap(12).bg(t.popover).border(UI.stroke).border_color(t.border), t, title, () => {
            const action = record(p.action);
            if (typeof action.name === "string")
                run(action.name, record(action.args));
            closeOverlay(this.overlay);
        })
            .child(typeof p.icon === "string" ? image(p.icon).size(18).flex_none() : div().size(6).flex_none().bg(color))
            .child(v_flex().flex_1().min_w(0)
            .child(div().truncate().font_semibold().child(login ? `${login[1]} needs a login` : title))
            .when(!login && Boolean(body), el => el.child(div().truncate().text_size(12).text_color(t.muted).tooltip(body).child(body)))
            .when(Boolean(login), el => el.child(h_flex().gap(8).items_center()
            .child(div().truncate().text_size(12).tooltip(command).child(command))
            .child(button(t, "toast-login-copy", this.copied ? "Copied" : "Copy", cx => {
            cx.write_to_clipboard(command);
            this.copied = true;
            cx.notify();
        })))))
            .child(pixelButton(t, "toast-dismiss", "close", "Dismiss", () => closeOverlay(this.overlay), { quiet: true }));
    }
}
