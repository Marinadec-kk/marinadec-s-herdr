import { openOverlay, props, settings, spaces, run } from "herdr";
import { record } from "./appearance-model.js";
import { menuHeight } from "./ui/tokens.js";
export const overlayProps = (raw) => ({ ...record(raw), ...record(props()) });
export function openSurface(data, options) {
    const size = typeof window !== "undefined" ? window.viewport_size() : { width: 1000, height: 900 };
    const zoom = settings().zoom, scale = typeof zoom === "number" && zoom > 0 ? zoom : 1;
    const width = Math.max(160, Math.min(options.width, size.width / scale - 32));
    openOverlay({ mod: "spaces-status", kind: options.kind ?? "dialog", frame: "none", width,
        ...(options.at ? { at: options.at === "top" ? { x: (size.width / scale - width) / 2, y: options.offset ?? 42 } : options.at } : {}),
        ...(options.height ? { height: Math.max(100, Math.min(options.height, size.height / scale - 32)) } : {}),
        props: data });
}
export function openAppearance(target) {
    openSurface({ appearance: target }, { width: target.kind === "machine" ? 560 : 640,
        height: target.kind === "machine" ? 580 : target.tree ? 320 : 640 });
}
export function openSpaceMenu(id, checkout, tree) {
    openSurface({ spaceMenu: { id, checkout, tree } }, { kind: "popup", width: 280, height: menuHeight(checkout === "linked" ? 5 : 4) });
}
export function newSpaceInHome(machine = spaces().find(s => s.active)?.machine ?? null) {
    // Missing folder inherits cwd, even with an explicit machine. Herdr uses an
    // explicitly empty folder for that machine's home (literal "~" is not expanded).
    run("space.new", { machine: machine ?? "", folder: "" });
}
export function openWorktree(space, action) {
    const target = spaces().find(s => s.id === space);
    if (!target)
        return;
    openSurface({ view: "worktree", space, machine: target.machine ?? null, action }, { width: 560, height: action === "open" ? 480 : 360 });
}
export const openPicker = () => openSurface({ view: "picker" }, { kind: "popup", at: "top", offset: 42, width: 640, height: 560 });
export const openTabRename = (id) => openSurface({ view: "rename", id }, { width: 440, height: 210 });
export const openMachineAdd = () => openSurface({ view: "machine-add" }, { width: 560, height: 600 });
export function closeSpace(id) {
    if (spaces().some(s => s.id === id))
        openSurface({ view: "confirm-close", kind: "space", id }, { width: 440, height: 230 });
}
export function closeTab(id) {
    const space = spaces().find(s => s.tabs.some(tab => tab.id === id));
    if (!space)
        return;
    if (space.tabs.length > 1)
        run("tab.close", { id });
    else
        openSurface({ view: "confirm-close", kind: "tab", id }, { width: 440, height: 230 });
}
