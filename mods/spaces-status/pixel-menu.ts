// Pixel versions of the tab/new menus; core commands still own confirmations.
import { div } from "gpui-kit";
import type { AsyncContext, Context, Element } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { closeOverlay, keys, knownAgents, openOverlay, panes, props, run, setShared, shared, spaces, theme } from "herdr";
import { PIXEL_FONT, record } from "./appearance-model.js";
import type { Theme } from "./appearance-model.js";
import { pixelIcon, programIcon } from "./pixel-ui.js";
import type { PixelGlyph } from "./pixel-ui.js";
import type { ChromeView } from "./pixel-chrome.js";

type KnownAgent = Awaited<ReturnType<typeof knownAgents>>[number];
interface MenuItem { id: string; label: string; glyph: PixelGlyph; action: () => void; hint?: string; enabled?: boolean; agent?: KnownAgent }
const KNOWN = "new-menu.agents";

export function createPixelMenu(raw: unknown, cx: AsyncContext): ChromeView | null {
  const data = { ...record(raw), ...record(props()) }, tab = record(data.chromeMenu);
  if (typeof tab.id === "string" || data.newMenu === true) return new PixelMenu(data, cx);
  return null;
}

class PixelMenu implements ChromeView {
  private handle: ReturnType<Context["focus_handle"]>;
  private at = 0;
  private agents: KnownAgent[] = [];
  private failed = false;
  private overlay: string;
  constructor(private data: Record<string, unknown>, cx: AsyncContext) {
    this.overlay = typeof data.overlay === "string" ? data.overlay : "";
    this.handle = cx.focus_handle();
    this.handle.focus();
    if (data.newMenu !== true) return;
    const machine = spaces().find(s => s.active)?.machine ?? null, where = machine ?? "";
    const cached: unknown = record(shared(KNOWN))[where];
    if (Array.isArray(cached)) this.agents = cached.filter((a): a is KnownAgent => {
      const item = record(a);
      return typeof item.key === "string" && typeof item.name === "string" && Array.isArray(item.run)
        && item.run.every(v => typeof v === "string") && typeof item.installed === "boolean";
    });
    cx.spawn(async cx => {
      try {
        this.agents = await knownAgents({ on: machine });
        setShared(KNOWN, { ...record(shared(KNOWN)), [where]: this.agents });
      } catch { this.failed = true; }
      cx.notify();
    });
  }

  private items(): MenuItem[] {
    const tab = record(this.data.chromeMenu);
    if (typeof tab.id === "string") {
      const id = tab.id, space = typeof tab.space === "string" ? tab.space : undefined;
      return [
        { id: "rename", label: "Rename tab", glyph: "file", action: () => run("tab.rename", { id }) },
        { id: "new", label: "New tab", glyph: "plus", action: () => run("tab.new", { space }) },
        { id: "close", label: "Close tab", glyph: "close", action: () => run("tab.close", { id }) },
      ];
    }
    const space = spaces().find(s => s.active), installed = this.agents.filter(a => a.installed);
    const choices = this.failed ? installed : [...installed, ...this.agents.filter(a => !a.installed).slice(0, 2)];
    const shortcut = (command: string) => keys().find(k => k.section === "global" && k.action === command)?.keys;
    const worktree = (action: "new" | "open") => openOverlay({
      mod: "worktree", kind: "dialog", width: action === "open" ? 560 : 460, height: action === "open" ? 480 : 280,
      props: { space: space?.id, folder: panes().find(p => p.focused)?.cwd, action },
    });
    return [
      { id: "terminal", label: "Terminal", glyph: "terminal", action: () => run("tab.new", { space: space?.id }), hint: shortcut("tab.new") },
      ...choices.map((agent, index): MenuItem => ({
        id: agent.key, label: agent.name, glyph: "terminal", agent,
        action: () => run("tab.new", { name: agent.name, space: space?.id, argv: agent.run }),
        enabled: agent.installed, hint: agent.installed ? (index < 9 ? String(index + 1) : "") : "not installed",
      })),
      { id: "space", label: "New space", glyph: "plus", action: () => run("space.new"), hint: shortcut("space.new") },
      { id: "worktree", label: "New worktree…", glyph: "branch", action: () => worktree("new"), enabled: Boolean(space) },
      { id: "worktree-open", label: "Open worktree…", glyph: "branch", action: () => worktree("open"), enabled: Boolean(space) },
    ];
  }

  private choose(item: MenuItem | undefined): void {
    if (!item || item.enabled === false) return;
    closeOverlay(this.overlay);
    item.action();
  }

  render(): Element {
    const t = theme() as Theme, items = this.items(), enabled = items.filter(i => i.enabled !== false);
    this.at = Math.min(this.at, Math.max(0, enabled.length - 1));
    return v_flex().id("pixel-menu").track_focus(this.handle).w_full().min_h(0).max_h(500).p(5).gap(2)
      .font_family(PIXEL_FONT).text_size(16).bg(t.popover).border(2).border_color(t.border)
      .on_key_down((event, cx) => {
        if (event.key === "escape") closeOverlay(this.overlay);
        else if (event.key === "down") this.at = (this.at + 1) % enabled.length;
        else if (event.key === "up") this.at = (this.at + enabled.length - 1) % enabled.length;
        else if (event.key === "enter") this.choose(enabled[this.at]);
        else if (this.data.newMenu === true && /^[1-9]$/.test(event.key)
          && !event.modifiers.control && !event.modifiers.platform && !event.modifiers.alt) {
          this.choose(items.find(i => i.agent?.installed && i.hint === event.key));
        } else return;
        cx.stop_propagation(); cx.notify();
      })
      .when(this.data.newMenu === true, el => el.child(div().px(8).py(5).text_size(14).text_color(t.dim).child("NEW TERMINAL / AGENT")))
      .child(v_flex().min_h(0).overflow_y_scrollbar().children(items.map(item => {
        const agent = item.agent;
        const pic = programIcon(agent, 14, t.muted) ?? pixelIcon(item.glyph, t.muted);
        return h_flex().id(`pixel-menu-${item.id}`).h(32).flex_none().px(8).gap(10).items_center()
          .text_color(item.enabled === false ? t.dim : t.foreground)
          .when(item === enabled[this.at], el => el.bg(t.selected))
          .when(item.enabled !== false, el => el.cursor_pointer().hover(el => el.bg(t.hover)))
          .on_click(() => this.choose(item)).child(pic)
          .child(div().flex_1().child(item.label))
          .child(div().text_size(12).text_color(t.dim).child(item.hint ?? ""));
      })))
      .when(this.data.newMenu === true && (this.failed || !this.agents.length), el => el.child(
        div().px(8).py(5).text_size(14).text_color(t.dim)
          .child(this.failed ? "Could not check installed agents" : "Checking installed agents…")));
  }
}
