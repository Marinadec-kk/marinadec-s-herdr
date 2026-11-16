// Bounded lazy file browser, adapted from Herdr 0.1.16 (Apache-2.0).
import { div } from "gpui-kit";
import type { AsyncContext, Context, Element } from "gpui-kit";
import { v_flex, h_flex, Editor, EditorState } from "gpui-base";
import { exec, readTextFile, watchFolder, theme, settings, window } from "herdr";
import type { Theme } from "../appearance-model.js";
import { actionRow, secondary } from "../ui/controls.js";
import { surface } from "../ui/surfaces.js";
import { pixelIcon, pixelButton } from "../pixel-ui.js";
import { panelLocation } from "./panel-location.js";
import type { Location } from "./panel-location.js";
import { UI } from "../ui/tokens.js";

interface Entry { name: string; dir: boolean }
const LANG: Record<string, string> = { ts: "js", tsx: "js", mts: "js", cts: "js", jsx: "js", mjs: "js", toml: "yaml", jsonc: "json", svelte: "html", vue: "html" };
const PER_FOLDER = 500, TOTAL = 5000;
async function directory(path: string, on: string | null): Promise<Entry[]> {
  const windowsDirectory = async (): Promise<Entry[]> => {
    // LiteralPath, UTF-8 and reparse-point handling preserve Windows/Unicode paths.
    const r = await exec("powershell", ["-NoProfile", "-Command", "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); & { param($p) @(Get-ChildItem -LiteralPath $p -Force -ErrorAction Stop | Where-Object Name -ne '.git' | Select-Object -First 501 | ForEach-Object { @{ name=$_.Name; dir=($_.PSIsContainer -and (-not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -or -not $_.LinkType -or ($_.Target -and [IO.Directory]::Exists(([IO.Path]::Combine([IO.Path]::GetDirectoryName($_.FullName), $_.Target[0])))))) } }) | ConvertTo-Json -Compress } '" + path.replace(/['‘’‚‛]/g, "$&$&") + "'"], { on });
    if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
    const result = JSON.parse(r.stdout || "[]");
    return Array.isArray(result) ? result : [result];
  };
  if (!on && window()?.platform === "windows") return windowsDirectory();
  const script = 'n=0; for p in "$1"/* "$1"/.[!.]* "$1"/..?*; do [ -e "$p" ] || [ -L "$p" ] || continue; name=${p##*/}; [ "$name" = .git ] && continue; if [ -d "$p" ]; then kind=d; else kind=f; fi; printf "%s\\0%s\\0" "$kind" "$name"; n=$((n+1)); [ "$n" -gt 500 ] && break; done; test -d "$1"';
  let r;
  try { r = await exec("sh", ["-c", script, "files", path], { on }); }
  catch (error) {
    if (on && String(error).includes("cannot start sh: program not found")) return windowsDirectory();
    throw error;
  }
  if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
  const fields = r.stdout.split("\0"), out: Entry[] = [];
  for (let i = 0; i + 1 < fields.length; i += 2) out.push({ name: fields[i + 1], dir: fields[i] === "d" });
  return out;
}

export class Files {
  private saved = new Map<string, { folders: Set<string>; file: string | null }>();
  private entries = new Map<string, Entry[]>();
  private folders = new Set<string>();
  private pending = new Set<string>();
  private marks: Record<string, string> = {};
  private context: Location | undefined;
  private watched: string | null = null;
  private file: string | null = null;
  private code: EditorState | null = null;
  private fileError = "";
  private error = "";
  private limited = false;
  private loading = false;
  constructor(cx: AsyncContext) { this.refresh(cx); cx.timer.every(10000, cx => this.refresh(cx)); }
  close(): void { this.code?.release(); this.code = null; this.watched = null; }
  private current(context: Location): boolean { return this.context === context && panelLocation().key === context.key; }
  private watch(root: string, context: Location, cx: Context): void {
    if (context.on || this.watched === root) return;
    this.watched = root;
    cx.spawn(async cx => {
      try { while (this.current(context) && this.watched === root) { await watchFolder(root); if (this.current(context)) this.refresh(cx); } }
      catch { if (this.context === context) this.watched = null; }
    });
  }
  private async loadFolder(path: string, context: Location): Promise<void> {
    const entries = await directory(path ? `${context.cwd}/${path}` : context.cwd!, context.on);
    if (!this.current(context) || (path && !this.folders.has(path))) return;
    const used = [...this.entries].filter(([p]) => p !== path).reduce((n, [, e]) => n + e.length, 0);
    this.entries.set(path, entries.slice(0, Math.max(0, Math.min(PER_FOLDER, TOTAL - used)))
      .sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name)));
    if (entries.length > PER_FOLDER || used + entries.length > TOTAL) this.limited = true;
  }
  private refresh(cx: Context): void {
    const next = panelLocation();
    if (next.key !== this.context?.key) {
      if (this.context) this.saved.set(this.context.key, { folders: this.folders, file: this.file });
      const saved = this.saved.get(next.key);
      this.context = next; this.entries = new Map(); this.folders = new Set(saved?.folders);
      this.pending = new Set(); this.marks = {}; this.show(null); this.watched = null;
      this.error = ""; this.limited = false; this.loading = false;
      if (saved?.file) this.show(saved.file, cx);
    }
    const context = this.context!;
    if (!context.cwd || this.loading) return;
    const cwd = context.cwd, on = context.on;
    this.loading = true; this.limited = false;
    cx.spawn(async cx => {
      try {
        for (const path of ["", ...this.folders]) {
          if (!this.current(context)) return;
          await this.loadFolder(path, context);
        }
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on }).catch((): null => null);
        const marks: Record<string, string> = {};
        if (top?.code === 0) {
          const status = await exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"], { cwd, on }).catch((): null => null);
          if (status?.code === 0) for (const entry of status.stdout.split("\0").filter(Boolean).slice(0, TOTAL)) {
            const xy = entry.slice(0, 2);
            marks[`${top.stdout.trim()}/${entry.slice(3)}`] = xy === "??" || xy.includes("A") ? "A" : xy.includes("U") ? "U" : xy.includes("D") ? "D" : "M";
          }
        }
        if (!this.current(context)) return;
        this.marks = marks; this.error = ""; this.watch(cwd, context, cx);
      } catch (error) { if (this.current(context)) this.error = String(error); }
      finally { if (this.context === context) this.loading = false; cx.notify(); }
    });
  }
  private toggle(path: string, cx: Context): void {
    if (this.folders.has(path)) {
      for (const folder of [...this.folders]) if (folder === path || folder.startsWith(path + "/")) {
        this.folders.delete(folder); this.entries.delete(folder);
      }
    } else {
      this.folders.add(path);
      if (!this.entries.has(path) && !this.pending.has(path)) {
        const context = this.context!;
        this.pending.add(path);
        cx.spawn(async cx => {
          try { await this.loadFolder(path, context); }
          catch (error) { if (this.current(context)) this.error = String(error); }
          finally { if (this.context === context) this.pending.delete(path); cx.notify(); }
        });
      }
    }
    cx.notify();
  }
  private show(path: string | null, cx?: Context): void {
    this.code?.release(); this.code = null; this.file = path; this.fileError = "";
    if (!path || !cx || !this.context) return;
    const context = this.context;
    cx.spawn(async cx => {
      try {
        const text = await readTextFile(`${context.cwd}/${path}`, { on: context.on });
        if (this.file !== path || !this.current(context)) return;
        if (text === null) { this.fileError = "This file is no longer available"; return; }
        if (text.includes("\0")) { this.fileError = "Binary file · no text preview"; return; }
        const t = theme(), ext = path.includes(".") ? path.split(".").pop()! : "txt", font = settings().font_family;
        this.code = EditorState.new({ language: LANG[ext] ?? ext, readonly: true,
          value: text.length > 400000 ? text.slice(0, 400000) + "\n… (file truncated)" : text,
          font_family: typeof font === "string" ? font : "Liberation Mono", font_size: 14,
          syntax: { keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6 } });
      } catch { if (this.file === path && this.current(context)) this.fileError = "Cannot preview this file (binary, too large, or unreadable)"; }
      finally { cx.notify(); }
    });
  }
  private rows(prefix: string, depth: number, out: Element[], t: Theme): Element[] {
    if (out.length >= TOTAL || depth > 40) return out;
    for (const entry of this.entries.get(prefix) ?? []) {
      if (out.length >= TOTAL) break;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name, open = this.folders.has(path), mark = this.marks[`${this.context?.cwd}/${path}`];
      out.push(actionRow(t, `file-${path}`, entry.name, cx => entry.dir ? this.toggle(path, cx) : this.show(path, cx))
        .h(28).pl(8 + depth * 18)
        .child(entry.dir ? pixelIcon(open ? "down" : "right", t.dim, 12) : div().w(12).flex_none())
        .child(pixelIcon("file", t.muted)).child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(entry.name))
        .when(Boolean(mark), el => el.child(secondary(t, mark).text_color(mark === "A" ? t.ansi2 : mark === "D" || mark === "U" ? t.ansi1 : t.blocked))));
      if (entry.dir && open) this.rows(path, depth + 1, out, t);
    }
    return out;
  }
  render(cx?: Context): Element {
    if (cx && panelLocation().key !== this.context?.key) this.refresh(cx);
    const t = theme() as Theme;
    return surface(t, "panel").id("files").size_full().overflow_hidden()
      .child(h_flex().h(42).flex_none().px(12).gap(8).items_center().border_b(UI.stroke).border_color(t.border)
        .when(Boolean(this.file), el => el.child(pixelButton(t, "files-back", "sidebar", "Back to files", cx => { this.show(null); cx.notify(); }, { quiet: true })))
        .child(div().font_semibold().child("Files"))
        .child(secondary(t, this.file ?? this.context?.cwd?.split(/[\\/]/).pop() ?? "").flex_1().min_w(0).truncate().text_right()))
      .when(!this.file, el => el.child(v_flex().id("files-tree").flex_1().min_h(0).overflow_y_scrollbar().p(6).children(this.rows("", 0, [], t))
        .when(Boolean(this.error) || !this.entries.get("")?.length, el => el.child(secondary(t, this.error || (this.loading ? "Loading files…" : this.context?.cwd ? "No files" : "No folder")).p(8)))
        .when(this.limited, el => el.child(secondary(t, "Limited to 500 entries per folder and 5,000 total").p(8)))))
      .when(Boolean(this.file), el => el.child(this.code ? Editor.new(this.code).flex_1().min_h(0) : secondary(t, this.fileError || "Loading file…").p(12)));
  }
}
