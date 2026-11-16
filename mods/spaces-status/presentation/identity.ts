import type { AppearanceState, Theme } from "../appearance-model.js";
import { assignSpaceColors, machineAvatar, machineColor, spaceAvatar, resolveColor } from "../appearance-model.js";
import type { SpaceInfo } from "herdr";

// Read-only projection: never allocates a default, rerolls, prunes or writes shared data.
export function identitySnapshot(state: AppearanceState, spaces: readonly SpaceInfo[], colors: unknown, t: Theme, dark: boolean) {
  const resolved = assignSpaceColors(spaces, colors, state, t, dark);
  return {
    machine: (name: string | null) => ({ avatar: machineAvatar(state, name), color: machineColor(state, name, t) }),
    space: (id: string) => ({ avatar: spaceAvatar(state, id), color: resolveColor(resolved[id], t) }),
  };
}
