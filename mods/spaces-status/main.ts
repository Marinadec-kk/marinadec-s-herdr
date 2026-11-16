// Workspace spaces: stable colored avatars, worktrees under their checkout,
// grouped by machine when more than one is known. After a space's name, the repo
// its first terminal is in now, only where unusual: branch, ahead/behind; at the
// end, the harnesses running in it and the space's most urgent status. A space
// unfolds into its tabs that run agents, each with its own harnesses and status.
// Click to switch, right-click for its menu, drag to reorder.

import { View, div, svg } from "gpui-kit";
import type { AsyncContext, Color, Context, Element } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, terminals, spaces, machines, panes, run, exec, hc, theme, settings, shared, setShared, setAgentOrder, watchFolder, window, layout } from "herdr";
import type { AgentInfo, PaneInfo, Program, SpaceInfo, Status, TabInfo } from "herdr";
import { APPEARANCE_KEY, UI_FONT, UI_FONT_SIZE, assignSpaceColors, ensureMachineDefaults, machineKey, readAppearance, resolveColor } from "./appearance-model.js";
import type { AppearanceState, Theme } from "./appearance-model.js";
import { createAppearanceOverlay, openAppearance, openSpaceMenu } from "./appearance-editor.js";
import type { AppearanceOverlay } from "./appearance-editor.js";
import { renderAvatar } from "./appearance-avatar.js";
import { createPixelChrome, findNode } from "./pixel-chrome.js";
import type { LayoutNode } from "./pixel-chrome.js";
import { createPixelMenu } from "./pixel-menu.js";
import { pixelIcon, pixelStatus, programIcon as icon } from "./pixel-ui.js";

// A terminal as `terminals()` describes it, as far as this mod reads it.
interface TerminalInfo {
  address: string;
  parent?: string | null;
  state?: string;
}

// A machine as `hc machine ls --json` describes it.
interface MachineInfo {
  name: string;
  state?: string;
  why?: string;
  via?: string;
  target?: string;
  session?: string;
  temporary?: boolean;
}

// One place's git: branch, ahead/behind, its repo.
interface GitInfo {
  name: string;
  branch: string;
  ahead: number;
  behind: number;
  // JSON.stringify([machine, repo folder])
  repo: string;
  linked: boolean;
}

// A space row before nesting: the space, its place in the sidebar, its git.
interface Entry {
  w: SpaceInfo;
  i: number;
  g: GitInfo | null;
}

// A row as drawn: an entry, and its tree glyph when it nests under its repo.
interface Row extends Entry {
  tree: string | null;
}

// A harness among a tab's agents: one per program, with its most urgent rank.
interface Harness {
  key: string;
  program: Program;
  rank: number;
}

// A tab with agents, under its space.
interface Session {
  space: string;
  tab: TabInfo;
  agents: AgentInfo[];
  harnesses: Harness[];
  status: Status | null;
  tip: string;
  label: string;
  subs: number;
}

// A space's aggregate facts, for its row.
interface SpaceFacts {
  harnesses: Harness[];
  label: string;
}

// What every space row needs that never changes between rows: live data read
// once per render (each read copies the lot) and handed down.
interface RowCtx {
  // Where the dragged space comes from, -1 while none is dragged.
  fromIndex: number;
  colors: Record<string, string>;
  dark: boolean;
  appearance: AppearanceState;
}

interface RenderSnapshot {
  sp: SpaceInfo[];
  ps: PaneInfo[];
  ms: ReturnType<typeof machines>;
  all: AgentInfo[];
  allTerminals: TerminalInfo[];
  colors: Record<string, string>;
  dark: boolean;
  appearance: AppearanceState;
  machineNames: (string | null)[];
}

// A machine being reconnected to after a rebuild.
interface Reconnect {
  machine: MachineInfo;
  removed: boolean;
  busy?: boolean;
  error?: string | null;
}

// A sidebar reorder in flight, retried until its machines settle.
interface Ordering {
  key: string;
  at: number;
  machines: (string | null)[];
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (findNode(layout() as LayoutNode, "sidebar")?.size?.px ?? Infinity) < 160;

// Where a space is now: its first terminal's live folder, else where it was made.
// `ps`: panes(), read once by the caller (each read copies every pane).
function place(s: SpaceInfo, ps: PaneInfo[]): string {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return ps.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
}
const rowHeight = ({ tree }: Pick<Row, "tree">) => (tree ? 28 : 30);
const RAIL_CELL = 32;
const railCell = (el: Element) => h_flex().flex_none().justify_center().child(el);
const where = (s: SpaceInfo, ps: PaneInfo[]) => JSON.stringify([s.machine ?? null, place(s, ps)]);
// The pair every where() key carries — [machine, folder] — typed, so the
// destructures read as what they are instead of `any`. A repo key
// (`GitInfo.repo`) is the same pair for the repo folder.
const parseWhere = (key: string): [string | null, string] => JSON.parse(key);
const base = (path: string) => path.replace(/\/+$/, "").split("/").pop();
// Changes made outside Herdr (an editor's save, a commit in another app): looked
// for this often, in repos the list shows, while the window is in front.
const FALLBACK = 60000;

// Automatic glyphs only; explicit avatar choices override these.
const HOME_GLYPH: Record<string, string> = { "~": "home" };
const TREE_GLYPH = "account_tree";

const RANK: Record<string, number> = { blocked: 4, done: 3, working: 2, idle: 1 };
const STATUS_WORD: Record<string, string> = { blocked: "Needs you", done: "Done", working: "Working", idle: "Idle" };
const clean = (s?: string | null) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();

// A tab's own name, else a terminal title that tells more than the program's,
// else the program's name ("Claude Code", "OpenCode").
function tabLabel(tab: TabInfo, agents: AgentInfo[]): string {
  if (tab.named) return tab.name;
  const lead = agents[0];
  const prog = lead?.program?.name;
  const live = clean(lead?.title);
  // clean() would strip a path's leading ~ or /: test the title with only its status glyph gone.
  const path = /^[~/]|^[A-Za-z]:\\/.test((lead?.title ?? "").replace(/^[^\p{L}\p{N}~/]+/u, ""));
  const telling = live && live !== prog && !path && !live.includes("@") && live.toLowerCase() !== lead?.program?.key;
  return telling ? live : prog || tab.name;
}

// The harnesses among some agents, one per program, most urgent first.
function harnessList(mine: AgentInfo[]): Harness[] {
  const list: Harness[] = [];
  for (const a of mine) {
    const key = a.program?.key;
    if (!key) continue;
    const rank = RANK[a.status] ?? 0;
    const found = list.find((p) => p.key === key);
    if (found) found.rank = Math.max(found.rank, rank);
    else list.push({ key, program: a.program, rank });
  }
  list.sort((a, b) => b.rank - a.rank);
  return list;
}

// "Needs you · Claude Code": the status and who is behind it.
function statusTip(status: Status | null, mine: AgentInfo[]): string {
  if (!status) return "";
  const word = STATUS_WORD[status] ?? status;
  const names = [...new Set(mine.filter((a) => a.status === status).map((a) => a.program?.name).filter(Boolean))];
  return names.length ? `${word} · ${names.join(", ")}` : word;
}

// A space's aggregate status and the harnesses in it, for the row.
function spaceInfo(w: SpaceInfo, mine: AgentInfo[]): SpaceFacts {
  return { harnesses: harnessList(mine), label: statusTip(w.status, mine) };
}

export default class Spaces extends View {
  overlay: AppearanceOverlay | null;
  // where() -> { name, branch, ahead, behind, repo, linked }, null: not a repo
  git: Record<string, GitInfo | null>;
  // where() -> when it was last looked at
  checked: Record<string, number>;
  // where()s git couldn't answer for (a machine away)
  unsure: Set<string>;
  // where()s to look at next
  pending: Set<string>;
  // pane -> an agent working or a program in front of its shell
  busy: Record<string, boolean>;
  // machine (null: this computer) -> its layout was readable at the last look
  ready: Record<string | null, boolean>;
  // space -> its where() at the last look
  at: Record<string, string>;
  // local repos' git folders
  watching: Set<string>;
  // Spaces made while this runs wait (at most a moment) for their git, so a
  // worktree appears under its repo instead of jumping there.
  shown: Set<string>;
  born: Record<string, number>;
  pressed: string | null;
  over: string | null;
  machines: MachineInfo[];
  reconnecting: Record<string, Reconnect>;
  // Machines whose spaces are folded away.
  folded: Set<string | null>;
  // Spaces whose tabs are folded away; absent ones show their sessions.
  sessionFolded: Set<string>;
  ordering: Ordering | null;
  refreshing: boolean;
  copiedLogin: string | undefined;

  init(_props: unknown, cx: AsyncContext) {
    this.overlay = createPixelChrome(_props) ?? createPixelMenu(_props, cx) ?? createAppearanceOverlay(_props, cx);
    // Menu/editor copies have their own retained inputs, not sidebar pollers.
    if (this.overlay) return;
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
    for (const state of Object.values(this.reconnecting)) state.busy = false;
    this.folded = new Set(JSON.parse(localStorage.getItem("machines.folded") ?? "[]"));
    this.sessionFolded = new Set(JSON.parse(localStorage.getItem("spaces.sessions.folded") ?? "[]"));
    this.refreshMachines(cx);
    cx.timer.every(15000, cx => this.refreshMachines(cx));
    // Refresh only when the refs could have changed (see `due`).
    cx.timer.every(250, (cx) => this.checkNew(cx));
  }

  checkNew(cx: Context) {
    const now = Date.now();
    const sp = spaces();
    for (const s of sp) if (!this.shown.has(s.id)) this.born[s.id] ??= now;
    const due = this.due(now, sp, panes());
    if (due.size) this.refreshGit(due, cx);
    if (sp.some((s) => !this.shown.has(s.id)) || this.orderingDue(now)) cx.notify();
  }

  // Places whose git could have changed: new ones (a new space, a cd), where a
  // command or an agent's turn just ended (a checkout, a commit, edits), those on
  // a machine that is back, and repos in view whose fallback is due.
  due(now: number, sp: SpaceInfo[], ps: PaneInfo[]): Set<string> {
    // Moved there: what it knew of that place may be old.
    const at: Record<string, string> = {};
    for (const s of sp) at[s.id] = where(s, ps);
    const keys = new Set(Object.values(at).filter((k) => parseWhere(k)[1]));
    const due = new Set([...keys].filter((k) => !(k in this.git)));
    for (const [id, k] of Object.entries(at)) if (this.at[id] && this.at[id] !== k && keys.has(k)) due.add(k);
    this.at = at;
    const spaceOf: Record<string, SpaceInfo> = {};
    for (const s of sp) for (const t of s.tabs ?? []) spaceOf[t.id] = s;
    const busy: Record<string, boolean> = {};
    for (const p of ps) {
      if (!p.terminal || !spaceOf[p.tab]) continue;
      busy[p.pane] = p.status === "working" || !(p.program?.shell || p.program?.agent);
      if (this.busy[p.pane] && !busy[p.pane]) this.sameRepo(at[spaceOf[p.tab].id], keys).forEach((k) => due.add(k));
    }
    this.busy = busy;
    for (const m of machines()) {
      const ready = m.layout === "ready";
      if (ready && this.ready[m.name] === false) for (const k of keys) if (parseWhere(k)[0] === m.name) due.add(k);
      this.ready[m.name] = ready;
    }
    if (window().active) {
      for (const k of keys) {
        const asks = this.git[k] || this.unsure.has(k);
        if (asks && !this.folded.has(parseWhere(k)[0]) && now - (this.checked[k] ?? 0) > FALLBACK) due.add(k);
      }
    }
    return due;
  }

  // `key` and the other places in its repo (a commit there moves their ahead/behind).
  sameRepo(key: string, keys: Set<string>): string[] {
    const repo = this.git[key]?.repo;
    return [key, ...(repo ? [...keys].filter((k) => this.git[k]?.repo === repo) : [])];
  }

  refreshMachines(cx: Context) {
    cx.spawn(async cx => {
      try { const r = await hc(["machine", "ls", "--json"]); if (r.code === 0) this.machines = (JSON.parse(r.stdout).machines ?? []).filter((m: MachineInfo) => !m.temporary); } catch {}
      cx.notify();
    });
  }

  rebuilt(machine?: MachineInfo): boolean {
    return machine?.state === "unreachable" && /^a different core answers there \("[^"]+"\)$/.test(machine.why ?? "");
  }

  reconnect(machine: MachineInfo, cx: Context) {
    const name = machine.name;
    if (this.reconnecting[name]?.busy) return;
    const state = this.reconnecting[name] ??= { machine, removed: false };
    state.busy = true;
    state.error = null;
    localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
    cx.notify();
    cx.spawn(async cx => {
      try {
        const ask = async (args: string[]) => {
          const r = await hc([...args, "--json"]);
          if (r.code !== 0) {
            let error;
            try { error = JSON.parse(r.stdout || r.stderr).error?.message; } catch {}
            throw new Error(error || r.stderr || r.stdout || "Couldn't connect.");
          }
        };
        if (!state.removed) {
          await ask(["machine", "rm", name]);
          state.removed = true;
          localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
        }
        const args = ["machine", "add"];
        if (machine.via) args.push("--via", machine.target);
        else args.push(machine.target);
        args.push("--name", name);
        if (machine.session) args.push("--session", machine.session);
        if (machine.temporary) args.push("--temp");
        await ask(args);
        this.folded.delete(name);
        localStorage.setItem("machines.folded", JSON.stringify([...this.folded]));
        delete this.reconnecting[name];
      } catch (e) {
        state.error = String((e as { message?: string }).message ?? e);
        state.busy = false;
      }
      localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
      this.refreshMachines(cx);
      cx.notify();
    });
  }

  // One look at a time, each place once however often it was asked for meanwhile.
  refreshGit(keys: Iterable<string>, cx: Context) {
    for (const k of keys) this.pending.add(k);
    if (this.refreshing) return;
    this.refreshing = true;
    cx.spawn(async (cx) => {
      while (this.pending.size) {
        const keys = [...this.pending];
        this.pending.clear();
        await Promise.all(keys.map((key) => this.check(key, cx)));
      }
      const used = new Set(Object.values(this.git).filter(Boolean).map((g) => parseWhere(g.repo)).filter(([on]) => !on).map(([, repo]) => repo));
      for (const repo of this.watching) if (!used.has(repo)) this.watching.delete(repo);
      this.refreshing = false;
      cx.notify();
    });
  }

  // One place's git: branch, ahead/behind, its repo.
  async check(key: string, cx: Context) {
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
        if (!/not a git repository/i.test(r.code !== 0 ? r.stderr : common.stderr)) this.unsure.add(key);
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
      const info: GitInfo = { name, branch: branch.code === 0 ? branch.stdout.trim().replace(/^refs\/heads\//, "") : "(detached)", ahead, behind, repo: JSON.stringify([on, repo]), linked: repo !== `${top}/.git` };
      this.git[key] = info;
      if (!on) this.watch(repo, cx);
    } catch {
      // Couldn't ask (the machine is away): keep what it showed, look again later.
      this.git[key] ??= null;
      this.unsure.add(key);
    }
  }

  watch(repo: string, cx: Context) {
    if (this.watching.has(repo)) return;
    this.watching.add(repo);
    cx.spawn(async (cx) => {
      try {
        while (this.watching.has(repo)) {
          await watchFolder(repo);
          const mine = JSON.stringify([null, repo]);
          if (this.watching.has(repo)) this.refreshGit(Object.keys(this.git).filter((k) => this.git[k]?.repo === mine), cx);
        }
      } catch { this.watching.delete(repo); }
    });
  }

  menu(w: SpaceInfo, git: GitInfo | null, tree: boolean) {
    openSpaceMenu(w.id, git ? git.linked ? "linked" : "main" : null, tree);
  }

  orderingDue(now: number, ms = machines()): boolean {
    return this.ordering && now - this.ordering.at >= 1000
      && this.ordering.machines.every(name => ms.some(m => m.name === name && m.layout === "ready"));
  }

  // Spaces in order, each worktree space moved under its main checkout's.
  // `sp`/`ps`: spaces() / panes(), read once by the caller (each read copies the lot).
  ordered(sp: SpaceInfo[], ps: PaneInfo[], ms: ReturnType<typeof machines>): Row[] {
    const ready = (w: SpaceInfo) => this.shown.has(w.id) || where(w, ps) in this.git || Date.now() - (this.born[w.id] ??= Date.now()) > 1500;
    for (const w of sp) if (!this.shown.has(w.id) && ready(w)) this.shown.add(w.id);
    const list = sp.map((w, i) => ({ w, i, g: this.git[where(w, ps)] ?? null }));
    const mains = new Set(list.filter((r) => r.g && !r.g.linked).map((r) => r.g.repo));
    const nested = (r: Entry) => r.g?.linked && mains.has(r.g.repo);
    const out: Row[] = [];
    const placed = new Set<string>(); // repos whose worktrees are listed (under the first of its spaces)
    for (const r of list) {
      if (nested(r)) continue;
      out.push({ ...r, tree: null });
      if (!r.g || r.g.linked || placed.has(r.g.repo)) continue;
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
    } else {
      // Only a differing order needs its key (the machines list serializes too).
      const key = JSON.stringify([order, target, ms]);
      if (this.ordering?.key !== key || this.orderingDue(Date.now(), ms)) {
        const moved = new Set<string | null>();
        this.ordering = { key, at: Date.now(), machines: [] };
        for (let i = 0; i < out.length; i++) {
          const from = order.indexOf(out[i].w.id);
          if (from === i) continue;
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
  sessions(rows: Row[], bySpace: Map<string, AgentInfo[]>, allTerminals: TerminalInfo[], subagents: Set<string>): Map<string, Session[]> {
    const kids = new Map<string, TerminalInfo[]>();
    for (const k of allTerminals) {
      if (!k.parent) continue;
      if (!kids.has(k.parent)) kids.set(k.parent, []);
      kids.get(k.parent).push(k);
    }
    const below = (address: string): number => {
      let n = 0;
      for (const k of kids.get(address) ?? []) {
        if (k.state !== "live") continue;
        n += 1 + below(k.address);
      }
      return n;
    };
    const out = new Map<string, Session[]>();
    for (const { w } of rows) {
      const mine = (bySpace.get(w.id) ?? []).filter((a) => !subagents.has(a.address));
      const list: Session[] = [];
      for (const tab of w.tabs ?? []) {
        const agents = mine.filter((a) => a.tab === tab.id);
        if (!agents.length) continue;
        const status = tab.status ?? agents.reduce<Status | null>((s, a) => ((RANK[a.status] ?? 0) > (RANK[s] ?? 0) ? a.status : s), null);
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
      const seen: Record<string, number> = {};
      for (const s of list) seen[s.label] = (seen[s.label] ?? 0) + 1;
      for (const s of list) if (seen[s.label] > 1) s.label += ` · ${s.tab.index}`;
      out.set(w.id, list);
    }
    return out;
  }

  // The rows, under a header per machine once one isn't this computer.
  grouped(t: Theme, collapsed: boolean, snapshot: RenderSnapshot): Element[] {
    const { sp, ps, ms, all, allTerminals, machineNames, appearance } = snapshot;
    const rows = this.ordered(sp, ps, ms);
    const bySpace = new Map<string, AgentInfo[]>();
    for (const a of all) {
      if (!bySpace.has(a.space)) bySpace.set(a.space, []);
      bySpace.get(a.space).push(a);
    }
    const subagents = new Set(allTerminals.filter((k) => k.parent).map((k) => k.address));
    const sessions = this.sessions(rows, bySpace, allTerminals, subagents);
    const infos = new Map(rows.map((r): [string, SpaceFacts] => [r.w.id, spaceInfo(r.w, bySpace.get(r.w.id) ?? [])]));
    // What every space row needs, read once here instead of once per row.
    const ctx: RowCtx = {
      fromIndex: this.pressed === null ? -1 : sp.findIndex(s => s.id === this.pressed),
      colors: snapshot.colors,
      dark: snapshot.dark,
      appearance,
    };
    // One drawn row, with its sessions under it unless folded away.
    const add = (r: Row): Element[] => {
      if (collapsed) return [this.compact(r, t)];
      const list = sessions.get(r.w.id) ?? [];
      const folded = this.sessionFolded.has(r.w.id);
      const fill = resolveColor(ctx.colors[r.w.id], t);
      return [v_flex().id(`space-group-${r.w.id}`).flex_none().mb(8).overflow_hidden()
        .border_1().border_color((fill + (r.w.active ? "aa" : "55")) as Color)
        .border_l(3).bg((fill + (r.w.active ? "0c" : "05")) as Color)
        .when(Boolean(r.tree), el => el.ml(12))
        .child(this.row(r, t, ctx, infos.get(r.w.id), list, folded))
        .when(!folded && list.length > 0, el => el.child(v_flex().py(3).gap(2)
          .border_t(1).border_color((fill + "33") as Color)
          .children(list.map(s => this.sessionRow(r, s, t)))))];
    };
    // Navigation follows what is on screen.
    const order: string[] = [];
    for (const r of rows) for (const s of sessions.get(r.w.id) ?? []) for (const a of s.agents) order.push(a.address);
    setAgentOrder(order);
    const loading = (m: string | null) => {
      const layout = ms.find(k => k.name === m)?.layout;
      return layout === "loading" || (!layout && this.machines.some(k => k.name === m && k.state === "connected"))
        || sp.some(s => (s.machine ?? null) === m && !this.shown.has(s.id));
    };
    const loadingRow = (m: string | null) => h_flex().id(`machine-loading-${m ?? "local"}`).h(28).flex_none().px(collapsed ? 0 : 8).items_center().when(collapsed, el => el.justify_center()).text_size(12).text_color(t.dim).child(collapsed ? "…" : "Loading…");
    if (machineNames.length === 1) return loading(null) && !rows.length ? [loadingRow(null)] : rows.flatMap(add);
    const machineColor = (m: string | null): Color => resolveColor(
      appearance.machines[machineKey(m)]?.color ?? appearance.defaults[machineKey(m)]?.color, t);
    // The machine's color fills and frames a compact Critters panel.
    // One machine (or the rail) still stays a plain list.
    const card = (m: string | null, idx: number, children: Element[]): Element =>
      v_flex().id(`machine-card-${m ?? "local"}`).flex_none()
        .when(idx > 0, el => el.mt(8))
        .bg((machineColor(m) + "0d") as Color).border(2).border_color((machineColor(m) + "55") as Color)
        .px(4).pb(4)
        .children(children);
    return machineNames.flatMap((m: string | null, idx: number) => {
      const mine = rows.filter((r) => (r.w.machine ?? null) === m);
      const repair = this.reconnecting[m];
      const machine = this.machines.find(k => k.name === m) ?? repair?.machine;
      const connected = !m || machine?.state === "connected";
      const rebuilt = this.rebuilt(machine) || !!repair;
      const login = machine?.state === "needs_login" ? `hc machine login ${m}` : null;
      const folded = this.folded.has(m);
      const icon = pixelIcon(m ? "server" : "monitor", t.dim);
      const badge = div().absolute().right(-3).bottom(-2).size(6).border_1().border_color(t.chrome).bg(connected ? t.ansi2 : t.dim);
      // A small static scene gives the same identity mascot more presence.
      // Stars and ground are decoration, never a fabricated machine status.
      const key = machineKey(m);
      const avatar = appearance.machines[key]?.avatar ?? { kind: "pixel" as const, name: appearance.defaults[key].mascot };
      const fill = machineColor(m);
      const head = h_flex().id(`machine-${m ?? "local"}`).h(collapsed ? 26 : 58).flex_none().px(collapsed ? 0 : 8).gap(5).items_center().text_size(14).text_color(t.dim)
        .when(!collapsed, el => el.my(4).bg((fill + "18") as Color))
        .when(collapsed, el => el.mt(4).w(RAIL_CELL).justify_center().tooltip(login ? `${m} needs a login: run ${login}. Click for Copy.` : m ? `${m} · ${connected ? "connected" : (machine?.state ?? "asleep").replace(/_/g, " ")}` : "This computer"))
        .cursor_pointer().hover(s => s.bg(t.hover))
        .on_click((_e, cx) => {
          if (collapsed && login) { run("app.settings", { section: "machines" }); return; }
          folded ? this.folded.delete(m) : this.folded.add(m);
          localStorage.setItem("machines.folded", JSON.stringify([...this.folded]));
          cx.notify();
        })
        .on_mouse_down("right", (_event, cx) => {
          cx.stop_propagation();
          openAppearance({ kind: "machine", machine: m });
        })
        .when(!collapsed, el => el.child(div().relative().w(50).h(44).flex_none()
          .bg(t.chrome).border_1().border_color((fill + "55") as Color)
          .when(!connected, el => el.opacity(0.5))
          .child(div().absolute().left(0).right(0).bottom(0).h(9).bg((fill + "33") as Color))
          .child(div().absolute().left(5).top(7).size(2).bg((fill + "aa") as Color))
          .child(div().absolute().right(7).top(12).size(2).bg((fill + "77") as Color))
          .child(div().absolute().left(10).top(16).size(1).bg(t.muted))
          .child(div().absolute().left(15).bottom(5).w(20).h(3).bg((fill + "44") as Color))
          .child(renderAvatar(avatar, 32, fill, m ?? "This computer").absolute().left(9).bottom(5))))
        .when(collapsed, el => el.child(div().relative().flex_none().child(icon).when(Boolean(m), el => el.child(badge))))
        .when(!collapsed, el => el.child(v_flex().flex_1().min_w(0).gap(3)
          .child(div().truncate().text_size(18).text_color(connected ? t.foreground : t.muted)
            .tooltip(m ?? "This computer").child((m ?? "This computer").toUpperCase()))
          .child(div().truncate().text_size(13).text_color(t.muted)
            .child(`${m ? "Remote" : "Local"} · ${mine.length} space${mine.length === 1 ? "" : "s"}`)))
          .when(!connected && !rebuilt && !login, el => el.child(div().flex_none().child((machine?.state ?? "asleep").replace(/_/g, " "))))
          .when(rebuilt, el => el.child(h_flex().flex_none().gap(3).items_center()
            .child(div().max_w(140).truncate().child(repair?.error || "rebuilt ·"))
            .child(div().id(`machine-connect-${m}`).text_color(repair?.error ? t.blocked : t.muted)
              .hover(s => s.text_color(t.foreground))
              .tooltip(repair?.error || "This machine was rebuilt or replaced. Click to connect to the new one.")
              .on_click((_e, cx) => { cx.stop_propagation(); this.reconnect(machine, cx); })
              .child(repair?.busy ? "Connecting…" : "Connect"))))
          .child(div().id(`machine-appearance-${key}`).size(18).flex_none().flex().items_center().justify_center()
            .tooltip("Change machine color and avatar").cursor_pointer().hover(el => el.bg(t.hover).text_color(t.foreground))
            .on_mouse_down("left", (_event, cx) => cx.stop_propagation())
            .on_mouse_up("left", (_event, cx) => cx.stop_propagation())
            .on_click((_event, cx) => { cx.stop_propagation(); openAppearance({ kind: "machine", machine: m }); })
            .child(pixelIcon("settings", t.dim, 12)))
          .when(connected, el => el.child(div().id(`machine-add-${m ?? "local"}`).flex_none().px(4).hover(s => s.bg(t.hover).text_color(t.foreground))
            .on_click((_e, cx) => { cx.stop_propagation(); run("space.new", { machine: m ?? "" }); }).child("+")))
          .child(div().size(6).flex_none().bg(connected ? t.ansi2 : t.dim))
          .child(pixelIcon(folded ? "right" : "down", t.dim, 10)));
      const empty = h_flex().id(`machine-new-${m ?? "local"}`).h(28).flex_none().px(collapsed ? 0 : 8).gap(7).items_center()
        .text_size(12).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
        .on_click(() => run("space.new", { machine: m ?? "" }))
        .when(collapsed, el => el.w(RAIL_CELL).justify_center().tooltip(`New space on ${m ?? "this computer"}`)
          .child(h_flex().size(18).border_1().border_color(t.dim).items_center().justify_center()
            .child(pixelIcon("plus", t.dim, 10))))
        .when(!collapsed, el => el.child(pixelIcon("plus", t.dim, 12)).child("New space there"));
      const cell = collapsed ? railCell : (el: Element) => el;
      const guidance = !collapsed && login ? [v_flex().px(8).pb(6).gap(3).flex_none()
        .child(div().text_size(11).text_color(t.blocked).child("needs a login: run"))
        .child(h_flex().gap(5).items_center()
          .child(div().flex_1().min_w(0).truncate().tooltip(login).text_size(11).text_color(t.muted).child(login))
          .child(div().id(`machine-login-copy-${m}`).flex_none().px(5).py(2)
            .text_size(11).text_color(t.foreground).bg(t.raised).cursor_pointer().hover(s => s.bg(t.hover))
            .on_click((_e, cx) => { cx.stop_propagation(); cx.write_to_clipboard(login); this.copiedLogin = login; cx.notify(); })
            .child(this.copiedLogin === login ? "Copied" : "Copy")))] : [];
      const kids: Element[] = [...guidance, ...(folded ? [] : mine.length ? mine.flatMap(add) : [loading(m) ? loadingRow(m) : cell(empty)])];
      // The rail stays a plain list of cells; a rebuilt machine folds to its card's head.
      if (collapsed) return [cell(head), ...kids];
      if (rebuilt) return [card(m, idx, [head])];
      return [card(m, idx, [head, ...kids])];
    });
  }

  // Only what's unusual, after the name: "herdr · spike ↑12 ↓31". The repo or
  // branch goes when the name already says it (a worktree is named after its branch),
  // and master/main go: nearly every space is on one.
  gitTail(g: GitInfo, tree: string | null, name: string, t: Theme): Element {
    const raw = g.branch ?? "detached";
    const same = (a: string) => a.toLowerCase() === name.toLowerCase();
    const branch = same(raw) || raw === "master" || raw === "main" ? "" : raw;
    const repo = tree || same(g.name) ? "" : g.name;
    const where = [repo, branch].filter(Boolean).join(" · ");
    return h_flex()
      .flex_1()
      .min_w(0)
      .gap(5)
      .justify_end()
      .items_center()
      .text_size(11.5)
      .text_color(t.dim)
      .when(Boolean(where), (el) => el.child(div().min_w(0).truncate().child(where)))
      .when(g.ahead > 0, (el) => el.child(div().flex_none().text_color(t.ansi2).child(`↑${g.ahead}`)))
      .when(g.behind > 0, (el) => el.child(div().flex_none().text_color(t.ansi1).child(`↓${g.behind}`)));
  }

  row({ w, i, g, tree }: Row, t: Theme, ctx: RowCtx, info: SpaceFacts, sessions: Session[], folded: boolean): Element {
    const on = w.active;
    const fromIndex = ctx.fromIndex;
    const color = ctx.colors[w.id] ?? "ansi6";
    const fill = resolveColor(color, t);
    // A soft tile: the hue at a fifth, a thin edge of the same, and the glyph
    // in the hue on dark themes (foreground reads better on light ones).
    const ink = ctx.dark ? fill : t.foreground;
    const glyph = tree ? TREE_GLYPH : HOME_GLYPH[w.name] ?? null;
    const tile = (child: Element) => h_flex().size(22).flex_none()
      .bg((fill + "2e") as Color).border_1().border_color((fill + "33") as Color)
      .items_center().justify_center().child(child);
    // Expanded, its session rows carry the harnesses and status; folded or
    // without them, the space row says it itself.
    const showStatus = Boolean(w.status) && (folded || !sessions.length);
    const pics = showStatus
      ? info.harnesses.map((h) => ({ h, pic: icon(h.program, 13, t.muted) })).filter((p) => p.pic)
      : [];
    return v_flex()
      .relative()
      .id(`space-${w.id}`)
      .px(8)
      .h(rowHeight({ tree }))
      .flex_none()
      .justify_center()
      .when(on, (el) => el.bg(t.selected))
      .when(!on, (el) => el.hover((s) => s.bg(t.hover)))
      .when(this.pressed === w.id && this.over !== w.id, (el) => el.opacity(0.5))
      .when(this.pressed !== null && this.over === w.id && this.pressed !== w.id, (el) => el.child(
        div().absolute().left(0).right(0).h(2).bg(t.accent)
          .when(fromIndex < i, line => line.bottom(0))
          .when(fromIndex > i, line => line.top(0)),
      ))
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
          if (index !== -1) run("space.move", { id: from, index: index + 1 });
        } else if (from === w.id) run("space.select", { id: w.id });
        cx.notify();
      })
      .on_mouse_down("right", () => this.menu(w, g, Boolean(tree)))
      .child(
        h_flex()
          .gap(9)
          .items_center()
          .child(tile(renderAvatar(ctx.appearance.spaces[w.id]?.avatar, 20, ink, w.name, () => glyph
            ? svg(`mods/spaces-status/icons/${glyph}.svg`).size(12).text_color(ink)
            : div().text_size(18).text_color(ink).child([...w.name][0]?.toUpperCase() ?? "?"))))
          .child(div().flex_shrink(0).max_w(150).truncate().text_color(t.foreground).child(w.name))
          .child(g ? this.gitTail(g, tree, w.name, t) : div().flex_1())
          .when(showStatus, (el) => el.child(
            h_flex().flex_none().ml(6).gap(4).items_center()
              .children(pics.map((p) => div().flex_none().tooltip(p.h.program.name).child(p.pic)))
              .child(pixelStatus(t, w.status, info.label)),
          ))
          .when(sessions.length > 0, (el) => el.child(
            div().id(`space-fold-${w.id}`).flex_none().ml(4).size(14).flex().items_center().justify_center()
              .text_color(t.dim).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground))
              .tooltip(folded ? "Show sessions" : "Hide sessions")
              .on_mouse_down("left", (_e, cx) => {
                cx.stop_propagation();
                folded ? this.sessionFolded.delete(w.id) : this.sessionFolded.add(w.id);
                localStorage.setItem("spaces.sessions.folded", JSON.stringify([...this.sessionFolded]));
                cx.notify();
              })
              .child(pixelIcon(folded ? "right" : "down", t.dim, 10)),
          )));
  }

  // A tab with agents, under its space: its harnesses, name, sub-agent count,
  // and its own status. A worktree space's sessions sit one level deeper.
  sessionRow({ w }: Pick<Row, "w">, s: Session, t: Theme): Element {
    const harnesses = s.harnesses
      .map((h) => ({ h, pic: icon(h.program, 13, t.muted) }))
      .filter((p) => p.pic);
    const on = w.active && s.tab.active;
    const color = s.tab.settled ? t.dim : on ? t.foreground : t.muted;
    return h_flex()
      .id(`session-${s.tab.id}`)
      .h(26)
      .flex_none()
      .pl(12)
      .pr(8)
      .gap(8)
      .items_center()
      .when(on, (el) => el.bg(t.selected))
      .when(!on, (el) => el.hover((hover) => hover.bg(t.hover)))
      .cursor_pointer()
      .on_click(() => {
        run("space.select", { id: w.id });
        run("tab.select", { id: s.tab.id });
      })
      .tooltip(s.tip ? `${s.label} · ${s.tip}` : s.label)
      .child(div().size(4).flex_none().bg(on ? t.accent : t.dim))
      .when(harnesses.length > 0, (el) => el.child(
        h_flex().flex_none().gap(3).items_center()
          .children(harnesses.map((p) => div().flex_none().tooltip(p.h.program.name).child(p.pic))),
      ))
      .child(div().flex_1().min_w(0).truncate().text_color(color).child(s.label))
      .when(s.subs > 0, (el) => el.child(div().flex_none().text_size(10).text_color(t.dim)
        .tooltip(`${s.subs} sub-agent${s.subs === 1 ? "" : "s"}`).child(`+${s.subs}`)))
      .when(Boolean(s.status), (el) => el.child(pixelStatus(t, s.status, s.tip)));
  }

  compact({ w, i }: Pick<Row, "w" | "i">, t: Theme): Element {
    return railCell(h_flex()
      .id(`space-${w.id}`)
      .relative()
      .w(RAIL_CELL)
      .h(26)
      .justify_center()
      .items_center()
      .when(w.active, (el) => el.bg(t.selected))
      .when(!w.active, (el) => el.hover((s) => s.bg(t.hover)))
      .on_click(() => run("space.select", { id: w.id }))
      .on_mouse_down("right", (_event, cx) => { cx.stop_propagation(); openAppearance({ kind: "space", id: w.id }); })
      .child(div().text_color(w.active ? t.foreground : t.muted).child(String(i + 1)))
      .child(div().absolute().right(4)
        .size(w.status === "blocked" || w.status === "done" ? 5 : 3).bg(t[w.status] ?? t.unknown)));
  }

  render(): Element {
    if (this.overlay) return this.overlay.render();
    const t = theme() as Theme;
    const collapsed = narrow();
    const sp = spaces(), ps = panes(), ms = machines(), all = agents();
    const allTerminals = terminals() as TerminalInfo[];
    const remoteNames = [...new Set([
      ...sp.map(space => space.machine).filter((name): name is string => Boolean(name)),
      ...this.machines.map(machine => machine.name), ...Object.keys(this.reconnecting),
    ])].sort();
    const machineNames: (string | null)[] = [null, ...remoteNames];
    const storedAppearance = shared(APPEARANCE_KEY);
    const appearance = ensureMachineDefaults(readAppearance(storedAppearance), machineNames);
    if (JSON.stringify(appearance) !== JSON.stringify(storedAppearance)) setShared(APPEARANCE_KEY, appearance);
    const storedColors = shared("space.colors");
    const colors = assignSpaceColors(sp, storedColors, appearance.spaces);
    if (JSON.stringify(colors) !== JSON.stringify(storedColors ?? {})) setShared("space.colors", colors);
    const snapshot: RenderSnapshot = { sp, ps, ms, all, allTerminals, colors, appearance, machineNames, dark: settings().dark !== false };
    return v_flex().size_full().min_h(0).bg(t.chrome).font_family(UI_FONT).text_size(UI_FONT_SIZE)
      .child(h_flex().h(31).pl(12).pr(10).items_center().justify_between().text_size(14).text_color(t.dim)
        .when(collapsed, el => el.pl(0).pr(0).justify_center())
        .when(!collapsed, el => el.child("SPACES"))
        .child(div().id("space-new").size(26).flex_none().flex().items_center().justify_center().hover(s => s.bg(t.hover).text_color(t.foreground))
          .on_click(() => run("space.new")).child(pixelIcon("plus", t.dim))))
      .child(v_flex().flex_1().min_h(0).px(collapsed ? 0 : 8).pb(14).overflow_y_scrollbar().mode("always")
        .on_mouse_up("left", (_e, cx) => { this.pressed = null; cx.notify(); })
        .children(this.grouped(t, collapsed, snapshot)));
  }
}
