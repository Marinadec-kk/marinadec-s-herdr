import { assignSpaceColors, machineAvatar, machineColor, spaceAvatar, resolveColor } from "../appearance-model.js";
// Read-only projection: never allocates a default, rerolls, prunes or writes shared data.
export function identitySnapshot(state, spaces, colors, t, dark) {
    const resolved = assignSpaceColors(spaces, colors, state, t, dark);
    return {
        machine: (name) => ({ avatar: machineAvatar(state, name), color: machineColor(state, name, t) }),
        space: (id) => ({ avatar: spaceAvatar(state, id), color: resolveColor(resolved[id], t) }),
    };
}
