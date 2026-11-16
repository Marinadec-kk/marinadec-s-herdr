// Owned pixel chrome, adapted from Herdr 0.1.15's Apache-2.0 workspace mods.
// Keep behavior (wheel/drag, per-space panels, traffic lights, pane targets).
import { div } from "gpui-kit";
import type { Element, ScrollWheelEvent } from "gpui-kit";
import { h_flex, ScrollHandle } from "gpui-base";
import {
  agents, home, keys, layout, panes, props, run, settings, theme,
  setShared, shared, spaces, updates, window,
} from "herdr";
import type { SpaceInfo } from "herdr";
import { record } from "./appearance-model.js";
import type { Theme } from "./appearance-model.js";
import { pixelButton, pixelIcon, pixelStatus, programIcon } from "./pixel-ui.js";
import type { PixelGlyph } from "./pixel-ui.js";
import { actionRow, button } from "./ui/controls.js";
import { surface } from "./ui/surfaces.js";
import { UI, menuHeight } from "./ui/tokens.js";
import { machineLabel, shortPath, tabLabel } from "./presentation/labels.js";
import { statusCounts } from "./presentation/status.js";
import { openSurface, openPicker, openTabRename, closeTab, openMachineAdd } from "./overlays.js";
export { tabLabel } from "./presentation/labels.js";

export interface LayoutNode {
  id?: string;
  type?: string;
  hidden?: boolean;
  active?: string;
  size?: { px?: number };
  children?: LayoutNode[];
  traffic_lights?: number[];
  content?: { tab?: string; pane?: { header?: { position?: string } } };
}
type Role = "brand" | "footer" | "tabs" | "pane" | "status";
export interface ChromeView { render(): Element }

export function createPixelChrome(raw: unknown): ChromeView | null {
  const role = record({ ...record(raw), ...record(props()) }).chrome;
  if (role === "tabs") return new PixelTabs();
  if (role === "pane") return new PixelPane();
  if (role === "brand" || role === "footer" || role === "status") return new PixelBars(role);
  return null;
}

export function findNode(node: LayoutNode | null | undefined, id: string): LayoutNode | undefined {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return undefined;
}

function paneFrame(node: LayoutNode | undefined): LayoutNode["content"] {
  if (!node || node.hidden) return undefined;
  if (node.content?.tab && node.content.pane) return node.content;
  let children = node.children ?? [];
  if (node.type === "stack") {
    const visible = children.filter(child => !child.hidden);
    const active = visible.find(child => child.id === node.active) ?? visible[0];
    children = active ? [active] : [];
  }
  for (const child of children) {
    const frame = paneFrame(child);
    if (frame) return frame;
  }
  return undefined;
}

function rootBar(t: Theme): Element {
  return surface(t, "bar").size_full().text_color(t.muted);
}

class PixelTabs implements ChromeView {
  private pressed: string | null = null;
  private scroll = ScrollHandle.new();
  private selected: string | undefined;
  private selectedIndex = -1;
  private space: string | undefined;
  private panels: Record<string, string | null> = {};
  private pending: { want: string | null; until: number } | null = null;
  private swipe = { acc: 0, steps: 0, at: 0, last: 0 };

  constructor() {
    try {
      const saved = record(JSON.parse(localStorage.getItem("panels") ?? "{}"));
      this.panels = Object.fromEntries(Object.entries(saved).filter((e): e is [string, string | null] =>
        e[1] === null || typeof e[1] === "string"));
    } catch { /* Malformed preferences do not disable tab navigation. */ }
  }

  wheel(event: ScrollWheelEvent): void {
    if (event.delta_lines) {
      if (event.delta_lines.y) run(event.delta_lines.y > 0 ? "tab.prev" : "tab.next");
      return;
    }
    const swipe = this.swipe, now = Date.now();
    if (event.touch_phase === "started" || now - swipe.at > 250 || event.delta.y * swipe.acc < 0)
      Object.assign(swipe, { acc: 0, steps: 0 });
    swipe.at = now;
    swipe.acc += event.delta.y;
    const need = swipe.steps ? 60 : 20;
    if (Math.abs(swipe.acc) < need || now - swipe.last < 100) return;
    swipe.acc -= Math.sign(swipe.acc) * need;
    swipe.steps++;
    swipe.last = now;
    run(event.delta.y > 0 ? "tab.prev" : "tab.next");
  }

  private syncPanel(space: SpaceInfo | undefined, panel: LayoutNode | undefined, body: LayoutNode | undefined, enabled: string[]): void {
    if (!space || !panel) return;
    const now = panel.hidden ? null : body?.active ?? null;
    if (space.id !== this.space) {
      const first = this.space === undefined;
      this.space = space.id;
      this.pending = null;
      if (!(first && !(space.id in this.panels))) {
        const stored = this.panels[space.id] ?? null;
        const want = stored && enabled.includes(stored) ? stored : null;
        if (want !== now) {
          this.pending = { want, until: Date.now() + 1000 };
          if (want) {
            run("layout.select", { stack: "panel-body", child: want });
            run("layout.show", { id: "panel" });
          } else run("layout.hide", { id: "panel" });
          return;
        }
      }
    }
    if (this.pending) {
      if (this.pending.want !== now && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (this.panels[space.id] === now) return;
    this.panels[space.id] = now;
    localStorage.setItem("panels", JSON.stringify(this.panels));
  }

  render(): Element {
    const t = theme() as Theme, root = layout() as LayoutNode;
    const space = spaces().find(s => s.active), allPanes = panes(), shown = space?.tabs ?? [];
    const active = shown.findIndex(tab => tab.active), selected = shown[active]?.id;
    if (selected !== this.selected || active !== this.selectedIndex) {
      this.selected = selected; this.selectedIndex = active;
      if (active >= 0) this.scroll.scroll_to_item(active);
    }
    const w = window(), sidebar = findNode(root, "sidebar"), zoom = settings().zoom;
    const scale = typeof zoom === "number" && zoom > 0 ? zoom : 1;
    const lightsPadding = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      ? Math.max(10, (root.traffic_lights[0] + 64) / scale - (sidebar?.hidden ? 0 : sidebar?.size?.px ?? 0)) : 10;
    const panel = findNode(root, "panel"), body = findNode(root, "panel-body");
    const stored: unknown = shared("workspace.panels");
    const enabled = Array.isArray(stored) ? stored.filter((v): v is string => typeof v === "string") : ["files", "changes"];
    this.syncPanel(space, panel, body, enabled);
    const panelButton = (id: string, label: string, glyph: PixelGlyph) => {
      const on = panel && !panel.hidden && body?.active === id;
      return button(t, `panel-${id}`, label, () => {
          if (on) run("layout.hide", { id: "panel" });
          else {
            run("layout.select", { stack: "panel-body", child: id });
            run("layout.show", { id: "panel" });
          }
        }, { selected: Boolean(on) }).child(pixelIcon(glyph, on ? t.foreground : t.muted));
    };
    return rootBar(t).px(10).pl(lightsPadding).gap(6).border_b(UI.stroke).border_color(t.border)
      .on_mouse_up("left", () => { this.pressed = null; })
      .on_scroll_wheel(event => this.wheel(event))
      .child(h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_center().gap(4)
        .overflow_x_scrollbar().track_scroll(this.scroll)
        .on_size_change((_size, cx) => { if (active >= 0) { this.scroll.scroll_to_item(active); cx.notify(); } })
        .children(shown.map((tab, index) => {
          const lead = allPanes.find(p => p.tab === tab.id && p.program?.agent) ?? allPanes.find(p => p.tab === tab.id);
          const pic = programIcon(lead?.program, UI.programIcon, t.muted), label = tabLabel(tab, lead);
          const status = pixelStatus(t, tab.status);
          return h_flex().id(`tab-${tab.id}`).h(30).px(10).gap(7).items_center().flex_none()
            .border(UI.stroke).border_color(tab.active ? t.accent : t.border).bg(tab.active ? t.raised : t.chrome)
            .text_color(tab.active ? t.foreground : t.muted).hover(el => el.bg(t.hover))
            .when(index <= active, el => el.on_size_change((_size, cx) => { this.scroll.scroll_to_item(active); cx.notify(); }))
            .on_mouse_down("left", (event, cx) => {
              cx.stop_propagation(); this.pressed = tab.id;
              if (event.click_count === 2) openTabRename(tab.id);
            })
            .on_mouse_up("left", (_event, cx) => {
              cx.stop_propagation();
              const from = this.pressed; this.pressed = null;
              // A removed tab during a drag is not a new target.
              if (from && from !== tab.id && shown.some(s => s.id === from)) run("tab.move", { id: from, index: index + 1 });
              else if (from === tab.id) run("tab.select", { id: tab.id });
            })
            .on_mouse_down("right", (_event, cx) => {
              cx.stop_propagation();
              openSurface({ chromeMenu: { id: tab.id, space: space?.id } }, { kind: "popup", width: 250, height: menuHeight(3) });
            })
            .children(pic ? [pic] : [])
            .child(div().max_w(240).truncate().tooltip(label).child(`${label}${tab.zoomed ? " [Z]" : ""}`))
            .children(status ? [status] : [])
            .when(tab.active, el => el.child(pixelButton(t, `close-${tab.id}`, "close", "Close tab", () => closeTab(tab.id), { quiet: true })));
        })))
      .child(pixelButton(t, "tab-new", "plus", "New terminal or agent", () => openSurface({ newMenu: true }, { kind: "popup", width: 280 })))
      .when(enabled.includes("files"), el => el.child(panelButton("files", "Files", "file")))
      .when(enabled.includes("changes"), el => el.child(panelButton("changes", "Changes", "branch")))
      .when(Boolean(w?.buttons), el => el
        .child(pixelButton(t, "minimize", "minimize", "Minimize window", () => run("window.minimize")))
        .child(pixelButton(t, "maximize", "zoom", w?.maximized ? "Restore window" : "Maximize window", () => run("window.maximize")))
        .child(pixelButton(t, "close-window", "close", "Close window", () => run("window.close"))));
  }
}

class PixelPane implements ChromeView {
  private hovered = false;
  render(): Element {
    const t = theme() as Theme;
    const target = record(props()).pane, p = panes().find(p => p.pane === target);
    if (!p) return div();
    const name = ((p.program?.agent || p.program?.shell) && p.program.name) || p.title || p.program?.name || "shell";
    const pic = programIcon(p.program, UI.programIcon, t.muted), status = pixelStatus(t, p.status), pane = p.pane, cwd = p.cwd ?? "";
    const remote = spaces().find(s => s.tabs.some(tab => tab.id === p.tab))?.machine;
    const folder = remote ? cwd : shortPath(cwd, home());
    const bottom = paneFrame(layout() as LayoutNode)?.pane?.header?.position === "bottom";
    return rootBar(t).id(`pane-head-${pane}`).px(10).gap(8).bg(t.background)
      .when(bottom, el => el.border_t(UI.stroke)).when(!bottom, el => el.border_b(UI.stroke))
      .border_color(p.focused ? t.accent : t.border)
      .on_hover((hovered, cx) => { this.hovered = hovered; cx.notify(); })
      .on_click(() => run("pane.focus", { pane }))
      .children(pic ? [div().flex_none().tooltip(name).child(pic)] : [])
      .when(!pic, el => el.child(div().flex_none().max_w(260).truncate().text_color(t.foreground).child(name)))
      .child(div().flex_1().min_w(0).truncate().text_color(t.dim).tooltip(cwd).child(folder))
      .children(status ? [status] : [])
      .child(h_flex().flex_none().gap(4).when(!this.hovered, el => el.invisible())
        .child(pixelButton(t, `ph-r-${pane}`, "split", "Split right", () => run("pane.split", { direction: "right", pane })))
        .child(pixelButton(t, `ph-d-${pane}`, "splitDown", "Split down", () => run("pane.split", { direction: "down", pane })))
        .child(pixelButton(t, `ph-z-${pane}`, "zoom", p.zoomed ? "Unzoom pane" : "Zoom pane", () => run("pane.zoom", { pane })))
        .child(pixelButton(t, `ph-x-${pane}`, "close", "Close pane", () => run("pane.close", { pane }))));
  }
}

class PixelBars implements ChromeView {
  constructor(private role: Extract<Role, "brand" | "footer" | "status">) {}
  render(): Element {
    const t = theme() as Theme;
    if (this.role === "status") return this.status(t);
    const root = layout() as LayoutNode, width = findNode(root, "sidebar")?.size?.px ?? UI.sidebar;
    const collapsed = width < UI.railBelow, w = window();
    if (this.role === "footer") {
      const row = (id: string, glyph: PixelGlyph, label: string, action: () => void) =>
        actionRow(t, id, label, action).h(28)
          .when(collapsed, el => el.relative().w(32).px(0).justify_center().tooltip(label))
          .child(pixelIcon(glyph, t.muted)).when(!collapsed, el => el.child(label));
      const ready = div().size(6).bg(t.accent);
      return surface(t, "bar").flex_col().items_stretch().size_full()
        .border_t(UI.stroke).border_color(t.border).px(8).pt(4).pb(8).when(collapsed, el => el.px(0).items_center())
        .child(row("settings", "settings", "Settings", () => run("app.settings"))
          .when(Boolean(updates().app.ready), el => el.child(collapsed ? ready.absolute().top(5).right(6) : ready)))
        .child(row("machine", "plus", "Add machine", openMachineAdd));
    }
    return rootBar(t).pl(collapsed ? 0 : 12).pr(collapsed ? 0 : 10).gap(6).border_b(UI.stroke).border_color(t.border)
      .when(collapsed, el => el.justify_center())
      .when(w?.platform === "macos" && !w.fullscreen && !collapsed, el => el.pl(76))
      .when(!collapsed, el => el.child(h_flex().flex_1().gap(8).items_center()
        .child(div().text_size(16).font_semibold().text_color(t.foreground).child("HERDR"))))
      .when(!collapsed, el => el.child(pixelButton(t, "space-new", "plus", "New space", () => run("space.new")))
        .child(pixelButton(t, "search", "search", "Find a space or terminal", openPicker)))
      .when(!(collapsed && w?.platform === "macos"), el => el.child(pixelButton(t, "sidebar-toggle", "sidebar", collapsed ? "Expand sidebar" : "Collapse sidebar", () => {
        if (!collapsed) setShared("sidebar.width", width);
        setShared("sidebar.collapsed", !collapsed);
        const saved: unknown = shared("sidebar.width");
        const previous = typeof saved === "number" && saved >= UI.railBelow ? saved : UI.sidebar;
        run("layout.resize", { id: "sidebar", px: collapsed ? previous : w?.platform === "macos" ? 76 : 44 });
      })));
  }

  private status(t: Theme): Element {
    const space = spaces().find(s => s.active), list = agents();
    const counts = statusCounts(list), mac = window()?.platform === "macos";
    const aliases: Record<string, string> = { cmd: mac ? "⌘" : "Super+", ctrl: mac ? "⌃" : "Ctrl+", shift: mac ? "⇧" : "Shift+", alt: mac ? "⌥" : "Alt+" };
    const binding = keys().find(k => k.section === "global" && k.action === "app.palette");
    const parts = binding?.keys.endsWith("--") ? [...binding.keys.slice(0, -2).split("-"), "-"] : binding?.keys.split("-");
    const hint = parts?.map(p => aliases[p.toLowerCase()] ?? p.toUpperCase()).join("");
    const label = (glyph: PixelGlyph, text: string) => h_flex().gap(6).items_center().child(pixelIcon(glyph, t.muted)).child(text);
    return rootBar(t).px(14).gap(16).border_t(UI.stroke).border_color(t.border).text_size(14)
      .child(label(space?.machine ? "server" : "monitor", machineLabel(space?.machine)))
      .when(Boolean(space?.branch), el => el.child(label("branch", space?.branch ?? "")))
      .child(h_flex().gap(6).items_center().child(div().size(6).bg(t.dim)).child(`${counts.total} agents`)
        .when(counts.blocked > 0, el => el.child(div().text_color(t.blocked).child(`· ${counts.blocked} need you`))))
      .child(div().flex_1())
      .child(actionRow(t, "palette", "Commands", () => run("app.palette")).h(24).text_color(t.dim)
        .child(hint ? `[${hint}] commands` : "commands"));
  }
}
