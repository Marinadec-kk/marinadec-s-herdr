import { record } from "../appearance-model.js";
import { overlayProps } from "../overlays.js";
import { Picker } from "./picker.js";
import { RenameTab, ConfirmClose } from "./dialogs.js";
import { TerminalMenu } from "./terminal-menu.js";
import { Toast } from "./toast.js";
import { Worktree } from "./worktree.js";
import { MachineAdd } from "./machine-add.js";
import { Files } from "./files.js";
import { Changes } from "./changes.js";
export function createView(raw, cx) {
    const data = overlayProps(raw), overlay = typeof data.overlay === "string" ? data.overlay : "";
    if (data.view === "picker")
        return new Picker(overlay, cx);
    if (data.view === "machine-add")
        return new MachineAdd(overlay, cx);
    if (data.view === "files")
        return new Files(cx);
    if (data.view === "changes")
        return new Changes(cx);
    if (data.view === "worktree" && typeof data.space === "string")
        return new Worktree(data.space, data.action === "open" || data.action === "remove" ? data.action : "new", overlay, cx);
    if (data.view === "rename" && typeof data.id === "string")
        return new RenameTab(data.id, overlay, cx);
    if (data.view === "confirm-close" && typeof data.id === "string")
        return new ConfirmClose(data.kind === "tab" ? "tab" : "space", data.id, overlay, cx);
    if (data.tab === "pane")
        return new TerminalMenu(record(data.target), overlay, cx);
    if (typeof data.title === "string" || typeof data.body === "string")
        return new Toast(data, overlay);
    return null;
}
