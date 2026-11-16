import { spaces, focused, panes } from "herdr";
import { normalizePath } from "../data/paths.js";
export function panelLocation() {
    const space = spaces().find(s => s.active), f = focused();
    const pane = f?.pane ? panes().find(p => p.pane === f.pane) : null;
    const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
    const cwd = pane?.cwd || f?.cwd || space?.folder;
    return { cwd, on, space: space?.id, key: JSON.stringify([space?.id, on, cwd === undefined ? null : normalizePath(cwd)]) };
}
