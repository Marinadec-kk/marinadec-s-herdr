// Workspace spaces: stable colored avatars, worktrees under their checkout,
// grouped by machine when more than one is known. After a space's name, the repo
// its first terminal is in now, only where unusual: branch, ahead/behind; at the
// end, the harnesses running in it and the space's most urgent status. A space
// unfolds into its tabs that run agents, each with its own harnesses and status.
// Click to switch, right-click for its menu, drag to reorder.
import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, terminals, spaces, machines, panes, run, exec, hc, theme, settings, shared, setShared, setAgentOrder, watchFolder, window, layout } from "herdr";
import { APPEARANCE_KEY, UI_FONT, UI_FONT_SIZE, assignSpaceColors, ensureMachineDefaults, ensureSpaceDefaults, machineAvatar, machineColor, spaceAvatar, machineKey, readAppearance, resolveColor } from "./appearance-model.js";
import { tint } from "./appearance-colors.js";
import { createAppearanceOverlay, openAppearance, openSpaceMenu } from "./appearance-editor.js";
import { renderAvatar } from "./appearance-avatar.js";
import { createPixelChrome, findNode } from "./pixel-chrome.js";
import { createPixelMenu } from "./pixel-menu.js";
import { pixelIcon, pixelStatus, programIcon as icon } from "./pixel-ui.js";
// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const sidebarWidth = () => findNode(layout(), "sidebar")?.size?.px ?? 299;
// Where a space is now: its first terminal's live folder, else where it was made.
// `ps`: panes(), read once by the caller (each read copies every pane).
function place(s, ps) {
    const tabs = new Set((s.tabs ?? []).map((c) => c.id));
    return ps.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
}
const rowHeight = ({ tree }) => (tree ? 30 : 32);
const RAIL_CELL = 32;
const railCell = (el) => h_flex().flex_none().justify_center().child(el);
const ROW_INSET = 8;
const rowEnd = () => h_flex().size(24).flex_none().items_center().justify_center();
const where = (s, ps) => JSON.stringify([s.machine ?? null, place(s, ps)]);
// The pair every where() key carries — [machine, folder] — typed, so the
// destructures read as what they are instead of `any`. A repo key
// (`GitInfo.repo`) is the same pair for the repo folder.
const parseWhere = (key) => JSON.parse(key);
const base = (path) => path.replace(/\/+$/, "").split("/").pop();
// Changes made outside Herdr (an editor's save, a commit in another app): looked
// for this often, in repos the list shows, while the window is in front.
const FALLBACK = 60000;
const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
const STATUS_WORD = { blocked: "Needs you", done: "Done", working: "Working", idle: "Idle" };
const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
// A tab's own name, else a terminal title that tells more than the program's,
// else the program's name ("Claude Code", "OpenCode").
function tabLabel(tab, agents) {
    if (tab.named)
        return tab.name;
    const lead = agents[0];
    const prog = lead?.program?.name;
    const live = clean(lead?.title);
    // clean() would strip a path's leading ~ or /: test the title with only its status glyph gone.
    const path = /^[~/]|^[A-Za-z]:\\/.test((lead?.title ?? "").replace(/^[^\p{L}\p{N}~/]+/u, ""));
    const telling = live && live !== prog && !path && !live.includes("@") && live.toLowerCase() !== lead?.program?.key;
    return telling ? live : prog || tab.name;
}
// The harnesses among some agents, one per program, most urgent first.
function harnessList(mine) {
    const list = [];
    for (const a of mine) {
        const key = a.program?.key;
        if (!key)
            continue;
        const rank = RANK[a.status] ?? 0;
        const found = list.find((p) => p.key === key);
        if (found)
            found.rank = Math.max(found.rank, rank);
        else
            list.push({ key, program: a.program, rank });
    }
    list.sort((a, b) => b.rank - a.rank);
    return list;
}
// "Needs you · Claude Code": the status and who is behind it.
function statusTip(status, mine) {
    if (!status)
        return "";
    const word = STATUS_WORD[status] ?? status;
    const names = [...new Set(mine.filter((a) => a.status === status).map((a) => a.program?.name).filter(Boolean))];
    return names.length ? `${word} · ${names.join(", ")}` : word;
}
// A space's aggregate status and the harnesses in it, for the row.
function spaceInfo(w, mine) {
    return { harnesses: harnessList(mine), label: statusTip(w.status, mine) };
}
export default class Spaces extends View {
    init(_props, cx) {
        this.overlay = createPixelChrome(_props) ?? createPixelMenu(_props, cx) ?? createAppearanceOverlay(_props, cx);
        // Menu/editor copies have their own retained inputs, not sidebar pollers.
        if (this.overlay)
            return;
        this.git = {};
        this.checked = {};
        this.unsure = new Set();
        this.pending = new Set();
        this.busy = {};
        this.ready = {};
        this.at = {};
        this.watching = new Set();
        this.shown = new Set(spaces().map((s) => s.id));
        this.born = {};
        this.pressed = null;
        this.over = null;
        this.machines = [];
        this.reconnecting = JSON.parse(localStorage.getItem("machines.reconnecting") ?? "{}");
        for (const state of Object.values(this.reconnecting))
            state.busy = false;
        this.folded = new Set(JSON.parse(localStorage.getItem("machines.folded") ?? "[]"));
        this.sessionFolded = new Set(JSON.parse(localStorage.getItem("spaces.sessions.folded") ?? "[]"));
        this.refreshMachines(cx);
        cx.timer.every(15000, cx => this.refreshMachines(cx));
        // Refresh only when the refs could have changed (see `due`).
        cx.timer.every(250, (cx) => this.checkNew(cx));
    }
    checkNew(cx) {
        const now = Date.now();
        const sp = spaces();
        for (const s of sp)
            if (!this.shown.has(s.id))
                this.born[s.id] ??= now;
        const due = this.due(now, sp, panes());
        if (due.size)
            this.refreshGit(due, cx);
        if (sp.some((s) => !this.shown.has(s.id)) || this.orderingDue(now))
            cx.notify();
    }
    // Places whose git could have changed: new ones (a new space, a cd), where a
    // command or an agent's turn just ended (a checkout, a commit, edits), those on
    // a machine that is back, and repos in view whose fallback is due.
    due(now, sp, ps) {
        // Moved there: what it knew of that place may be old.
        const at = {};
        for (const s of sp)
            at[s.id] = where(s, ps);
        const keys = new Set(Object.values(at).filter((k) => parseWhere(k)[1]));
        const due = new Set([...keys].filter((k) => !(k in this.git)));
        for (const [id, k] of Object.entries(at))
            if (this.at[id] && this.at[id] !== k && keys.has(k))
                due.add(k);
        this.at = at;
        const spaceOf = {};
        for (const s of sp)
            for (const t of s.tabs ?? [])
                spaceOf[t.id] = s;
        const busy = {};
        for (const p of ps) {
            if (!p.terminal || !spaceOf[p.tab])
                continue;
            busy[p.pane] = p.status === "working" || !(p.program?.shell || p.program?.agent);
            if (this.busy[p.pane] && !busy[p.pane])
                this.sameRepo(at[spaceOf[p.tab].id], keys).forEach((k) => due.add(k));
        }
        this.busy = busy;
        for (const m of machines()) {
            const ready = m.layout === "ready";
            if (ready && this.ready[m.name] === false)
                for (const k of keys)
                    if (parseWhere(k)[0] === m.name)
                        due.add(k);
            this.ready[m.name] = ready;
        }
        if (window().active) {
            for (const k of keys) {
                const asks = this.git[k] || this.unsure.has(k);
                if (asks && !this.folded.has(parseWhere(k)[0]) && now - (this.checked[k] ?? 0) > FALLBACK)
                    due.add(k);
            }
        }
        return due;
    }
    // `key` and the other places in its repo (a commit there moves their ahead/behind).
    sameRepo(key, keys) {
        const repo = this.git[key]?.repo;
        return [key, ...(repo ? [...keys].filter((k) => this.git[k]?.repo === repo) : [])];
    }
    refreshMachines(cx) {
        cx.spawn(async (cx) => {
            try {
                const r = await hc(["machine", "ls", "--json"]);
                if (r.code === 0)
                    this.machines = (JSON.parse(r.stdout).machines ?? []).filter((m) => !m.temporary);
            }
            catch { }
            cx.notify();
        });
    }
    rebuilt(machine) {
        return machine?.state === "unreachable" && /^a different core answers there \("[^"]+"\)$/.test(machine.why ?? "");
    }
    reconnect(machine, cx) {
        const name = machine.name;
        if (this.reconnecting[name]?.busy)
            return;
        const state = this.reconnecting[name] ??= { machine, removed: false };
        state.busy = true;
        state.error = null;
        localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
        cx.notify();
        cx.spawn(async (cx) => {
            try {
                const ask = async (args) => {
                    const r = await hc([...args, "--json"]);
                    if (r.code !== 0) {
                        let error;
                        try {
                            error = JSON.parse(r.stdout || r.stderr).error?.message;
                        }
                        catch { }
                        throw new Error(error || r.stderr || r.stdout || "Couldn't connect.");
                    }
                };
                if (!state.removed) {
                    await ask(["machine", "rm", name]);
                    state.removed = true;
                    localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
                }
                const args = ["machine", "add"];
                if (machine.via)
                    args.push("--via", machine.target);
                else
                    args.push(machine.target);
                args.push("--name", name);
                if (machine.session)
                    args.push("--session", machine.session);
                if (machine.temporary)
                    args.push("--temp");
                await ask(args);
                this.folded.delete(name);
                localStorage.setItem("machines.folded", JSON.stringify([...this.folded]));
                delete this.reconnecting[name];
            }
            catch (e) {
                state.error = String(e.message ?? e);
                state.busy = false;
            }
            localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
            this.refreshMachines(cx);
            cx.notify();
        });
    }
    // One look at a time, each place once however often it was asked for meanwhile.
    refreshGit(keys, cx) {
        for (const k of keys)
            this.pending.add(k);
        if (this.refreshing)
            return;
        this.refreshing = true;
        cx.spawn(async (cx) => {
            while (this.pending.size) {
                const keys = [...this.pending];
                this.pending.clear();
                await Promise.all(keys.map((key) => this.check(key, cx)));
            }
            const used = new Set(Object.values(this.git).filter(Boolean).map((g) => parseWhere(g.repo)).filter(([on]) => !on).map(([, repo]) => repo));
            for (const repo of this.watching)
                if (!used.has(repo))
                    this.watching.delete(repo);
            this.refreshing = false;
            cx.notify();
        });
    }
    // One place's git: branch, ahead/behind, its repo.
    async check(key, cx) {
        const [on, cwd] = parseWhere(key);
        this.checked[key] = Date.now();
        this.unsure.delete(key);
        try {
            // Ref-only reads avoid scanning the worktree or waking its index watch.
            // Two reads: a folder name may itself contain a newline.
            const [r, common] = await Promise.all([
                exec("git", ["rev-parse", "--path-format=absolute", "--show-toplevel"], { cwd, on }),
                exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd, on }),
            ]);
            if (r.code !== 0 || common.code !== 0) {
                // Only git's own "no" is remembered as no repo; anything else is asked again.
                if (!/not a git repository/i.test(r.code !== 0 ? r.stderr : common.stderr))
                    this.unsure.add(key);
                this.git[key] = null;
                return;
            }
            // The repo's own .git folder names it; a worktree's top differs from it.
            const top = r.stdout.replace(/\n$/, ""), repo = common.stdout.replace(/\n$/, "");
            const [branch, counts] = await Promise.all([
                exec("git", ["symbolic-ref", "-q", "HEAD"], { cwd, on }),
                exec("git", ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"], { cwd, on }),
            ]);
            const name = repo.endsWith("/.git") ? base(repo.slice(0, -5)) : base(repo).replace(/\.git$/, "");
            const [ahead, behind] = counts.code === 0 ? counts.stdout.trim().split(/\s+/).map(Number) : [0, 0];
            const info = { name, branch: branch.code === 0 ? branch.stdout.trim().replace(/^refs\/heads\//, "") : "(detached)", ahead, behind, repo: JSON.stringify([on, repo]), linked: repo !== `${top}/.git` };
            this.git[key] = info;
            if (!on)
                this.watch(repo, cx);
        }
        catch {
            // Couldn't ask (the machine is away): keep what it showed, look again later.
            this.git[key] ??= null;
            this.unsure.add(key);
        }
    }
    watch(repo, cx) {
        if (this.watching.has(repo))
            return;
        this.watching.add(repo);
        cx.spawn(async (cx) => {
            try {
                while (this.watching.has(repo)) {
                    await watchFolder(repo);
                    const mine = JSON.stringify([null, repo]);
                    if (this.watching.has(repo))
                        this.refreshGit(Object.keys(this.git).filter((k) => this.git[k]?.repo === mine), cx);
                }
            }
            catch {
                this.watching.delete(repo);
            }
        });
    }
    menu(w, git, tree) {
        openSpaceMenu(w.id, git ? git.linked ? "linked" : "main" : null, tree);
    }
    orderingDue(now, ms = machines()) {
        return this.ordering && now - this.ordering.at >= 1000
            && this.ordering.machines.every(name => ms.some(m => m.name === name && m.layout === "ready"));
    }
    // Spaces in order, each worktree space moved under its main checkout's.
    // `sp`/`ps`: spaces() / panes(), read once by the caller (each read copies the lot).
    ordered(sp, ps, ms) {
        const ready = (w) => this.shown.has(w.id) || where(w, ps) in this.git || Date.now() - (this.born[w.id] ??= Date.now()) > 1500;
        for (const w of sp)
            if (!this.shown.has(w.id) && ready(w))
                this.shown.add(w.id);
        const list = sp.map((w, i) => ({ w, i, g: this.git[where(w, ps)] ?? null }));
        const mains = new Set(list.filter((r) => r.g && !r.g.linked).map((r) => r.g.repo));
        const nested = (r) => r.g?.linked && mains.has(r.g.repo);
        const out = [];
        const placed = new Set(); // repos whose worktrees are listed (under the first of its spaces)
        for (const r of list) {
            if (nested(r))
                continue;
            out.push({ ...r, tree: null });
            if (!r.g || r.g.linked || placed.has(r.g.repo))
                continue;
            placed.add(r.g.repo);
            const kids = list.filter((k) => nested(k) && k.g.repo === r.g.repo);
            kids.forEach((k, n) => out.push({ ...k, tree: n === kids.length - 1 ? "└─" : "├─" }));
        }
        // Simulate the batch so later indexes include earlier moves. An attempted
        // write can lose a sync conflict: allow the echo to settle before retrying.
        const order = sp.map(w => w.id);
        const target = out.map(r => r.w.id);
        if (order.every((id, i) => id === target[i])) {
            this.ordering = null;
        }
        else {
            // Only a differing order needs its key (the machines list serializes too).
            const key = JSON.stringify([order, target, ms]);
            if (this.ordering?.key !== key || this.orderingDue(Date.now(), ms)) {
                const moved = new Set();
                this.ordering = { key, at: Date.now(), machines: [] };
                for (let i = 0; i < out.length; i++) {
                    const from = order.indexOf(out[i].w.id);
                    if (from === i)
                        continue;
                    run("space.move", { id: out[i].w.id, index: i + 1 });
                    moved.add(out[i].w.machine ?? null);
                    order.splice(i, 0, order.splice(from, 1)[0]);
                }
                this.ordering.machines = [...moved];
            }
        }
        return out.filter(r => this.shown.has(r.w.id));
    }
    // The tabs with agents, per space: harnesses, tab status, a label, and how
    // many sub-agents hang under them. A tab is one row; plain shells get none.
    sessions(rows, bySpace, allTerminals, subagents) {
        const kids = new Map();
        for (const k of allTerminals) {
            if (!k.parent)
                continue;
            if (!kids.has(k.parent))
                kids.set(k.parent, []);
            kids.get(k.parent).push(k);
        }
        const below = (address) => {
            let n = 0;
            for (const k of kids.get(address) ?? []) {
                if (k.state !== "live")
                    continue;
                n += 1 + below(k.address);
            }
            return n;
        };
        const out = new Map();
        for (const { w } of rows) {
            const mine = (bySpace.get(w.id) ?? []).filter((a) => !subagents.has(a.address));
            const list = [];
            for (const tab of w.tabs ?? []) {
                const agents = mine.filter((a) => a.tab === tab.id);
                if (!agents.length)
                    continue;
                const status = tab.status ?? agents.reduce((s, a) => ((RANK[a.status] ?? 0) > (RANK[s] ?? 0) ? a.status : s), null);
                list.push({
                    space: w.id,
                    tab,
                    agents,
                    harnesses: harnessList(agents),
                    status,
                    tip: statusTip(status, agents),
                    label: tabLabel(tab, agents),
                    subs: agents.reduce((n, a) => n + below(a.address), 0),
                });
            }
            // Two unnamed tabs of the same harness read the same; number them.
            const seen = {};
            for (const s of list)
                seen[s.label] = (seen[s.label] ?? 0) + 1;
            for (const s of list)
                if (seen[s.label] > 1)
                    s.label += ` · ${s.tab.index}`;
            out.set(w.id, list);
        }
        return out;
    }
    // The rows, under a header per machine once one isn't this computer.
    grouped(t, collapsed, snapshot) {
        const { sp, ps, ms, all, allTerminals, machineNames, appearance } = snapshot;
        const rows = this.ordered(sp, ps, ms);
        const bySpace = new Map();
        for (const a of all) {
            if (!bySpace.has(a.space))
                bySpace.set(a.space, []);
            bySpace.get(a.space).push(a);
        }
        const subagents = new Set(allTerminals.filter((k) => k.parent).map((k) => k.address));
        const sessions = this.sessions(rows, bySpace, allTerminals, subagents);
        const infos = new Map(rows.map((r) => [r.w.id, spaceInfo(r.w, bySpace.get(r.w.id) ?? [])]));
        // What every space row needs, read once here instead of once per row.
        const ctx = {
            fromIndex: this.pressed === null ? -1 : sp.findIndex(s => s.id === this.pressed),
            colors: snapshot.colors,
            width: snapshot.width,
            appearance,
        };
        // One drawn row, with its sessions under it unless folded away.
        const add = (r) => {
            if (collapsed)
                return [this.compact(r, t, ctx)];
            const list = sessions.get(r.w.id) ?? [];
            const folded = this.sessionFolded.has(r.w.id);
            const fill = resolveColor(ctx.colors[r.w.id], t);
            return [v_flex().id(`space-group-${r.w.id}`).flex_none().mb(4).overflow_hidden()
                    .border_1().border_color(tint(fill, t.chrome, r.w.active ? .60 : .22))
                    .border_l(2).bg(tint(fill, t.chrome, r.w.active ? .08 : .025))
                    .when(Boolean(r.tree), el => el.ml(12))
                    .child(this.row(r, t, ctx, infos.get(r.w.id), list, folded))
                    .when(!folded && list.length > 0, el => el.child(v_flex().pb(3)
                    .children(list.map(s => this.sessionRow(r, s, t, fill)))))];
        };
        // Navigation follows what is on screen.
        const order = [];
        for (const r of rows)
            for (const s of sessions.get(r.w.id) ?? [])
                for (const a of s.agents)
                    order.push(a.address);
        setAgentOrder(order);
        const loading = (m) => {
            const layout = ms.find(k => k.name === m)?.layout;
            return layout === "loading" || (!layout && this.machines.some(k => k.name === m && k.state === "connected"))
                || sp.some(s => (s.machine ?? null) === m && !this.shown.has(s.id));
        };
        const loadingRow = (m) => h_flex().id(`machine-loading-${m ?? "local"}`).h(28).flex_none().px(collapsed ? 0 : 8).items_center().when(collapsed, el => el.justify_center()).text_size(12).text_color(t.dim).child(collapsed ? "…" : "Loading…");
        if (machineNames.length === 1)
            return loading(null) && !rows.length ? [loadingRow(null)] : rows.flatMap(add);
        const colorFor = (m) => machineColor(appearance, m, t);
        const compactHead = snapshot.width < 240;
        const card = (m, idx, children) => v_flex().id(`machine-card-${m ?? "local"}`).flex_none()
            .when(idx > 0, el => el.mt(12))
            .bg(tint(colorFor(m), t.chrome, .035)).border_1().border_color(tint(colorFor(m), t.chrome, .40))
            .px(4).pb(4)
            .children(children);
        return machineNames.flatMap((m, idx) => {
            const mine = rows.filter((r) => (r.w.machine ?? null) === m);
            const repair = this.reconnecting[m];
            const machine = this.machines.find(k => k.name === m) ?? repair?.machine;
            const connected = !m || machine?.state === "connected";
            const rebuilt = this.rebuilt(machine) || !!repair;
            const login = machine?.state === "needs_login" ? `hc machine login ${m}` : null;
            const folded = this.folded.has(m);
            const badge = div().absolute().right(-3).bottom(-2).size(6).border_1().border_color(t.chrome).bg(connected ? t.ansi2 : t.dim);
            const key = machineKey(m);
            const avatar = machineAvatar(appearance, m), fill = colorFor(m);
            const needs = all.filter(a => a.status === "blocked" && mine.some(r => r.w.id === a.space)).length;
            // Match the right inset of a space row, including its 1 px group border.
            const head = h_flex().id(`machine-${m ?? "local"}`).h(collapsed ? 36 : 52).flex_none()
                .pl(collapsed ? 0 : 6).pr(collapsed ? 0 : ROW_INSET + 1).gap(8).items_center().text_size(14).text_color(t.dim)
                .when(!collapsed, el => el.mb(4))
                .when(collapsed, el => el.mt(4).w(RAIL_CELL).justify_center().tooltip(login ? `${m} needs a login: run ${login}. Click for Copy.` : m ? `${m} · ${connected ? "connected" : (machine?.state ?? "asleep").replace(/_/g, " ")}` : "This computer"))
                .cursor_pointer().hover(s => s.bg(t.hover))
                .on_click((_e, cx) => {
                if (collapsed && login) {
                    run("app.settings", { section: "machines" });
                    return;
                }
                folded ? this.folded.delete(m) : this.folded.add(m);
                localStorage.setItem("machines.folded", JSON.stringify([...this.folded]));
                cx.notify();
            })
                .on_mouse_down("right", (_event, cx) => {
                cx.stop_propagation();
                openAppearance({ kind: "machine", machine: m });
            })
                .child(div().relative().flex_none().when(!connected, el => el.opacity(.5))
                .child(renderAvatar(avatar, collapsed ? 24 : 32, fill, m ?? "This computer"))
                .when(collapsed && Boolean(m), el => el.child(badge)))
                .when(!collapsed, el => el.child(v_flex().flex_1().min_w(0).gap(3)
                .child(div().truncate().text_size(16).font_semibold().text_color(connected ? t.foreground : t.muted)
                .tooltip(m ?? "This computer").child(m ?? "This computer"))
                .child(h_flex().gap(5).items_center().text_size(12).text_color(t.muted)
                .child(div().size(5).flex_none().bg(connected ? t.ansi2 : t.dim)
                .tooltip(connected ? "Connected" : (machine?.state ?? "offline").replace(/_/g, " ")))
                .child(div().flex_1().min_w(0).truncate()
                .child(connected ? `${compactHead ? "" : m ? "Remote · " : "Local · "}${mine.length} space${mine.length === 1 ? "" : "s"}`
                : (machine?.state ?? "offline").replace(/_/g, " ")))
                .when(needs > 0, el => el.child(div().text_color(t.blocked).tooltip(`${needs} agents need you`).child(`! ${needs}`)))))
                .child(h_flex().flex_none().items_center()
                .when(!compactHead, el => el.child(div().id(`machine-appearance-${key}`).size(24).flex_none().flex().items_center().justify_center()
                .tooltip("Change machine color and avatar").cursor_pointer().hover(el => el.bg(t.hover).text_color(t.foreground))
                .on_mouse_down("left", (_event, cx) => cx.stop_propagation())
                .on_mouse_up("left", (_event, cx) => cx.stop_propagation())
                .on_click((_event, cx) => { cx.stop_propagation(); openAppearance({ kind: "machine", machine: m }); })
                .child(pixelIcon("settings", t.dim, 12))))
                .when(connected && !compactHead, el => el.child(div().id(`machine-add-${m ?? "local"}`).size(24).flex_none().flex().items_center().justify_center()
                .tooltip(`New space on ${m ?? "this computer"}`).hover(s => s.bg(t.hover).text_color(t.foreground))
                .on_click((_e, cx) => { cx.stop_propagation(); run("space.new", { machine: m ?? "" }); }).child(pixelIcon("plus", t.muted, 12))))
                .child(rowEnd().child(pixelIcon(folded ? "right" : "down", t.muted, 10)))));
            const connect = rebuilt && !collapsed ? h_flex().px(8).pb(8).gap(6).items_center()
                .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.muted).child(repair?.error || "Machine identity changed"))
                .child(div().id(`machine-connect-${m}`).h(28).px(8).flex().items_center().text_color(t.foreground).bg(t.raised)
                .tooltip(repair?.error || "Connect to the rebuilt machine")
                .on_click((_e, cx) => { cx.stop_propagation(); this.reconnect(machine, cx); })
                .child(repair?.busy ? "Connecting…" : "Connect")) : null;
            const empty = h_flex().id(`machine-new-${m ?? "local"}`).h(28).flex_none().px(collapsed ? 0 : 8).gap(7).items_center()
                .text_size(12).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
                .on_click(() => run("space.new", { machine: m ?? "" }))
                .when(collapsed, el => el.w(RAIL_CELL).justify_center().tooltip(`New space on ${m ?? "this computer"}`)
                .child(h_flex().size(18).border_1().border_color(t.dim).items_center().justify_center()
                .child(pixelIcon("plus", t.dim, 10))))
                .when(!collapsed, el => el.child(pixelIcon("plus", t.dim, 12)).child("New space there"));
            const cell = collapsed ? railCell : (el) => el;
            const guidance = !collapsed && login ? [v_flex().px(8).pb(6).gap(3).flex_none()
                    .child(div().text_size(11).text_color(t.blocked).child("needs a login: run"))
                    .child(h_flex().gap(5).items_center()
                    .child(div().flex_1().min_w(0).truncate().tooltip(login).text_size(11).text_color(t.muted).child(login))
                    .child(div().id(`machine-login-copy-${m}`).flex_none().px(5).py(2)
                    .text_size(11).text_color(t.foreground).bg(t.raised).cursor_pointer().hover(s => s.bg(t.hover))
                    .on_click((_e, cx) => { cx.stop_propagation(); cx.write_to_clipboard(login); this.copiedLogin = login; cx.notify(); })
                    .child(this.copiedLogin === login ? "Copied" : "Copy")))] : [];
            const kids = [...guidance, ...(folded ? [] : mine.length ? mine.flatMap(add) : [loading(m) ? loadingRow(m) : cell(empty)])];
            // The rail stays a plain list of cells; a rebuilt machine folds to its card's head.
            if (collapsed)
                return [cell(head), ...kids];
            if (rebuilt)
                return [card(m, idx, [head, ...(connect ? [connect] : [])])];
            return [card(m, idx, [head, ...kids])];
        });
    }
    // Only what's unusual, after the name: "herdr · spike ↑12 ↓31". The repo or
    // branch goes when the name already says it (a worktree is named after its branch),
    // and master/main go: nearly every space is on one.
    gitTail(g, tree, name, t) {
        const raw = g.branch ?? "detached";
        const same = (a) => a.toLowerCase() === name.toLowerCase();
        const branch = same(raw) || raw === "master" || raw === "main" ? "" : raw;
        const repo = tree || same(g.name) ? "" : g.name;
        const where = [repo, branch].filter(Boolean).join(" · ");
        return h_flex()
            .max_w(110)
            .min_w(0)
            .gap(5)
            .justify_end()
            .items_center()
            .text_size(12)
            .text_color(t.muted)
            .tooltip([where, g.ahead ? `ahead ${g.ahead}` : "", g.behind ? `behind ${g.behind}` : ""].filter(Boolean).join(" · "))
            .when(Boolean(where), (el) => el.child(div().min_w(0).truncate().child(where)))
            .when(g.ahead > 0, (el) => el.child(div().flex_none().text_color(t.ansi2).child(`↑${g.ahead}`)))
            .when(g.behind > 0, (el) => el.child(div().flex_none().text_color(t.ansi1).child(`↓${g.behind}`)));
    }
    row({ w, i, g, tree }, t, ctx, info, sessions, folded) {
        const on = w.active;
        const fromIndex = ctx.fromIndex;
        const color = ctx.colors[w.id] ?? "ansi6";
        const fill = resolveColor(color, t);
        // Expanded, its session rows carry the harnesses and status; folded or
        // without them, the space row says it itself.
        const showStatus = Boolean(w.status) && (folded || !sessions.length);
        const pics = showStatus
            ? info.harnesses.map((h) => ({ h, pic: icon(h.program, 13, t.muted) })).filter((p) => p.pic)
            : [];
        return v_flex()
            .relative()
            .id(`space-${w.id}`)
            .px(ROW_INSET)
            .h(rowHeight({ tree }))
            .flex_none()
            .justify_center()
            .when(on, (el) => el.bg(tint(fill, t.chrome, .08)))
            .when(!on, (el) => el.hover((s) => s.bg(t.hover)))
            .when(this.pressed === w.id && this.over !== w.id, (el) => el.opacity(0.5))
            .when(this.pressed !== null && this.over === w.id && this.pressed !== w.id, (el) => el.child(div().absolute().left(0).right(0).h(2).bg(t.accent)
            .when(fromIndex < i, line => line.bottom(0))
            .when(fromIndex > i, line => line.top(0))))
            .on_mouse_down("left", () => {
            this.pressed = w.id;
            this.over = w.id;
        })
            .on_mouse_move((_e, cx) => {
            const source = spaces().find(s => s.id === this.pressed);
            const over = source && (source.machine ?? null) === (w.machine ?? null) ? w.id : null;
            if (this.pressed !== null && this.over !== over) {
                this.over = over;
                cx.notify();
            }
        })
            .on_mouse_up("left", (_e, cx) => {
            const from = this.pressed;
            const over = this.over;
            this.pressed = null;
            this.over = null;
            if (from !== null && over === w.id && from !== w.id) {
                const index = spaces().findIndex(s => s.id === w.id);
                if (index !== -1)
                    run("space.move", { id: from, index: index + 1 });
            }
            else if (from === w.id)
                run("space.select", { id: w.id });
            cx.notify();
        })
            .on_mouse_down("right", () => this.menu(w, g, Boolean(ctx.appearance.spaceDefaults[w.id]?.worktree)))
            .child(h_flex()
            .gap(8)
            .items_center()
            .child(renderAvatar(spaceAvatar(ctx.appearance, w.id), 20, fill, w.name))
            .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).tooltip(w.name).child(w.name))
            .when(Boolean(g) && ctx.width >= 340, el => el.child(this.gitTail(g, tree, w.name, t)))
            .when(pics.length > 0, (el) => el.child(h_flex().flex_none().ml(6).gap(4).items_center()
            .children(pics.map((p) => div().flex_none().tooltip(p.h.program.name).child(p.pic)))))
            .when(showStatus && sessions.length > 0, el => el.child(rowEnd().child(pixelStatus(t, w.status, info.label))))
            .child(sessions.length > 0
            ? rowEnd().id(`space-fold-${w.id}`)
                .text_color(t.dim).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground))
                .tooltip(folded ? "Show sessions" : "Hide sessions")
                .on_mouse_down("left", (_e, cx) => {
                cx.stop_propagation();
                folded ? this.sessionFolded.delete(w.id) : this.sessionFolded.add(w.id);
                localStorage.setItem("spaces.sessions.folded", JSON.stringify([...this.sessionFolded]));
                cx.notify();
            })
                .child(pixelIcon(folded ? "right" : "down", t.dim, 10))
            : rowEnd().when(showStatus, el => el.child(pixelStatus(t, w.status, info.label)))));
    }
    // A tab with agents, under its space: its harnesses, name, sub-agent count,
    // and its own status. A worktree space's sessions sit one level deeper.
    sessionRow({ w }, s, t, fill) {
        const harnesses = s.harnesses
            .map((h) => ({ h, pic: icon(h.program, 13, t.muted) }))
            .filter((p) => p.pic);
        const on = w.active && s.tab.active;
        const color = s.tab.settled ? t.dim : on ? t.foreground : t.muted;
        return h_flex()
            .id(`session-${s.tab.id}`)
            .h(28)
            .flex_none()
            .pl(16)
            .pr(ROW_INSET)
            .gap(8)
            .items_center()
            .when(on, (el) => el.bg(tint(fill, t.chrome, .20)))
            .when(!on, (el) => el.hover((hover) => hover.bg(t.hover)))
            .cursor_pointer()
            .on_click(() => {
            run("space.select", { id: w.id });
            run("tab.select", { id: s.tab.id });
        })
            .tooltip(s.tip ? `${s.label} · ${s.tip}` : s.label)
            .child(div().w(2).h(12).flex_none().bg(on ? fill : tint(fill, t.chrome, .18)))
            .when(harnesses.length > 0, (el) => el.child(h_flex().flex_none().gap(3).items_center()
            .children(harnesses.map((p) => div().flex_none().tooltip(p.h.program.name).child(p.pic)))))
            .child(div().flex_1().min_w(0).truncate().text_color(color).child(s.label))
            .when(s.subs > 0, (el) => el.child(div().flex_none().text_size(12).text_color(t.muted)
            .tooltip(`${s.subs} sub-agent${s.subs === 1 ? "" : "s"}`).child(`+${s.subs}`)))
            .child(rowEnd().when(Boolean(s.status), el => el.child(pixelStatus(t, s.status, s.tip))));
    }
    compact({ w, i }, t, ctx) {
        return railCell(h_flex()
            .id(`space-${w.id}`)
            .relative()
            .w(RAIL_CELL)
            .h(32)
            .justify_center()
            .items_center()
            .when(w.active, (el) => el.bg(t.selected))
            .when(!w.active, (el) => el.hover((s) => s.bg(t.hover)))
            .on_click(() => run("space.select", { id: w.id }))
            .on_mouse_down("right", (_event, cx) => { cx.stop_propagation(); openAppearance({ kind: "space", id: w.id, tree: ctx.appearance.spaceDefaults[w.id]?.worktree }); })
            .tooltip(`${i + 1} · ${w.name}`)
            .child(renderAvatar(spaceAvatar(ctx.appearance, w.id), 18, resolveColor(ctx.colors[w.id], t), w.name))
            .child(div().absolute().right(4)
            .size(w.status === "blocked" || w.status === "done" ? 5 : 3).bg(t[w.status] ?? t.unknown)));
    }
    render() {
        if (this.overlay)
            return this.overlay.render();
        const t = theme();
        const width = sidebarWidth(), collapsed = width < 160, dark = settings().dark !== false;
        const sp = spaces(), ps = panes(), ms = machines(), all = agents();
        const allTerminals = terminals();
        const remoteNames = [...new Set([
                ...sp.map(space => space.machine).filter((name) => Boolean(name)),
                ...this.machines.map(machine => machine.name), ...Object.keys(this.reconnecting),
            ])].sort();
        const machineNames = [null, ...remoteNames];
        const storedAppearance = shared(APPEARANCE_KEY);
        const facts = sp.map(s => ({ space: s, git: this.git[where(s, ps)] }));
        const identities = facts.map(({ space, git }) => ({
            id: space.id, machine: space.machine,
            ...(git ? { worktree: git.linked, parent: git.linked
                    ? facts.find(f => f.git?.repo === git.repo && !f.git.linked)?.space.id : undefined } : {}),
        }));
        const appearance = ensureSpaceDefaults(ensureMachineDefaults(readAppearance(storedAppearance), machineNames), identities);
        if (JSON.stringify(appearance) !== JSON.stringify(storedAppearance))
            setShared(APPEARANCE_KEY, appearance);
        const storedColors = shared("space.colors");
        const colors = assignSpaceColors(sp, storedColors, appearance, t, dark);
        if (JSON.stringify(colors) !== JSON.stringify(storedColors ?? {}))
            setShared("space.colors", colors);
        const snapshot = { sp, ps, ms, all, allTerminals, colors, appearance, machineNames, dark, width };
        return v_flex().size_full().min_h(0).bg(t.chrome).font_family(UI_FONT).text_size(UI_FONT_SIZE)
            .child(h_flex().h(32).pl(12).pr(10).items_center().justify_between().text_size(12).text_color(t.muted)
            .when(collapsed, el => el.pl(0).pr(0).justify_center())
            .when(!collapsed, el => el.child("SPACES"))
            .child(div().id("space-new").size(26).flex_none().flex().items_center().justify_center().hover(s => s.bg(t.hover).text_color(t.foreground))
            .on_click(() => run("space.new")).child(pixelIcon("plus", t.dim))))
            .child(v_flex().flex_1().min_h(0).px(collapsed ? 0 : 8).pb(14).overflow_y_scrollbar().mode("always")
            .on_mouse_up("left", (_e, cx) => { this.pressed = null; cx.notify(); })
            .children(this.grouped(t, collapsed, snapshot)));
    }
}
