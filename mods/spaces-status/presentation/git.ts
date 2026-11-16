import type { Theme } from "../appearance-model.js";
import type { GitMark } from "../data/git-status.js";

export const gitMarkColor = (t: Theme, mark: GitMark): Theme["foreground"] => mark === "A" ? t.ansi2 : mark === "D" || mark === "U" ? t.ansi1 : t.blocked;
