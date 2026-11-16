// Owned pixel chrome, adapted from Herdr 0.1.15's Apache-2.0 workspace mods.
// Keep behavior (wheel/drag, per-space panels, traffic lights, pane targets).
import { div } from "gpui-kit";
import type { Element, ScrollWheelEvent } from "gpui-kit";
import { h_flex, v_flex, ScrollHandle } from "gpui-base";
import {
  agents, home, keys, layout, openOverlay, panes, props, run, settings, theme,
  setShared, shared, spaces, updates, window,
} from "herdr";
import type { PaneInfo, SpaceInfo, TabInfo } from "herdr";
import { UI_FONT, UI_FONT_SIZE, record } from "./appearance-model.js";
import type { Theme } from "./appearance-model.js";
import { pixelButton, pixelIcon, pixelStatus, programIcon } from "./pixel-ui.js";
import type { PixelGlyph } from "./pixel-ui.js";

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
  return h_flex().size_full().min_w(0).items_center().bg(t.chrome)
    .font_family(UI_FONT).text_size(UI_FONT_SIZE).text_color(t.muted);
}

export function tabLabel(tab: TabInfo, lead: PaneInfo | undefined): string {
  const program = lead?.program;
  const base = tab.named ? tab.name : program?.name ?? "Terminal";
  if (!program?.agent) return base;
  const live = (lead?.title ?? "").replace(/^[^\p{L}\p{N}\p{Ps}\p{Pi}]+/u, "").replace(/^\[ [!.] \] /, "").trim();
  const path = /^[~/]|^[A-Za-z]:\\/.test((lead?.title ?? "").replace(/^[^\p{L}\p{N}~/]+/u, ""));
  const telling = live && live !== lead?.terminal && live !== program.name && !path
    && !live.includes("@") && live.toLowerCase() !== program.key;
  return (tab.name === program.name || !tab.named) && telling ? live : base;
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
      return h_flex().id(`panel-${id}`).h(28).px(8).gap(6).flex_none().items_center()
        .border_1().border_color(on ? t.accent : t.border).bg(on ? t.selected : t.chrome)
        .hover(el => el.bg(t.hover)).cursor_pointer()
        .on_mouse_down("left", (_event, cx) => cx.stop_propagation())
        .on_click(() => {
          if (on) run("layout.hide", { id: "panel" });
          else {
            run("layout.select", { stack: "panel-body", child: id });
            run("layout.show", { id: "panel" });
          }
        }).child(pixelIcon(glyph, on ? t.foreground : t.muted)).child(label);
    };
    return rootBar(t).px(10).pl(lightsPadding).gap(6).border_b(1).border_color(t.border)
      .on_mouse_up("left", () => { this.pressed = null; })
      .on_scroll_wheel(event => this.wheel(event))
      .child(h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_center().gap(4)
        .overflow_x_scrollbar().track_scroll(this.scroll)
        .on_size_change((_size, cx) => { if (active >= 0) { this.scroll.scroll_to_item(active); cx.notify(); } })
        .children(shown.map((tab, index) => {
          const lead = allPanes.find(p => p.tab === tab.id && p.program?.agent) ?? allPanes.find(p => p.tab === tab.id);
          const pic = programIcon(lead?.program, 14, t.muted);
          const status = pixelStatus(t, tab.status);
          return h_flex().id(`tab-${tab.id}`).h(30).px(10).gap(7).items_center().flex_none()
            .border_1().border_color(tab.active ? t.accent : t.border).bg(tab.active ? t.raised : t.chrome)
            .text_color(tab.active ? t.foreground : t.muted).hover(el => el.bg(t.hover))
            .when(index <= active, el => el.on_size_change((_size, cx) => { this.scroll.scroll_to_item(active); cx.notify(); }))
            .on_mouse_down("left", (event, cx) => {
              cx.stop_propagation(); this.pressed = tab.id;
              if (event.click_count === 2) run("tab.rename", { id: tab.id });
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
              openOverlay({ mod: "spaces-status", kind: "popup", width: 230, props: { chromeMenu: { id: tab.id, space: space?.id } } });
            })
            .children(pic ? [pic] : [])
            .child(div().max_w(240).truncate().tooltip(tabLabel(tab, lead)).child(`${tabLabel(tab, lead)}${tab.zoomed ? " [Z]" : ""}`))
            .children(status ? [status] : [])
            .when(tab.active, el => el.child(pixelButton(t, `close-${tab.id}`, "close", "Close tab", () => run("tab.close", { id: tab.id })).size(18)));
        })))
      .child(pixelButton(t, "tab-new", "plus", "New terminal or agent", () => openOverlay({ mod: "spaces-status", kind: "popup", width: 280, height: 512, props: { newMenu: true } })))
      .when(enabled.includes("files"), el => el.child(panelButton("files", "FILES", "file")))
      .when(enabled.includes("changes"), el => el.child(panelButton("changes", "CHANGES", "branch")))
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
    const pic = programIcon(p.program, 14, t.muted), status = pixelStatus(t, p.status), pane = p.pane, cwd = p.cwd ?? "", h = home();
    const folder = cwd === h ? "~" : cwd.startsWith(h + "/") ? "~" + cwd.slice(h.length) : cwd;
    const bottom = paneFrame(layout() as LayoutNode)?.pane?.header?.position === "bottom";
    return rootBar(t).id(`pane-head-${pane}`).px(10).gap(8).bg(t.background)
      .when(bottom, el => el.border_t(1)).when(!bottom, el => el.border_b(1))
      .border_color(p.focused ? t.accent : t.border)
      .on_hover((hovered, cx) => { this.hovered = hovered; cx.notify(); })
      .on_click(() => run("pane.focus", { pane }))
      .children(pic ? [pic] : [])
      .child(div().flex_none().max_w(260).truncate().text_color(t.foreground).child(name))
      .child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(folder))
      .children(status ? [status] : [])
      .when(p.status === "blocked", el => el.child(div().text_color(t.blocked).child("NEEDS YOU")))
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
    const root = layout() as LayoutNode, width = findNode(root, "sidebar")?.size?.px ?? 299;
    const collapsed = width < 160, w = window();
    if (this.role === "footer") {
      const row = (id: string, glyph: PixelGlyph, label: string, action: () => void) =>
        h_flex().id(id).h(28).px(8).gap(9).items_center().cursor_pointer()
          .when(collapsed, el => el.relative().w(32).px(0).justify_center().tooltip(label))
          .text_color(t.muted).hover(el => el.bg(t.hover).text_color(t.foreground))
          .on_click(action).child(pixelIcon(glyph, t.muted)).when(!collapsed, el => el.child(label));
      const ready = div().size(6).bg(t.accent);
      return v_flex().size_full().bg(t.chrome).font_family(UI_FONT).text_size(UI_FONT_SIZE)
        .border_t(1).border_color(t.border).px(8).pt(4).pb(8).when(collapsed, el => el.px(0).items_center())
        .child(row("settings", "settings", "Settings", () => run("app.settings"))
          .when(Boolean(updates().app.ready), el => el.child(collapsed ? ready.absolute().top(5).right(6) : ready)))
        .child(row("machine", "plus", "Add machine", () => run("mod.open", { name: "machine-add" })));
    }
    return rootBar(t).pl(collapsed ? 6 : 12).pr(10).gap(6).border_b(1).border_color(t.border)
      .when(w?.platform === "macos" && !w.fullscreen && !collapsed, el => el.pl(76))
      .when(!collapsed, el => el.child(h_flex().flex_1().gap(8).items_center()
        .child(div().text_size(16).font_semibold().text_color(t.foreground).child("HERDR"))))
      .when(!collapsed, el => el.child(pixelButton(t, "search", "search", "Find a space or terminal", () => run("mod.open", { name: "picker" }))))
      .when(!(collapsed && w?.platform === "macos"), el => el.child(pixelButton(t, "sidebar-toggle", "sidebar", collapsed ? "Expand sidebar" : "Collapse sidebar", () => {
        if (!collapsed) setShared("sidebar.width", width);
        setShared("sidebar.collapsed", !collapsed);
        const saved: unknown = shared("sidebar.width");
        const previous = typeof saved === "number" && saved >= 160 ? saved : 299;
        run("layout.resize", { id: "sidebar", px: collapsed ? previous : w?.platform === "macos" ? 76 : 44 });
      })));
  }

  private status(t: Theme): Element {
    const space = spaces().find(s => s.active), list = agents();
    const needs = list.filter(a => a.status === "blocked").length, mac = window()?.platform === "macos";
    const aliases: Record<string, string> = { cmd: mac ? "⌘" : "Super+", ctrl: mac ? "⌃" : "Ctrl+", shift: mac ? "⇧" : "Shift+", alt: mac ? "⌥" : "Alt+" };
    const binding = keys().find(k => k.section === "global" && k.action === "app.palette");
    const parts = binding?.keys.endsWith("--") ? [...binding.keys.slice(0, -2).split("-"), "-"] : binding?.keys.split("-");
    const hint = parts?.map(p => aliases[p.toLowerCase()] ?? p.toUpperCase()).join("");
    const label = (glyph: PixelGlyph, text: string) => h_flex().gap(6).items_center().child(pixelIcon(glyph, t.muted)).child(text);
    return rootBar(t).px(14).gap(16).border_t(1).border_color(t.border).text_size(14)
      .child(label(space?.machine ? "server" : "monitor", space?.machine ?? "This computer"))
      .when(Boolean(space?.branch), el => el.child(label("branch", space?.branch ?? "")))
      .child(h_flex().gap(6).items_center().child(div().size(6).bg(t.dim)).child(`${list.length} agents`)
        .when(needs > 0, el => el.child(div().text_color(t.blocked).child(`· ${needs} needs you`))))
      .child(div().flex_1())
      .child(div().id("palette").text_color(t.dim).cursor_pointer().on_click(() => run("app.palette"))
        .child(hint ? `[${hint}] commands` : "commands"));
  }
}
