// Adapted from Herdr 0.1.16 worktree (Apache-2.0; see LICENSE-APACHE).
import { readTextFile, appHome } from "herdr";
import { git } from "../data/git.js";
import type { Repository } from "../data/git.js";
import { normalizePath } from "../data/paths.js";
export { git, repoOf } from "../data/git.js";
export type { Repository } from "../data/git.js";

export interface Checkout { path: string; branch: string | null; main: boolean; at: number }
export interface Head { branch: string; commit: string }
interface Submodule { name: string; dir: string; pinned: string }

export async function worktreeRoot(userHome: string): Promise<string> {
  const raw = await readTextFile(`${appHome()}/settings.json`);
  const directory: unknown = (raw === null ? {} : JSON.parse(raw))?.worktrees?.directory ?? "~/.herdr/worktrees";
  if (typeof directory !== "string" || !directory.trim()) throw new Error("worktrees.directory must be a non-empty path.");
  let path = normalizePath(directory);
  if (path === "~" || path.startsWith("~/")) path = normalizePath(userHome).replace(/\/$/, "") + path.slice(1);
  if (!path.startsWith("/") && !/^[A-Za-z]:\//.test(path)) throw new Error("worktrees.directory must be an absolute path or start with ~/.");
  return normalizePath(path);
}
export function branchSlug(branch: string): string {
  const normalized = branch.normalize("NFC");
  const name = normalized.replace(/[^\p{L}\p{M}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "");
  if (name) return name;
  let hash = 2166136261;
  for (const char of normalized) hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619);
  return `branch-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
export async function headOf(folder: string, on: string | null): Promise<Head> {
  const head = await git(folder, ["rev-parse", "--verify", "HEAD"], on);
  if (!head.ok || !/^[a-f0-9]{40,64}$/i.test(head.out)) throw new Error(head.err || "This checkout has no commit to branch from.");
  const branch = await git(folder, ["symbolic-ref", "--quiet", "--short", "HEAD"], on);
  return { commit: head.out, branch: branch.ok ? branch.out : "" };
}
export async function checkouts(repo: Repository, on: string | null): Promise<Checkout[]> {
  const list = await git(repo.main, ["worktree", "list", "--porcelain", "-z"], on);
  if (!list.ok) throw new Error(list.err || "Could not list worktrees.");
  const refs = await git(repo.main, ["for-each-ref", "--format=%(refname:short)%09%(committerdate:unix)", "refs/heads"], on);
  const when = new Map(refs.out.split("\n").map(line => line.split("\t")).map(([b, at]) => [b, Number(at) || 0]));
  const out: Checkout[] = [];
  for (const block of list.stdout.split("\0\0")) {
    const lines = block.split("\0"), path = lines.find(line => line.startsWith("worktree "))?.slice(9);
    if (!path || lines.some(line => line === "bare" || line.startsWith("prunable"))) continue;
    const branch = lines.find(line => line.startsWith("branch "))?.slice(7).replace(/^refs\/heads\//, "") ?? null;
    out.push({ path, branch, main: out.length === 0, at: branch ? when.get(branch) ?? 0 : 0 });
  }
  return out.sort((a, b) => Number(b.main) - Number(a.main) || b.at - a.at);
}
async function modules(gitDir: string, config: string[], on: string | null, out: Submodule[] = [], parent = ""): Promise<Submodule[]> {
  const keys = await git(gitDir, ["--git-dir", gitDir, "config", ...config, "-z", "--get-regexp", "^submodule\\..*\\.path$"], on);
  if (!keys.ok) return out;
  for (const record of keys.out.split("\0").filter(Boolean)) {
    const at = record.indexOf("\n"), name = record.slice("submodule.".length, at - ".path".length);
    const dir = `${gitDir}/modules/${name}`;
    if (!(await git(gitDir, ["--git-dir", dir, "rev-parse", "--git-dir"], on)).ok) continue;
    const pinned = await git(gitDir, ["--git-dir", gitDir, "rev-parse", `HEAD:${record.slice(at + 1)}`], on);
    out.push({ name: parent + name, dir, pinned: pinned.ok ? pinned.out : "" });
    if ((await git(gitDir, ["--git-dir", dir, "cat-file", "-e", "HEAD:.gitmodules"], on)).ok)
      await modules(dir, ["--blob", "HEAD:.gitmodules"], on, out, `${parent + name}/`);
  }
  return out;
}
export async function removalState(repo: Repository, on: string | null): Promise<{ dirty: boolean; modules: number; unpushed: string[] }> {
  const status = await git(repo.top, ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain"], on);
  if (!status.ok) throw new Error(status.err || "Could not check worktree changes.");
  const gitDir = await git(repo.top, ["rev-parse", "--absolute-git-dir"], on);
  if (!gitDir.ok) throw new Error(gitDir.err || "Could not find the worktree Git directory.");
  const mods = await modules(gitDir.out, ["--file", `${repo.top}/.gitmodules`], on), unpushed: string[] = [];
  for (const m of mods) {
    const local = await git(gitDir.out, ["--git-dir", m.dir, "rev-list", "-n1", "--all", "--not", "--remotes", ...(m.pinned ? [m.pinned] : [])], on);
    if (!local.ok) throw new Error(local.err || `Couldn't check submodule ${m.name}.`);
    if (local.out) unpushed.push(m.name);
  }
  return { dirty: Boolean(status.out), modules: mods.length, unpushed };
}
