import type { AgentInfo, PaneInfo, SpaceInfo, TabInfo } from "herdr";
import { normalizePath, joinPath } from "../data/paths.js";

export const machineLabel = (machine: string | null | undefined): string => machine || "This computer";

export function tabLabel(tab: Pick<TabInfo, "name" | "named">, lead?: Pick<PaneInfo, "title" | "program"> & { terminal?: string | null }): string {
  if (tab.named) return tab.name;
  const program = lead?.program, title = lead?.title ?? "";
  const base = program?.name ?? "Terminal";
  if (!program?.agent) return base;
  const clean = title.replace(/^[^\p{L}\p{N}\p{Ps}\p{Pi}~/\\]+/u, "").replace(/^\[ [!.] \] /, "").trim();
  const path = /^[~/\\]|^[A-Za-z]:[\\/]/.test(clean);
  return clean && !path && !clean.includes("@") && clean !== lead?.terminal
    && clean.toLowerCase() !== program.name.toLowerCase() && clean.toLowerCase() !== program.key.toLowerCase()
    ? clean : base;
}

export function tabLead(id: string, panes: readonly PaneInfo[], agents: readonly AgentInfo[] = []): PaneInfo | AgentInfo | undefined {
  return panes.find(p => p.tab === id && p.program?.agent) ?? agents.find(a => a.tab === id)
    ?? panes.find(p => p.tab === id);
}

export function shortPath(path: string, home: string): string {
  const p = normalizePath(path), h = normalizePath(home), prefix = joinPath(h, "");
  return h && p === h ? "~" : h && p.startsWith(prefix) ? "~/" + p.slice(prefix.length) : path;
}

export function spaceFolder(space: SpaceInfo, panes: readonly PaneInfo[]): string {
  const tabs = new Set((space.tabs ?? []).map(tab => tab.id));
  return panes.find(p => tabs.has(p.tab) && p.cwd)?.cwd || space.folder;
}
