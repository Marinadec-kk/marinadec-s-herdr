// Git reads, limits and commit flow adapted from Herdr 0.1.16 (Apache-2.0).
import { div } from "gpui-kit";
import type { AsyncContext, Context, Element } from "gpui-kit";
import { v_flex, h_flex, InputState, Scrollbar, v_virtual_list } from "gpui-base";
import { exec, readTextFile, theme, settings } from "herdr";
import type { Theme } from "../appearance-model.js";
import { actionRow, button, textInput, secondary } from "../ui/controls.js";
import { surface, panelHeader, emptyState } from "../ui/surfaces.js";
import { tint } from "../appearance-colors.js";
import type { Location } from "./panel-location.js";
import { PanelLifecycle, LatestRequest } from "./panel-lifecycle.js";
import { git, repositoryTop, readGitStatus, GIT_READ } from "../data/git.js";
import type { GitFile } from "../data/git-status.js";
import { gitMarkColor } from "../presentation/git.js";
import { joinPath } from "../data/paths.js";
import { UI } from "../ui/tokens.js";

interface File extends GitFile { add: number; del: number; binary?: boolean }
interface DiffRow { kind: string; number?: number; text: string }
const untab = (text: string) => text.replace(/[^\t]*\t/g, s => s.slice(0, -1).padEnd((s.length - 1) - (s.length - 1) % 4 + 4));
function diffRows(lines: string[]): DiffRow[] {
  let old = 0, next = 0;
  return lines.map(line => {
    const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);
    if (match) { old = +match[1]; next = +match[2]; return { kind: "@", text: line }; }
    const kind = line[0];
    if (kind === "-") return { kind, number: old++, text: untab(line.slice(1)) || " " };
    if (kind === "+") return { kind, number: next++, text: untab(line.slice(1)) || " " };
    if (kind === " ") { old++; return { kind, number: next++, text: untab(line.slice(1)) || " " }; }
    return { kind: "", text: line };
  });
}
export class Changes {
  private files: File[] = [];
  private rows: DiffRow[] = [];
  private diffWidth = 300;
  private input = InputState.new({ placeholder: "Commit message" });
  private handle: ReturnType<Context["focus_handle"]>;
  private message = "";
  private typing = false;
  private context: Location | undefined;
  private lifecycle: PanelLifecycle;
  private preview = new LatestRequest();
  private root: string | null = null;
  private on: string | null = null;
  private open: string | null = null;
  private hasHead = false;
  private closed = false;
  private limited = false;
  private busy = false;
  private error = "";
  private note = "";
  constructor(cx: AsyncContext) {
    this.lifecycle = new PanelLifecycle(cx, cx => this.refresh(cx));
    this.handle = cx.focus_handle();
    this.input.on("change", (_e, cx) => { this.message = this.input.value(); cx.notify(); });
    this.input.on("submit", (_e, cx) => this.commit(cx));
    this.input.on("focus", (_e, cx) => { this.typing = true; cx.notify(); });
    this.input.on("blur", (_e, cx) => { this.typing = false; cx.notify(); });
    this.refresh(cx);
  }
  close(): void { this.lifecycle.close(); this.preview.cancel(); }
  private current(context: Location): boolean { return this.lifecycle.current(context); }
  private refresh(cx: Context): void {
    const context = this.lifecycle.sync(), { cwd, on } = context;
    if (context !== this.context) {
      this.context = context; this.root = null; this.files = []; this.open = null;
      this.preview.cancel();
      this.setLines([]); this.message = ""; this.input.set_value(""); this.error = this.note = "";
      this.closed = this.limited = false;
    }
    if (!cwd || this.busy) return;
    const request = this.lifecycle.begin(context);
    if (!request) return;
    cx.spawn(async cx => {
      try {
        const top = await repositoryTop(cwd, on);
        if (!this.current(context)) return;
        if (!top.ok) { this.root = null; this.files = []; this.setLines([]); this.open = null; this.error = "Not a Git repository"; return; }
        const root = top.out, read = (args: string[]) => git(root, [...GIT_READ, ...args], on);
        const status = await readGitStatus(root, on, 1000);
        const head = await read(["rev-parse", "--verify", "HEAD"]);
        const stats: Record<string, { add: number; del: number; binary?: boolean }> = {};
        const results = head.ok ? [await read(["diff", "HEAD", "--numstat", "-z", "--no-renames"])]
          : [await read(["diff", "--cached", "--numstat", "-z", "--no-renames"]), await read(["diff", "--numstat", "-z", "--no-renames"])];
        for (const result of results) {
          if (result.code !== 0) throw new Error(result.stderr);
          for (const entry of result.stdout.split("\0")) {
            const [a, d, ...parts] = entry.split("\t");
            if (!parts.length) continue;
            const path = parts.join("\t"), old = stats[path] ?? { add: 0, del: 0 };
            stats[path] = { add: old.add + (Number(a) || 0), del: old.del + (Number(d) || 0), binary: a === "-" };
          }
        }
        const files = status.files.map((file): File => ({ ...file, ...(stats[file.path] ?? { add: 0, del: 0 }) }));
        if (!this.current(context)) return;
        this.root = root; this.on = on; this.hasHead = head.ok; this.files = files; this.limited = status.limited; this.error = "";
        this.lifecycle.watch(root, context, cx);
        if (this.open && !files.some(f => f.path === this.open)) { this.open = null; this.setLines([]); }
        if (!this.open && !this.closed && files.length) this.open = files[0].path;
        if (this.open) {
          await this.load(this.open, context);
        }
      } catch (error) { if (this.current(context)) this.error = String(error); }
      finally { this.lifecycle.finish(request, cx); }
    });
  }
  private async load(path: string, context: Location): Promise<void> {
    const file = this.files.find(f => f.path === path), root = this.root, on = this.on;
    if (!file || !root) return;
    const latest = this.preview.next(), hasHead = this.hasHead;
    let lines: string[];
    try {
      if (file.fresh || (!hasHead && file.status === "A")) {
        const text = await readTextFile(joinPath(root, path), { on }).catch((): null => null);
        if (text === null) lines = ["Cannot preview this file (binary, too large, or unreadable)"];
        else if (text.includes("\0")) lines = ["Binary file · no text diff"];
        else {
          const add = text ? text.split("\n").length - Number(text.endsWith("\n")) : 0;
          if (latest() && this.current(context)) file.add = add;
          lines = [`@@ -0,0 +1,${add} @@`, ...text.slice(0, 400000).replace(/\n$/, "").split("\n").slice(0, 1500).map(l => `+${l}`)];
        }
      } else {
        const r = await git(root, [...GIT_READ, "diff", ...(hasHead ? ["HEAD"] : []), "--no-ext-diff", "--no-textconv", "--no-color", "--", path], on);
        if (r.code !== 0) throw new Error(r.stderr);
        const all = r.stdout.replace(/\n$/, "").split("\n"), first = all.findIndex(l => l.startsWith("@@"));
        lines = first < 0 ? [file.binary ? "Binary file changed" : "No text diff available"] : all.slice(first);
      }
    } catch { lines = ["Cannot preview this diff (too large or unreadable)"]; }
    if (latest() && this.current(context) && this.open === path) this.setLines(lines.slice(0, 1500).map(line => line.length > 4000 ? line.slice(0, 4000) + "… (line truncated)" : line));
  }
  private setLines(lines: string[]): void {
    this.rows = diffRows(lines); this.diffWidth = Math.max(300, ...this.rows.map(row => (row.text.length + 1) * 8.4 + 50));
  }
  private pick(path: string, cx: Context): void {
    this.preview.cancel();
    this.open = this.open === path ? null : path; this.setLines([]); this.note = ""; this.closed = !this.open;
    const context = this.context!;
    if (this.open) cx.spawn(async cx => {
      await this.load(path, context);
      cx.notify();
    });
    cx.notify();
  }
  private commit(cx: Context): void {
    if (!this.message.trim() || !this.root || this.busy || this.lifecycle.loading || !this.context || !this.current(this.context)) return;
    const root = this.root, on = this.on, context = this.context, message = this.message.trim();
    this.busy = true; this.note = ""; cx.notify();
    cx.spawn(async cx => {
      try {
        for (const args of [["add", "-A"], ["commit", "-m", message]]) {
          const result = await exec("git", args, { cwd: root, on });
          if (result.code !== 0) throw new Error((result.stderr || result.stdout).trim());
        }
        if (this.current(context)) { this.message = ""; this.input.set_value(""); }
      } catch (error) { if (this.current(context)) this.note = `Commit failed: ${error}`; }
      finally { this.busy = false; this.refresh(cx); cx.notify(); }
    });
  }
  private diffRow({ kind, number, text }: DiffRow, t: Theme): Element {
    if (kind === "@") return div().w_full().px(12).h(20).flex_none().truncate().bg(t.raised).text_color(t.dim).child(text);
    return h_flex().w_full().h(20).flex_none().gap(10)
      .when(kind === "+", el => el.bg(tint(t.ansi2, t.background, .1))).when(kind === "-", el => el.bg(tint(t.ansi1, t.background, .1)))
      .child(div().w(30).flex_none().text_right().text_color(t.dim).child(number === undefined ? "" : String(number)))
      .child(div().flex_1().min_w(0).truncate().child(text));
  }
  render(cx?: Context): Element {
    if (cx && (!this.context || !this.current(this.context))) this.refresh(cx);
    const t = theme() as Theme, add = this.files.reduce((n, f) => n + f.add, 0), del = this.files.reduce((n, f) => n + f.del, 0);
    const enabled = Boolean(this.message.trim() && this.root && !this.busy && !this.lifecycle.loading), font = settings().font_family;
    return surface(t, "panel").id("changes").size_full().overflow_hidden().track_focus(this.handle)
      .on_key_down((event, cx) => { if (event.key === "escape" && this.typing) { this.typing = false; this.handle.focus(); cx.stop_propagation(); cx.notify(); } })
      .child(panelHeader(t, "Changes").child(secondary(t, `${this.files.length} files`)).child(div().flex_1())
        .child(secondary(t, `+${add}`).text_color(t.ansi2)).child(secondary(t, `−${del}`).text_color(t.ansi1)))
      .child(div().flex_1().min_h(44).max_h(this.files.length * 28 + 12).relative().border_b(UI.stroke).border_color(t.border)
        .child(v_flex().id("changes-list").absolute().inset_0().overflow_y_scroll().p(6)
          .children(this.files.map(file => actionRow(t, `change-${file.path}`, file.path, cx => this.pick(file.path, cx), { selected: this.open === file.path }).h(28)
            .child(secondary(t, file.status).w(14).text_color(gitMarkColor(t, file.status)))
            .child(div().flex_1().min_w(0).truncate().tooltip(file.path).text_color(t.foreground).child(file.path))
            .when(file.add > 0, el => el.child(secondary(t, `+${file.add}`).text_color(t.ansi2)))
            .when(file.del > 0, el => el.child(secondary(t, `−${file.del}`).text_color(t.ansi1)))))
          .when(!this.files.length, el => el.child(emptyState(t, this.error || (this.lifecycle.loading ? "Loading changes…" : this.root ? "No uncommitted changes" : "No folder")))))
        .child(Scrollbar.vertical("changes-list").absolute().inset_0()))
      .when(this.limited, el => el.child(secondary(t, "Showing the first 1,000 changed files").px(12)))
      .child(div().flex_1().min_h(0).relative().font_family(typeof font === "string" ? font : "Liberation Mono").text_size(14)
        .child(div().id("changes-diff-x").size_full().overflow_x_scrollbar()
          .child(div().w_full().min_w(this.diffWidth).h_full().child(v_virtual_list("changes-diff", this.rows.length, 20, i => String(i),
            range => this.rows.slice(range.start, range.end).map(row => this.diffRow(row, t))).size_full())))
        .child(Scrollbar.vertical("changes-diff").viewport_from_layout().absolute().inset_0())
        .when(!this.open && this.files.length > 0, el => el.child(secondary(t, "Select a file to view its changes").absolute().top(6).px(12))))
      .when(Boolean(this.note), el => el.child(secondary(t, this.note).px(10).pb(8).text_color(t.ansi1)))
      .child(h_flex().flex_none().p(10).gap(8).border_t(UI.stroke).border_color(t.border)
        .child(textInput(t, this.input).id("commit-message").flex_1().min_w(0))
        .child(button(t, "commit", this.busy ? "Committing…" : "Commit", cx => this.commit(cx), { selected: true, disabled: !enabled })));
  }
}
