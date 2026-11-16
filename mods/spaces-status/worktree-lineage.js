// Creation history is app-owned: Git records shared repositories, not worktree ancestry.
import { machineKey, record } from "./appearance-model.js";
import { normalizePath, pathKey } from "./data/paths.js";
export const LINEAGE_KEY = "spaces-status.worktree-lineage";
export const checkoutPath = normalizePath;
export const checkoutKey = pathKey;
export function readLineage(raw) {
    const out = {};
    for (const value of Object.values(record(raw))) {
        const v = record(value), source = record(v.source);
        if (!(v.machine === null || typeof v.machine === "string") || typeof v.path !== "string" || !v.path
            || typeof v.repo !== "string" || typeof v.branch !== "string"
            || !["space", "name", "path", "branch", "commit"].every(key => typeof source[key] === "string")
            || !/^[a-f0-9]{40,64}$/i.test(source.commit))
            continue;
        const entry = {
            machine: typeof v.machine === "string" ? v.machine : null, path: checkoutPath(v.path), repo: checkoutPath(v.repo), branch: v.branch,
            source: { space: source.space, name: source.name, path: checkoutPath(source.path),
                branch: source.branch, commit: source.commit },
        };
        out[checkoutKey(entry.machine, entry.path)] = entry;
    }
    return out;
}
export function sourceLabel(source) {
    const branch = source.branch || "detached";
    return `${source.name}${branch === source.name ? "" : ` · ${branch}`} @ ${source.commit.slice(0, 7)}`;
}
export const originLabel = (origin) => `From ${sourceLabel(origin.source)}`;
export function originFor(lineage, space) {
    const origin = lineage[checkoutKey(space.machine ?? null, space.path)];
    return origin && (!space.repo || checkoutPath(space.repo) === origin.repo) ? origin : undefined;
}
// IDs are preferred while their checkout is still the source. A reopened checkout
// gets its new ID by exact machine/path, never by name or a guessed branch relation.
export function sourceParent(origin, spaces, state) {
    const candidates = spaces.filter(s => (s.machine ?? null) === origin.machine
        && checkoutPath(s.path) === origin.source.path && (!s.repo || checkoutPath(s.repo) === origin.repo));
    const live = candidates.find(s => s.id === origin.source.space) ?? candidates[0];
    if (live)
        return live.id;
    if (spaces.some(s => s.id === origin.source.space))
        return undefined;
    return state.spaceDefaults[origin.source.space]?.machine === machineKey(origin.machine) ? origin.source.space : undefined;
}
