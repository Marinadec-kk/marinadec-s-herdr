// Tab/new menus share controls, overlay routes and captured action targets.
import { div } from "gpui-kit";
import type { AsyncContext, Element } from "gpui-kit";
import { closeOverlay, keys, knownAgents, run, setShared, shared, spaces, theme } from "herdr";
import { record } from "./appearance-model.js";
import type { Theme } from "./appearance-model.js";
import { pixelIcon, programIcon } from "./pixel-ui.js";
import type { PixelGlyph } from "./pixel-ui.js";
import type { ChromeView } from "./pixel-chrome.js";
import { Menu } from "./ui/menu.js";
import { TAB_MENU } from "./presentation/menus.js";
import { openWorktree, openTabRename, closeTab, overlayProps, newSpaceInHome } from "./overlays.js";
import { SPACING } from "./ui/tokens.js";

type KnownAgent = Awaited<ReturnType<typeof knownAgents>>[number];
interface MenuItem { id: string; label: string; glyph: PixelGlyph; action: () => void; hint?: string; enabled?: boolean; agent?: KnownAgent }
const KNOWN = "new-menu.agents";

export function createPixelMenu(raw: unknown, cx: AsyncContext): ChromeView | null {
  const data = overlayProps(raw), tab = record(data.chromeMenu);
  if (typeof tab.id === "string" || data.newMenu === true) return new PixelMenu(data, cx);
  return null;
}

class PixelMenu implements ChromeView {
  private menu: Menu;
  private space: string | undefined;
  private agents: KnownAgent[] = [];
  private failed = false;
  private overlay: string;
  constructor(private data: Record<string, unknown>, cx: AsyncContext) {
    this.overlay = typeof data.overlay === "string" ? data.overlay : "";
    this.menu = new Menu(cx, () => closeOverlay(this.overlay));
    if (data.newMenu !== true) return;
    const target = spaces().find(s => s.active);
    this.space = target?.id;
    const machine = target?.machine ?? null, where = machine ?? "";
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
      return TAB_MENU.map(item => ({ ...item, action: () => {
        if (item.id === "rename") openTabRename(id);
        else if (item.id === "new") run("tab.new", { space });
        else closeTab(id);
      } }));
    }
    const space = spaces().find(s => s.id === this.space), installed = this.agents.filter(a => a.installed);
    const choices = this.failed ? installed : [...installed, ...this.agents.filter(a => !a.installed).slice(0, 2)];
    const shortcut = (command: string) => keys().find(k => k.section === "global" && k.action === command)?.keys;
    const worktree = (action: "new" | "open") => { if (space) openWorktree(space.id, action); };
    return [
      { id: "terminal", label: "Terminal", glyph: "terminal", action: () => run("tab.new", { space: space?.id }), hint: shortcut("tab.new") },
      ...choices.map((agent, index): MenuItem => ({
        id: agent.key, label: agent.name, glyph: "terminal", agent,
        action: () => { if (space) run("tab.new", { space: space.id, argv: agent.run }); },
        enabled: agent.installed && Boolean(space), hint: agent.installed ? (index < 9 ? String(index + 1) : "") : "not installed",
      })),
      { id: "space", label: "New space", glyph: "plus", action: () => newSpaceInHome(space?.machine ?? null), hint: shortcut("space.new") },
      { id: "worktree", label: "New worktree…", glyph: "branch", action: () => worktree("new"), enabled: Boolean(space) },
      { id: "worktree-open", label: "Open worktree…", glyph: "branch", action: () => worktree("open"), enabled: Boolean(space) },
    ];
  }

  render(): Element {
    const t = theme() as Theme;
    return this.menu.render(t, "pixel-menu", this.items().map(item => ({
      ...item, id: `pixel-menu-${item.id}`,
      icon: programIcon(item.agent, 14, t.muted) ?? pixelIcon(item.glyph, t.muted),
      hotkey: item.agent?.installed ? item.hint : undefined,
    })))
      .when(this.data.newMenu === true && (this.failed || !this.agents.length), el => el.child(
        div().p(SPACING.menu.inset).text_size(14).text_color(t.dim)
          .child(this.failed ? "Could not check installed agents" : "Checking installed agents…")));
  }
}
