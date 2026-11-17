// Bounded lazy file browser, adapted from Herdr 0.1.16 (Apache-2.0).
import { div } from "gpui-kit";
import type { AsyncContext, Context, Element } from "gpui-kit";
import { v_flex, Editor, EditorState } from "gpui-base";
import { exec, readTextFile, theme, settings, window } from "herdr";
import type { Theme } from "../appearance-model.js";
import { actionRow, secondary } from "../ui/controls.js";
import { surface, panelHeader, emptyState } from "../ui/surfaces.js";
import { pixelIcon, pixelButton } from "../pixel-ui.js";
import { SPACING, FILES } from "../ui/tokens.js";
import type { Location } from "./panel-location.js";
import { PanelLifecycle, LatestRequest } from "./panel-lifecycle.js";
import { repositoryTop, readGitStatus } from "../data/git.js";
import type { GitMark } from "../data/git-status.js";
import { gitMarkColor } from "../presentation/git.js";
import { joinPath, pathName } from "../data/paths.js";

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
  private marks: Record<string, GitMark> = {};
  private context: Location | undefined;
  private lifecycle: PanelLifecycle;
  private preview = new LatestRequest();
  private file: string | null = null;
  private code: EditorState | null = null;
  private fileError = "";
  private error = "";
  private limited = false;
  constructor(cx: AsyncContext) { this.lifecycle = new PanelLifecycle(cx, cx => this.refresh(cx)); this.refresh(cx); }
  close(): void { this.lifecycle.close(); this.preview.cancel(); this.code?.release(); this.code = null; }
  private current(context: Location): boolean { return this.lifecycle.current(context); }
  private async loadFolder(path: string, context: Location): Promise<void> {
    const entries = await directory(path ? joinPath(context.cwd!, path) : context.cwd!, context.on);
    if (!this.current(context) || (path && !this.folders.has(path))) return;
    const used = [...this.entries].filter(([p]) => p !== path).reduce((n, [, e]) => n + e.length, 0);
    this.entries.set(path, entries.slice(0, Math.max(0, Math.min(PER_FOLDER, TOTAL - used)))
      .sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name)));
    if (entries.length > PER_FOLDER || used + entries.length > TOTAL) this.limited = true;
  }
  private refresh(cx: Context): void {
    const next = this.lifecycle.sync();
    if (next !== this.context) {
      if (this.context) this.saved.set(this.context.key, { folders: this.folders, file: this.file });
      const saved = this.saved.get(next.key);
      this.context = next; this.entries = new Map(); this.folders = new Set(saved?.folders);
      this.pending = new Set(); this.marks = {}; this.show(null);
      this.error = ""; this.limited = false;
      if (saved?.file) this.show(saved.file, cx);
    }
    const context = this.context!;
    if (!context.cwd) return;
    const request = this.lifecycle.begin(context);
    if (!request) return;
    const cwd = context.cwd, on = context.on;
    this.limited = false;
    cx.spawn(async cx => {
      try {
        for (const path of ["", ...this.folders]) {
          if (!this.current(context)) return;
          await this.loadFolder(path, context);
        }
        const top = await repositoryTop(cwd, on).catch((): null => null);
        const marks: Record<string, GitMark> = {};
        if (top?.ok && this.current(context)) {
          const status = await readGitStatus(top.out, on, TOTAL).catch((): null => null);
          for (const file of status?.files ?? []) marks[joinPath(top.out, file.path)] = file.status;
        }
        if (!this.current(context)) return;
        this.marks = marks; this.error = ""; this.lifecycle.watch(cwd, context, cx);
      } catch (error) { if (this.current(context)) this.error = String(error); }
      finally { this.lifecycle.finish(request, cx); }
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
    const latest = this.preview.next();
    this.code?.release(); this.code = null; this.file = path; this.fileError = "";
    if (!path || !cx || !this.context) return;
    const context = this.context;
    cx.spawn(async cx => {
      try {
        const text = await readTextFile(joinPath(context.cwd!, path), { on: context.on });
        if (!latest() || !this.current(context)) return;
        if (text === null) { this.fileError = "This file is no longer available"; return; }
        if (text.includes("\0")) { this.fileError = "Binary file · no text preview"; return; }
        const t = theme(), ext = path.includes(".") ? path.split(".").pop()! : "txt", font = settings().font_family;
        this.code = EditorState.new({ language: LANG[ext] ?? ext, readonly: true,
          value: text.length > 400000 ? text.slice(0, 400000) + "\n… (file truncated)" : text,
          font_family: typeof font === "string" ? font : "Liberation Mono", font_size: 14,
          syntax: { keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6 } });
      } catch { if (latest() && this.current(context)) this.fileError = "Cannot preview this file (binary, too large, or unreadable)"; }
      finally { cx.notify(); }
    });
  }
  private rows(prefix: string, depth: number, out: Element[], t: Theme): Element[] {
    if (out.length >= TOTAL || depth > 40) return out;
    for (const entry of this.entries.get(prefix) ?? []) {
      if (out.length >= TOTAL) break;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name, open = this.folders.has(path), mark = this.marks[joinPath(this.context?.cwd ?? "", path)];
      out.push(actionRow(t, `file-${path}`, entry.name, cx => entry.dir ? this.toggle(path, cx) : this.show(path, cx))
        .h(FILES.row).pl(SPACING.row.inset + depth * FILES.indent)
        .child(entry.dir ? pixelIcon(open ? "down" : "right", t.dim, 12) : div().w(12).flex_none())
        .child(pixelIcon("file", t.muted)).child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(entry.name))
        .when(Boolean(mark), el => el.child(secondary(t, mark).text_color(gitMarkColor(t, mark)))));
      if (entry.dir && open) this.rows(path, depth + 1, out, t);
    }
    return out;
  }
  render(cx?: Context): Element {
    if (cx && (!this.context || !this.current(this.context))) this.refresh(cx);
    const t = theme() as Theme;
    return surface(t, "panel").id("files").size_full().overflow_hidden()
      .child(panelHeader(t, "Files", this.file ? pixelButton(t, "files-back", "sidebar", "Back to files", cx => { this.show(null); cx.notify(); }, { quiet: true }) : undefined)
        .child(secondary(t, this.file ?? (this.context?.cwd ? pathName(this.context.cwd) : "")).flex_1().min_w(0).truncate().text_right()))
      .when(!this.file, el => el.child(v_flex().id("files-tree").flex_1().min_h(0).overflow_y_scrollbar()
        .px(SPACING.panel.listInset).py(SPACING.panel.listInsetY).children(this.rows("", 0, [], t))
        .when(Boolean(this.error) || !this.entries.get("")?.length, el => el.child(emptyState(t, this.error || (this.lifecycle.loading ? "Loading files…" : this.context?.cwd ? "No files" : "No folder"))))
        .when(this.limited, el => el.child(secondary(t, "Limited to 500 entries per folder and 5,000 total").p(SPACING.panel.inset)))))
      .when(Boolean(this.file), el => el.child(this.code ? Editor.new(this.code).flex_1().min_h(0) : secondary(t, this.fileError || "Loading file…").p(SPACING.panel.inset)));
  }
}
