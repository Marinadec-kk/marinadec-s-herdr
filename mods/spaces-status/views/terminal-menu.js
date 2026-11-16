import { closeOverlay, panes, terminals, run, theme } from "herdr";
import { record } from "../appearance-model.js";
import { Menu } from "../ui/menu.js";
import { pixelIcon } from "../pixel-ui.js";
export class TerminalMenu {
    constructor(target, overlay, cx) {
        this.target = target;
        this.menu = new Menu(cx, () => closeOverlay(overlay));
    }
    render() {
        const t = theme(), all = terminals().map(record);
        const terminal = all.find(term => term.address === this.target.terminal), parent = all.find(term => terminal?.parent && term.address === terminal.parent);
        const pane = typeof this.target.pane === "string" ? this.target.pane : "";
        const inTab = panes().some(p => p.pane === pane);
        const items = [];
        const item = (id, label, glyph, command, args) => items.push({ id: `terminal-menu-${id}`, label, icon: pixelIcon(glyph, t.muted), action: () => run(command, args) });
        if (inTab) {
            item("right", "Split right", "split", "pane.split", { pane, direction: "right" });
            item("down", "Split down", "splitDown", "pane.split", { pane, direction: "down" });
            item("zoom", "Zoom", "zoom", "pane.zoom", { pane });
        }
        if (terminal) {
            const program = record(terminal.labels)["herdr.right-click"] === "program";
            item("mouse", program ? "Use Herdr right-click menu" : "Send right-clicks to pane", "terminal", "terminal.right_click", { terminal: terminal.address, to: program ? "menu" : "program" });
            if (parent)
                item("park", `Send back to ${parent.name || parent.address}`, "right", "terminal.park", { terminal: terminal.address });
        }
        if (inTab)
            item("close", "Close pane", "close", "pane.close", { pane });
        return this.menu.render(t, "terminal-menu", items);
    }
}
