// One hierarchy projection for expanded/compact modes and navigation. Missing
// sources attach to their nearest visible ancestor; corrupt cycles remain visible.
export function spaceHierarchy(items, state) {
    const byId = new Map(items.map(item => [item.id, item])), parents = new Map();
    for (const item of items) {
        let parent = state.spaceDefaults[item.id]?.worktree ? state.spaceDefaults[item.id]?.parent : undefined;
        const seen = new Set([item.id]);
        while (parent && !seen.has(parent)) {
            seen.add(parent);
            const candidate = byId.get(parent);
            if (candidate) {
                if ((candidate.machine ?? null) === (item.machine ?? null))
                    parents.set(item.id, parent);
                break;
            }
            parent = state.spaceDefaults[parent]?.parent;
        }
    }
    for (const item of items) {
        const seen = new Set([item.id]);
        let at = parents.get(item.id);
        while (at && !seen.has(at)) {
            seen.add(at);
            at = parents.get(at);
        }
        if (at)
            parents.delete(item.id);
    }
    const children = (parent) => items.filter(item => parents.get(item.id) === parent);
    const out = [];
    const add = (parent, ancestors, continuations) => {
        const list = children(parent);
        list.forEach((item, index) => {
            const last = index === list.length - 1;
            out.push({ id: item.id, parent, depth: ancestors.length, last, ancestors, continuations });
            add(item.id, [...ancestors, item.id], [...continuations, !last]);
        });
    };
    add(undefined, [], []);
    return out;
}
