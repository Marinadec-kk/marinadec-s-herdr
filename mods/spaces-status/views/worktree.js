// Worktree controller adapted from Herdr 0.1.16 (Apache-2.0).
import { div } from "gpui-kit";
import { v_flex, InputState, ScrollHandle } from "gpui-base";
import { closeOverlay, theme, spaces, panes, exec, home, run, shared, setShared } from "herdr";
import { dialogFrame, dialogActions, scrollBody } from "../ui/surfaces.js";
import { actionRow, button, textInput, secondary } from "../ui/controls.js";
import { shortPath, spaceFolder } from "../presentation/labels.js";
import { git, repoOf, headOf, checkouts, branchSlug, worktreeRoot, removalState } from "./worktree-git.js";
import { LINEAGE_KEY, checkoutKey, readLineage, sourceLabel } from "../worktree-lineage.js";
import { normalizePath, joinPath, pathWithin } from "../data/paths.js";
import { newSpaceAt } from "../overlays.js";
export class Worktree {
    constructor(space, action, overlay, cx) {
        this.space = space;
        this.action = action;
        this.overlay = overlay;
        this.scroll = ScrollHandle.new();
        this.listScroll = ScrollHandle.new();
        this.folder = "";
        this.userHome = "";
        this.root = "";
        this.sourceName = "";
        this.list = [];
        this.text = "";
        this.at = 0;
        this.busy = false;
        this.error = "";
        this.dirty = false;
        this.unpushed = [];
        const target = spaces().find(s => s.id === space);
        this.on = target?.machine ?? null;
        this.folder = target ? spaceFolder(target, panes()) : "";
        this.sourceName = target?.name ?? "";
        this.handle = cx.focus_handle();
        this.handle.focus();
        this.input = InputState.new({ placeholder: action === "open" ? "Filter worktrees…" : "Branch name" });
        this.input.on("change", (_e, cx) => { this.text = this.input.value(); this.error = ""; this.at = 0; this.listScroll.scroll_to_item(0); cx.notify(); });
        this.input.on("submit", (_e, cx) => this.go(cx));
        if (!target) {
            this.repo = null;
            this.error = "This space is no longer available.";
            return;
        }
        cx.spawn(async (cx) => {
            try {
                this.userHome = home();
                if (this.on) {
                    let result;
                    try {
                        result = await exec("sh", ["-c", 'printf %s "$HOME"'], { on: this.on });
                    }
                    catch { }
                    if (!result || result.code !== 0 || !result.stdout.trim())
                        result = await exec("powershell.exe", ["-NoProfile", "-Command", "[Console]::Write($HOME)"], { on: this.on });
                    if (result.code !== 0 || !result.stdout.trim())
                        throw new Error("Could not find the remote home folder.");
                    this.userHome = normalizePath(result.stdout);
                }
                if (action === "new")
                    this.root = await worktreeRoot(this.userHome);
                const repo = await repoOf(this.folder || this.userHome, this.on);
                if (repo && action === "new")
                    this.head = await headOf(repo.top, this.on);
                if (repo && action === "remove") {
                    const state = await removalState(repo, this.on);
                    this.dirty = state.dirty;
                    this.unpushed = state.unpushed;
                }
                if (repo && action === "open")
                    this.list = await checkouts(repo, this.on);
                this.repo = repo;
                if (action !== "remove")
                    cx.timer.after(100, () => this.input.focus());
            }
            catch (error) {
                this.repo = null;
                this.error = String(error);
            }
            cx.notify();
        });
    }
    shown() {
        const query = this.text.trim().toLowerCase();
        return this.list.filter(c => !query || `${c.branch ?? ""} ${c.path}`.toLowerCase().includes(query));
    }
    open(checkout) {
        if (!checkout)
            return;
        const ps = panes();
        const existing = spaces().find(space => {
            if (space.machine !== this.on)
                return false;
            const path = spaceFolder(space, ps);
            return pathWithin(path, checkout.path) && !this.list.some(c => c.path.length > checkout.path.length && pathWithin(path, c.path));
        });
        closeOverlay(this.overlay);
        if (existing)
            run("space.select", { id: existing.id });
        else
            newSpaceAt(this.on, checkout.path);
    }
    go(cx) {
        const repo = this.repo;
        if (!repo || this.busy || (this.action === "remove" && !repo.linked))
            return;
        if (this.action === "open") {
            this.open(this.shown()[this.at]);
            return;
        }
        if (this.action === "new" && !this.text.trim()) {
            this.error = "Type a branch name.";
            cx.notify();
            return;
        }
        this.busy = true;
        this.error = "";
        cx.notify();
        cx.spawn(async (cx) => {
            try {
                if (!spaces().some(s => s.id === this.space && (s.machine ?? null) === this.on))
                    throw new Error("This space is no longer available.");
                if (this.action === "remove") {
                    const state = await removalState(repo, this.on);
                    const changed = (state.dirty && !this.dirty) || state.unpushed.some(name => !this.unpushed.includes(name));
                    this.dirty ||= state.dirty;
                    this.unpushed = [...new Set([...this.unpushed, ...state.unpushed])];
                    if (changed)
                        throw new Error("It changed since this opened. Confirm again to remove it.");
                    run("space.close", { id: this.space, confirmed: true });
                    const removed = await git(repo.main, ["worktree", "remove", ...(this.dirty || state.modules ? ["--force"] : []), repo.top], this.on, 600_000);
                    if (!removed.ok)
                        throw new Error(removed.err || "git worktree remove failed.");
                }
                else {
                    const branch = this.text.trim(), path = joinPath(this.root, `${repo.name}/${branchSlug(branch)}`);
                    const exists = (await git(repo.main, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], this.on)).ok;
                    // Pin the exact source commit, even if its branch moves during creation.
                    const head = exists ? undefined : await headOf(repo.top, this.on);
                    const add = exists ? ["worktree", "add", path, branch] : ["worktree", "add", "-b", branch, path, head.commit];
                    const created = await git(repo.top, add, this.on, 600_000);
                    if (!created.ok)
                        throw new Error(created.err || "git worktree add failed.");
                    const lineage = readLineage(shared(LINEAGE_KEY)), key = checkoutKey(this.on, path);
                    if (head)
                        lineage[key] = { machine: this.on, path, repo: repo.main, branch,
                            source: { space: this.space, name: spaces().find(s => s.id === this.space)?.name ?? this.sourceName,
                                path: repo.top, branch: head.branch, commit: head.commit } };
                    else
                        delete lineage[key]; // Opening an existing branch does not establish branch ancestry.
                    setShared(LINEAGE_KEY, lineage);
                    newSpaceAt(this.on, path);
                }
                closeOverlay(this.overlay);
            }
            catch (error) {
                this.error = String(error instanceof Error ? error.message : error);
            }
            this.busy = false;
            cx.notify();
        });
    }
    render() {
        const t = theme(), repo = this.repo, rows = this.shown();
        const close = () => closeOverlay(this.overlay);
        this.at = Math.min(this.at, Math.max(0, rows.length - 1));
        const verb = this.action === "new" ? "Create" : this.action === "remove" ? "Remove" : "Open";
        const title = `${this.action === "new" ? "New" : verb} worktree${repo ? ` · ${repo.name}` : ""}`;
        return dialogFrame(t, "worktree", title, this.handle, close, "worktree-close", (event, cx) => {
            if (this.action === "open" && (event.key === "up" || event.key === "down")) {
                if (rows.length)
                    this.at = (this.at + (event.key === "down" ? 1 : rows.length - 1)) % rows.length;
                this.listScroll.scroll_to_item(this.at);
            }
            else if (event.key === "enter" && this.action === "remove" && !event.is_held)
                this.go(cx);
            else
                return;
            cx.stop_propagation();
            cx.notify();
        })
            .child(scrollBody("worktree-body", this.scroll)
            .when(repo === undefined, el => el.child(secondary(t, "Reading repository…")))
            .when(repo === null && !this.error, el => el.child(secondary(t, `${shortPath(this.folder, this.userHome) || "This folder"} is not in a Git repository.`)))
            .when(Boolean(repo) && this.action === "new", el => el
            .child(secondary(t, `Creates a space in ${shortPath(this.root, this.userHome)}/${repo.name}/`))
            .when(Boolean(this.head), el => el.child(secondary(t, `From ${sourceLabel({ name: this.sourceName, ...this.head })}`)))
            .child(textInput(t, this.input).id("worktree-branch"))
            .child(secondary(t, "An existing branch is checked out; a new branch starts from here.")))
            .when(Boolean(repo) && this.action === "remove", el => el
            .child(secondary(t, repo.linked ? `Closes the space and deletes ${shortPath(repo.top, this.userHome)}. The branch stays.` : "This is the repository’s main checkout."))
            .when(this.dirty, el => el.child(secondary(t, "Uncommitted changes will be lost.").text_color(t.blocked)))
            .when(this.unpushed.length > 0, el => el.child(secondary(t, `Unpushed submodule commits will be lost: ${this.unpushed.join(", ")}`).text_color(t.blocked))))
            .when(Boolean(repo) && this.action === "open", el => el.child(textInput(t, this.input))
            .child(v_flex().id("worktree-list").max_h(320).min_h(0).overflow_y_scrollbar().track_scroll(this.listScroll)
            .children(rows.map((checkout, index) => actionRow(t, `wt-${index}`, checkout.branch ?? "Detached", () => this.open(checkout), { selected: index === this.at })
            .h(48).child(v_flex().flex_1().min_w(0)
            .child(div().truncate().child(`${checkout.branch ?? "Detached"}${checkout.main ? " · main checkout" : ""}`))
            .child(secondary(t, shortPath(checkout.path, this.userHome)).truncate().tooltip(checkout.path)))))
            .when(!rows.length, el => el.child(secondary(t, "No matching worktrees.")))))
            .when(Boolean(this.error), el => el.child(secondary(t, this.error).text_color(t.blocked))))
            .child(dialogActions().child(button(t, "worktree-cancel", "Cancel", close))
            .child(button(t, "worktree-submit", this.busy ? "Working…" : verb, cx => this.go(cx), { selected: this.action !== "remove", disabled: this.busy || !repo || (this.action === "remove" && !repo.linked) || (this.action === "open" && !rows.length) })));
    }
}
