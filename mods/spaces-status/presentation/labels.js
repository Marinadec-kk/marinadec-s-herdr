import { normalizePath, joinPath } from "../data/paths.js";
export const machineLabel = (machine) => machine || "This computer";
export function tabLabel(tab, lead) {
    if (tab.named)
        return tab.name;
    const program = lead?.program, title = lead?.title ?? "";
    const base = program?.name ?? "Terminal";
    if (!program?.agent)
        return base;
    const clean = title.replace(/^[^\p{L}\p{N}\p{Ps}\p{Pi}~/\\]+/u, "").replace(/^\[ [!.] \] /, "").trim();
    const path = /^[~/\\]|^[A-Za-z]:[\\/]/.test(clean);
    return clean && !path && !clean.includes("@") && clean !== lead?.terminal
        && clean.toLowerCase() !== program.name.toLowerCase() && clean.toLowerCase() !== program.key.toLowerCase()
        ? clean : base;
}
export function tabLead(id, panes, agents = []) {
    return panes.find(p => p.tab === id && p.program?.agent) ?? agents.find(a => a.tab === id)
        ?? panes.find(p => p.tab === id);
}
export function shortPath(path, home) {
    const p = normalizePath(path), h = normalizePath(home), prefix = joinPath(h, "");
    return h && p === h ? "~" : h && p.startsWith(prefix) ? "~/" + p.slice(prefix.length) : path;
}
export function spaceFolder(space, panes) {
    const tabs = new Set((space.tabs ?? []).map(tab => tab.id));
    return panes.find(p => tabs.has(p.tab) && p.cwd)?.cwd || space.folder;
}
