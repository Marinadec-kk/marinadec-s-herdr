// Creation history is app-owned: Git records shared repositories, not worktree ancestry.
import { machineKey, record } from "./appearance-model.js";
import type { AppearanceState, SpaceIdentity } from "./appearance-model.js";

export const LINEAGE_KEY = "spaces-status.worktree-lineage";
export interface WorktreeOrigin {
  machine: string | null;
  path: string;
  repo: string;
  branch: string;
  source: { space: string; name: string; path: string; branch: string; commit: string };
}
export type WorktreeLineage = Record<string, WorktreeOrigin>;
export const checkoutPath = (path: string): string => path.replace(/\\/g, "/").replace(/\/+$/, "");
export const checkoutKey = (machine: string | null, path: string): string => JSON.stringify([machine, checkoutPath(path)]);
export function readLineage(raw: unknown): WorktreeLineage {
  const out: WorktreeLineage = {};
  for (const value of Object.values(record(raw))) {
    const v = record(value), source = record(v.source);
    if (!(v.machine === null || typeof v.machine === "string") || typeof v.path !== "string" || !v.path
      || typeof v.repo !== "string" || typeof v.branch !== "string"
      || !["space", "name", "path", "branch", "commit"].every(key => typeof source[key] === "string")
      || !/^[a-f0-9]{40,64}$/i.test(source.commit as string)) continue;
    const entry: WorktreeOrigin = {
      machine: typeof v.machine === "string" ? v.machine : null, path: checkoutPath(v.path), repo: checkoutPath(v.repo), branch: v.branch,
      source: { space: source.space as string, name: source.name as string, path: checkoutPath(source.path as string),
        branch: source.branch as string, commit: source.commit as string },
    };
    out[checkoutKey(entry.machine, entry.path)] = entry;
  }
  return out;
}
export function sourceLabel(source: Pick<WorktreeOrigin["source"], "name" | "branch" | "commit">): string {
  const branch = source.branch || "detached";
  return `${source.name}${branch === source.name ? "" : ` · ${branch}`} @ ${source.commit.slice(0, 7)}`;
}
export const originLabel = (origin: WorktreeOrigin): string => `From ${sourceLabel(origin.source)}`;

export interface CheckoutIdentity extends SpaceIdentity { path: string; repo?: string }
export function originFor(lineage: WorktreeLineage, space: CheckoutIdentity): WorktreeOrigin | undefined {
  const origin = lineage[checkoutKey(space.machine ?? null, space.path)];
  return origin && (!space.repo || checkoutPath(space.repo) === origin.repo) ? origin : undefined;
}
// IDs are preferred while their checkout is still the source. A reopened checkout
// gets its new ID by exact machine/path, never by name or a guessed branch relation.
export function sourceParent(origin: WorktreeOrigin, spaces: readonly CheckoutIdentity[], state: AppearanceState): string | undefined {
  const candidates = spaces.filter(s => (s.machine ?? null) === origin.machine
    && checkoutPath(s.path) === origin.source.path && (!s.repo || checkoutPath(s.repo) === origin.repo));
  const live = candidates.find(s => s.id === origin.source.space) ?? candidates[0];
  if (live) return live.id;
  if (spaces.some(s => s.id === origin.source.space)) return undefined;
  return state.spaceDefaults[origin.source.space]?.machine === machineKey(origin.machine) ? origin.source.space : undefined;
}
