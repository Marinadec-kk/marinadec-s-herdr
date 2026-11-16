import { div } from "gpui-kit";
import { InputState } from "gpui-base";
import { closeOverlay, run, spaces, theme } from "herdr";
import { button, textInput, secondary } from "../ui/controls.js";
import { dialogFrame, dialogFocus, dialogError, dialogActions } from "../ui/surfaces.js";
export class RenameTab {
    constructor(id, overlay, cx) {
        this.id = id;
        this.overlay = overlay;
        this.error = "";
        const tab = spaces().flatMap(s => s.tabs).find(tab => tab.id === id);
        const value = tab?.named ? tab.name : "";
        this.input = InputState.new({ value, placeholder: "Automatic name" });
        this.input.set_selected_range({ start: 0, end: value.length });
        this.input.on("submit", (_e, cx) => this.save(cx));
        this.handle = dialogFocus(cx, this.input);
    }
    save(cx) {
        if (!spaces().some(s => s.tabs.some(t => t.id === this.id))) {
            this.error = "This tab is no longer available.";
            cx.notify();
            return;
        }
        run("tab.rename", { id: this.id, name: this.input.value().trim() });
        closeOverlay(this.overlay);
    }
    render() {
        const t = theme(), close = () => closeOverlay(this.overlay);
        return dialogFrame(t, "rename-tab", "Rename tab", this.handle, close, "rename-close")
            .child(textInput(t, this.input))
            .when(Boolean(this.error), el => el.child(dialogError(t, this.error)))
            .child(div().flex_1())
            .child(dialogActions().child(button(t, "rename-cancel", "Cancel", close))
            .child(button(t, "rename-save", "Save", cx => this.save(cx), { selected: true })));
    }
}
export class ConfirmClose {
    constructor(kind, id, overlay, cx) {
        this.kind = kind;
        this.id = id;
        this.overlay = overlay;
        this.handle = dialogFocus(cx);
    }
    render() {
        const t = theme(), all = spaces();
        const target = this.kind === "space" ? all.find(s => s.id === this.id) : all.flatMap(s => s.tabs).find(tab => tab.id === this.id);
        const close = () => closeOverlay(this.overlay);
        const confirm = () => {
            if (spaces().some(s => this.kind === "space" ? s.id === this.id : s.tabs.some(tab => tab.id === this.id)))
                run(`${this.kind}.close`, { id: this.id, confirmed: true });
            close();
        };
        return dialogFrame(t, "confirm-close", `Close ${this.kind}?`, this.handle, close, "confirm-dismiss", (event, cx) => {
            if (event.key === "enter" && !event.is_held)
                confirm();
            else
                return;
            cx.stop_propagation();
        })
            .child(div().child(target ? `Close “${target.name}” and stop its terminals?` : "This item is no longer available."))
            .when(this.kind === "tab", el => el.child(secondary(t, "Closing the last tab also closes its space.")))
            .child(div().flex_1())
            .child(dialogActions().child(button(t, "confirm-cancel", "Cancel", close))
            .child(button(t, "confirm-accept", "Close", confirm, { disabled: !target })));
    }
}
