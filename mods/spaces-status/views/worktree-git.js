// Adapted from Herdr 0.1.16 worktree (Apache-2.0; see LICENSE-APACHE).
import { exec, readTextFile, appHome } from "herdr";
export async function git(cwd, args, on, timeout) {
    const r = await exec("git", args, { cwd, on, ...(timeout === undefined ? {} : { timeout }) });
    return { ok: r.code === 0, out: (r.stdout ?? "").trim(), err: (r.stderr || r.stdout || "").trim() };
}
export async function worktreeRoot(userHome) {
    const raw = await readTextFile(`${appHome()}/settings.json`);
    const directory = (raw === null ? {} : JSON.parse(raw))?.worktrees?.directory ?? "~/.herdr/worktrees";
    if (typeof directory !== "string" || !directory.trim())
        throw new Error("worktrees.directory must be a non-empty path.");
    let path = directory.replace(/\\/g, "/");
    if (path === "~" || path.startsWith("~/"))
        path = userHome.replace(/\\/g, "/").replace(/\/$/, "") + path.slice(1);
    if (!path.startsWith("/") && !/^[A-Za-z]:\//.test(path))
        throw new Error("worktrees.directory must be an absolute path or start with ~/.");
    return path.replace(/\/+$/, "");
}
export function branchSlug(branch) {
    const normalized = branch.normalize("NFC");
    const name = normalized.replace(/[^\p{L}\p{M}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "");
    if (name)
        return name;
    let hash = 2166136261;
    for (const char of normalized)
        hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
    return `branch-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
export async function repoOf(folder, on) {
    const top = await git(folder, ["rev-parse", "--show-toplevel"], on);
    const common = await git(folder, ["rev-parse", "--path-format=absolute", "--git-common-dir"], on);
    if (!top.ok || !common.ok)
        return null;
    const main = common.out.endsWith("/.git") ? common.out.slice(0, -5) : common.out;
    return { top: top.out, main, name: main.split("/").pop() ?? "repository", linked: main !== top.out };
}
export async function headOf(folder, on) {
    const head = await git(folder, ["rev-parse", "--verify", "HEAD"], on);
    if (!head.ok || !/^[a-f0-9]{40,64}$/i.test(head.out))
        throw new Error(head.err || "This checkout has no commit to branch from.");
    const branch = await git(folder, ["symbolic-ref", "--quiet", "--short", "HEAD"], on);
    return { commit: head.out, branch: branch.ok ? branch.out : "" };
}
export async function checkouts(repo, on) {
    const list = await git(repo.main, ["worktree", "list", "--porcelain"], on);
    if (!list.ok)
        throw new Error(list.err || "Could not list worktrees.");
    const refs = await git(repo.main, ["for-each-ref", "--format=%(refname:short)%09%(committerdate:unix)", "refs/heads"], on);
    const when = new Map(refs.out.split("\n").map(line => line.split("\t")).map(([b, at]) => [b, Number(at) || 0]));
    const out = [];
    for (const block of list.out.split(/\n\n+/)) {
        const lines = block.split("\n"), path = lines.find(line => line.startsWith("worktree "))?.slice(9);
        if (!path || lines.some(line => line === "bare" || line.startsWith("prunable")))
            continue;
        const branch = lines.find(line => line.startsWith("branch "))?.slice(7).replace(/^refs\/heads\//, "") ?? null;
        out.push({ path, branch, main: out.length === 0, at: branch ? when.get(branch) ?? 0 : 0 });
    }
    return out.sort((a, b) => Number(b.main) - Number(a.main) || b.at - a.at);
}
async function modules(gitDir, config, on, out = [], parent = "") {
    const keys = await git(gitDir, ["--git-dir", gitDir, "config", ...config, "-z", "--get-regexp", "^submodule\\..*\\.path$"], on);
    if (!keys.ok)
        return out;
    for (const record of keys.out.split("\0").filter(Boolean)) {
        const at = record.indexOf("\n"), name = record.slice("submodule.".length, at - ".path".length);
        const dir = `${gitDir}/modules/${name}`;
        if (!(await git(gitDir, ["--git-dir", dir, "rev-parse", "--git-dir"], on)).ok)
            continue;
        const pinned = await git(gitDir, ["--git-dir", gitDir, "rev-parse", `HEAD:${record.slice(at + 1)}`], on);
        out.push({ name: parent + name, dir, pinned: pinned.ok ? pinned.out : "" });
        if ((await git(gitDir, ["--git-dir", dir, "cat-file", "-e", "HEAD:.gitmodules"], on)).ok)
            await modules(dir, ["--blob", "HEAD:.gitmodules"], on, out, `${parent + name}/`);
    }
    return out;
}
export async function removalState(repo, on) {
    const status = await git(repo.top, ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain"], on);
    if (!status.ok)
        throw new Error(status.err || "Could not check worktree changes.");
    const gitDir = await git(repo.top, ["rev-parse", "--absolute-git-dir"], on);
    if (!gitDir.ok)
        throw new Error(gitDir.err || "Could not find the worktree Git directory.");
    const mods = await modules(gitDir.out, ["--file", `${repo.top}/.gitmodules`], on), unpushed = [];
    for (const m of mods) {
        const local = await git(gitDir.out, ["--git-dir", m.dir, "rev-list", "-n1", "--all", "--not", "--remotes", ...(m.pinned ? [m.pinned] : [])], on);
        if (!local.ok)
            throw new Error(local.err || `Couldn't check submodule ${m.name}.`);
        if (local.out)
            unpushed.push(m.name);
    }
    return { dirty: Boolean(status.out), modules: mods.length, unpushed };
}
