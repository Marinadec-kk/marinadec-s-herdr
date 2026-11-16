// Git plumbing adapted from Herdr 0.1.16 (Apache-2.0; see LICENSE-APACHE).
// Shared by the sidebar and panels. Repository reads are ref-only.
import { exec } from "herdr";
import { gitLine, joinPath, normalizePath, pathName } from "./paths.js";
import { parseGitStatus } from "./git-status.js";
export const GIT_READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false"];
export async function git(cwd, args, on, timeout) {
    const r = await exec("git", args, { cwd, on, ...(timeout === undefined ? {} : { timeout }) });
    return { ...r, ok: r.code === 0, out: gitLine(r.stdout ?? ""), err: (r.stderr || r.stdout || "").trim() };
}
export const repositoryTop = (cwd, on) => git(cwd, ["rev-parse", "--show-toplevel"], on);
export async function readRepository(cwd, on) {
    // Separate results: a folder name can itself contain newlines.
    const [top, common] = await Promise.all([
        repositoryTop(cwd, on), git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"], on),
    ]);
    if (!top.ok || !common.ok)
        return { repo: null, error: !top.ok ? top.err : common.err };
    const root = normalizePath(top.out), dir = normalizePath(common.out);
    const main = dir.endsWith("/.git") ? normalizePath(dir.slice(0, -4)) : dir;
    return { repo: { top: root, main, common: dir, name: dir.endsWith("/.git") ? pathName(main) : pathName(main).replace(/\.git$/, ""),
            linked: dir !== joinPath(root, ".git") }, error: "" };
}
export async function repoOf(cwd, on) {
    return (await readRepository(cwd, on)).repo;
}
export async function readGitStatus(cwd, on, limit) {
    const r = await git(cwd, [...GIT_READ, "status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"], on);
    if (!r.ok)
        throw new Error(r.err || "Could not read Git status.");
    return parseGitStatus(r.stdout, limit);
}
