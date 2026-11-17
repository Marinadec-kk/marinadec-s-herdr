// Owned pixel chrome, adapted from Herdr 0.1.15's Apache-2.0 workspace mods.
// Keep behavior (wheel/drag, per-space panels, traffic lights, pane targets).
import { div } from "gpui-kit";
import { h_flex, ScrollHandle } from "gpui-base";
import { agents, home, keys, layout, panes, props, run, theme, setShared, shared, spaces, updates, window, } from "herdr";
import { record } from "./appearance-model.js";
import { pixelButton, pixelIcon, pixelStatus, programIcon } from "./pixel-ui.js";
import { actionRow, button } from "./ui/controls.js";
import { surface } from "./ui/surfaces.js";
import { UI, SPACING, CHROME, RAIL } from "./ui/tokens.js";
import { uiScale } from "./ui/geometry.js";
import { machineLabel, shortPath, tabLabel } from "./presentation/labels.js";
import { statusCounts } from "./presentation/status.js";
import { openSurface, openPicker, openTabMenu, openTabRename, closeTab, openMachineAdd, newSpaceInHome } from "./overlays.js";
export { tabLabel } from "./presentation/labels.js";
export function createPixelChrome(raw) {
    const role = record({ ...record(raw), ...record(props()) }).chrome;
    if (role === "tabs")
        return new PixelTabs();
    if (role === "pane")
        return new PixelPane();
    if (role === "brand" || role === "footer" || role === "status")
        return new PixelBars(role);
    return null;
}
export function findNode(node, id) {
    if (node?.id === id)
        return node;
    for (const child of node?.children ?? []) {
        const found = findNode(child, id);
        if (found)
            return found;
    }
    return undefined;
}
function paneFrame(node) {
    if (!node || node.hidden)
        return undefined;
    if (node.content?.tab && node.content.pane)
        return node.content;
    let children = node.children ?? [];
    if (node.type === "stack") {
        const visible = children.filter(child => !child.hidden);
        const active = visible.find(child => child.id === node.active) ?? visible[0];
        children = active ? [active] : [];
    }
    for (const child of children) {
        const frame = paneFrame(child);
        if (frame)
            return frame;
    }
    return undefined;
}
function rootBar(t) {
    return surface(t, "bar").size_full().text_color(t.muted);
}
class PixelTabs {
    constructor() {
        this.pressed = null;
        this.scroll = ScrollHandle.new();
        this.selectedIndex = -1;
        this.panels = {};
        this.pending = null;
        this.swipe = { acc: 0, steps: 0, at: 0, last: 0 };
        try {
            const saved = record(JSON.parse(localStorage.getItem("panels") ?? "{}"));
            this.panels = Object.fromEntries(Object.entries(saved).filter((e) => e[1] === null || typeof e[1] === "string"));
        }
        catch { /* Malformed preferences do not disable tab navigation. */ }
    }
    wheel(event) {
        if (event.delta_lines) {
            if (event.delta_lines.y)
                run(event.delta_lines.y > 0 ? "tab.prev" : "tab.next");
            return;
        }
        const swipe = this.swipe, now = Date.now();
        if (event.touch_phase === "started" || now - swipe.at > 250 || event.delta.y * swipe.acc < 0)
            Object.assign(swipe, { acc: 0, steps: 0 });
        swipe.at = now;
        swipe.acc += event.delta.y;
        const need = swipe.steps ? 60 : 20;
        if (Math.abs(swipe.acc) < need || now - swipe.last < 100)
            return;
        swipe.acc -= Math.sign(swipe.acc) * need;
        swipe.steps++;
        swipe.last = now;
        run(event.delta.y > 0 ? "tab.prev" : "tab.next");
    }
    syncPanel(space, panel, body, enabled) {
        if (!space || !panel)
            return;
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
                    }
                    else
                        run("layout.hide", { id: "panel" });
                    return;
                }
            }
        }
        if (this.pending) {
            if (this.pending.want !== now && Date.now() < this.pending.until)
                return;
            this.pending = null;
        }
        if (this.panels[space.id] === now)
            return;
        this.panels[space.id] = now;
        localStorage.setItem("panels", JSON.stringify(this.panels));
    }
    render() {
        const t = theme(), root = layout();
        const space = spaces().find(s => s.active), allPanes = panes(), shown = space?.tabs ?? [];
        const active = shown.findIndex(tab => tab.active), selected = shown[active]?.id;
        if (selected !== this.selected || active !== this.selectedIndex) {
            this.selected = selected;
            this.selectedIndex = active;
            if (active >= 0)
                this.scroll.scroll_to_item(active);
        }
        const w = window(), sidebar = findNode(root, "sidebar"), scale = uiScale();
        const lightsPadding = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
            ? Math.max(SPACING.chrome.inset, (root.traffic_lights[0] + CHROME.trafficLightsWidth) / scale - (sidebar?.hidden ? 0 : sidebar?.size?.px ?? 0)) : SPACING.chrome.inset;
        const panel = findNode(root, "panel"), body = findNode(root, "panel-body");
        const stored = shared("workspace.panels");
        const enabled = Array.isArray(stored) ? stored.filter((v) => typeof v === "string") : ["files", "changes"];
        this.syncPanel(space, panel, body, enabled);
        const panelButton = (id, label, glyph) => {
            const on = panel && !panel.hidden && body?.active === id;
            return button(t, `panel-${id}`, label, () => {
                if (on)
                    run("layout.hide", { id: "panel" });
                else {
                    run("layout.select", { stack: "panel-body", child: id });
                    run("layout.show", { id: "panel" });
                }
            }, { selected: Boolean(on) }).child(pixelIcon(glyph, on ? t.foreground : t.muted));
        };
        return rootBar(t).px(SPACING.chrome.inset).pl(lightsPadding).gap(SPACING.chrome.gap).border_b(UI.stroke).border_color(t.border)
            .on_mouse_up("left", () => { this.pressed = null; })
            .on_scroll_wheel(event => this.wheel(event))
            .child(h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_center().gap(SPACING.chrome.actionGap)
            .overflow_x_scrollbar().track_scroll(this.scroll)
            .on_size_change((_size, cx) => { if (active >= 0) {
            this.scroll.scroll_to_item(active);
            cx.notify();
        } })
            .children(shown.map((tab, index) => {
            const lead = allPanes.find(p => p.tab === tab.id && p.program?.agent) ?? allPanes.find(p => p.tab === tab.id);
            const pic = programIcon(lead?.program, UI.programIcon, t.muted), label = tabLabel(tab, lead);
            const status = pixelStatus(t, tab.status);
            return h_flex().id(`tab-${tab.id}`).h(CHROME.tab).px(SPACING.row.inset).gap(SPACING.row.gap).items_center().flex_none()
                .border(UI.stroke).border_color(tab.active ? t.accent : t.border).bg(tab.active ? t.raised : t.chrome)
                .text_color(tab.active ? t.foreground : t.muted).hover(el => el.bg(t.hover))
                .when(index <= active, el => el.on_size_change((_size, cx) => { this.scroll.scroll_to_item(active); cx.notify(); }))
                .on_mouse_down("left", (event, cx) => {
                cx.stop_propagation();
                this.pressed = tab.id;
                if (event.click_count === 2)
                    openTabRename(tab.id);
            })
                .on_mouse_up("left", (_event, cx) => {
                cx.stop_propagation();
                const from = this.pressed;
                this.pressed = null;
                // A removed tab during a drag is not a new target.
                if (from && from !== tab.id && shown.some(s => s.id === from))
                    run("tab.move", { id: from, index: index + 1 });
                else if (from === tab.id)
                    run("tab.select", { id: tab.id });
            })
                .on_mouse_down("right", (_event, cx) => {
                cx.stop_propagation();
                openTabMenu(tab.id, space?.id);
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
class PixelPane {
    constructor() {
        this.hovered = false;
        this.keyboardControls = false;
        this.width = 0;
    }
    render() {
        const t = theme();
        const target = record(props()).pane, p = panes().find(p => p.pane === target);
        if (!p)
            return div();
        const name = ((p.program?.agent || p.program?.shell) && p.program.name) || p.title || p.program?.name || "shell";
        const pic = programIcon(p.program, UI.programIcon, t.muted), status = pixelStatus(t, p.status), pane = p.pane, cwd = p.cwd ?? "";
        const remote = spaces().find(s => s.tabs.some(tab => tab.id === p.tab))?.machine;
        const folder = remote ? cwd : shortPath(cwd, home());
        const bottom = paneFrame(layout())?.pane?.header?.position === "bottom";
        const revealed = this.hovered || this.keyboardControls;
        const control = (id, glyph, hint, action) => pixelButton(t, id, glyph, hint, action).tab_stop(revealed);
        const actions = h_flex().id(`actions-${pane}`).flex_none().gap(SPACING.chrome.actionGap);
        if (this.width > 0 && this.width / uiScale() < 260) {
            actions.child(control(`more-${pane}`, "menu", "Pane menu", () => openSurface({ tab: "pane", target: { pane, terminal: p.terminal } }, { kind: "popup", width: 250 })));
        }
        else {
            actions
                .child(control(`ph-r-${pane}`, "split", "Split right", () => run("pane.split", { direction: "right", pane })))
                .child(control(`ph-d-${pane}`, "splitDown", "Split down", () => run("pane.split", { direction: "down", pane })))
                .child(control(`ph-z-${pane}`, "zoom", p.zoomed ? "Unzoom pane" : "Zoom pane", () => run("pane.zoom", { pane })))
                .child(control(`ph-x-${pane}`, "close", "Close pane", () => run("pane.close", { pane })));
        }
        return rootBar(t).id(`pane-head-${pane}`).px(SPACING.chrome.inset).gap(SPACING.chrome.gap).bg(t.background)
            .role("group").accessibility_label("Pane; Enter reveals controls").tab_index(0)
            .focus(el => el.bg(t.raised))
            .on_size_change((size, cx) => { if (this.width !== size.width) {
            this.width = size.width;
            cx.notify();
        } })
            .on_key_down((event, cx) => {
            if (event.key === "escape")
                this.keyboardControls = false;
            else if (event.key === "enter" || event.key === "space")
                this.keyboardControls = true;
            else
                return;
            cx.stop_propagation();
            cx.notify();
        })
            .when(bottom, el => el.border_t(UI.stroke)).when(!bottom, el => el.border_b(UI.stroke))
            .border_color(p.focused ? t.accent : t.border)
            .on_hover((hovered, cx) => { this.hovered = hovered; cx.notify(); })
            .on_click(() => run("pane.focus", { pane }))
            .children(pic ? [div().flex_none().tooltip(name).child(pic)] : [])
            .when(!pic, el => el.child(div().min_w(0).max_w(180).truncate().tooltip(name).text_color(t.foreground).child(name)))
            .children(status ? [status] : [])
            .child(div().flex_1().min_w(0).truncate().text_color(t.dim).tooltip(cwd).child(folder))
            .child(actions.when(!revealed, el => el.invisible()));
    }
}
class PixelBars {
    constructor(role) {
        this.role = role;
        this.width = 1000;
    }
    render() {
        const t = theme();
        if (this.role === "status")
            return this.status(t);
        const root = layout(), width = findNode(root, "sidebar")?.size?.px ?? UI.sidebar;
        const collapsed = width < UI.railBelow, w = window();
        if (this.role === "footer") {
            const row = (id, glyph, label, action) => actionRow(t, id, label, action).h(CHROME.footerRow)
                .when(collapsed, el => el.relative().w(UI.railCell).px(0).justify_center().tooltip(label))
                .child(pixelIcon(glyph, t.muted)).when(!collapsed, el => el.child(label));
            const ready = div().size(6).bg(t.accent);
            return surface(t, "bar").flex_col().items_stretch().size_full()
                .border_t(UI.stroke).border_color(t.border).px(SPACING.chrome.inset).py(SPACING.chrome.footerInset).gap(SPACING.chrome.footerGap)
                .when(collapsed, el => el.px(0).items_center())
                .child(row("settings", "settings", "Settings", () => run("app.settings"))
                .when(Boolean(updates().app.ready), el => el.child(collapsed ? ready.absolute().top(5).right(6) : ready)))
                .child(row("machine", "plus", "Add machine", openMachineAdd));
        }
        return rootBar(t).px(collapsed ? 0 : SPACING.chrome.inset).gap(SPACING.chrome.gap).border_b(UI.stroke).border_color(t.border)
            .when(collapsed, el => el.justify_center())
            .when(w?.platform === "macos" && !w.fullscreen && !collapsed, el => el.pl(CHROME.macRail))
            .when(!collapsed, el => el.child(h_flex().flex_1().gap(SPACING.row.gap).items_center()
            .child(div().text_size(16).font_semibold().text_color(t.foreground).child("HERDR"))))
            .when(!collapsed, el => el.child(pixelButton(t, "space-new", "plus", "New space in current machine’s home", () => newSpaceInHome()))
            .child(pixelButton(t, "search", "search", "Find a space or terminal", openPicker)))
            .when(!(collapsed && w?.platform === "macos"), el => el.child(pixelButton(t, "sidebar-toggle", "sidebar", collapsed ? "Expand sidebar" : "Collapse sidebar", () => {
            if (!collapsed)
                setShared("sidebar.width", width);
            setShared("sidebar.collapsed", !collapsed);
            const saved = shared("sidebar.width");
            const previous = typeof saved === "number" && saved >= UI.railBelow ? saved : UI.sidebar;
            run("layout.resize", { id: "sidebar", px: collapsed ? previous : w?.platform === "macos" ? CHROME.macRail : RAIL.min });
        })));
    }
    status(t) {
        const width = this.width / uiScale();
        const space = spaces().find(s => s.active), list = agents();
        const machine = machineLabel(space?.machine), location = space ? `${machine} → ${space.name}` : machine;
        const counts = statusCounts(list), mac = window()?.platform === "macos";
        const aliases = { cmd: mac ? "⌘" : "Super+", ctrl: mac ? "⌃" : "Ctrl+", shift: mac ? "⇧" : "Shift+", alt: mac ? "⌥" : "Alt+" };
        const binding = keys().find(k => k.section === "global" && k.action === "app.palette");
        const parts = binding?.keys.endsWith("--") ? [...binding.keys.slice(0, -2).split("-"), "-"] : binding?.keys.split("-");
        const hint = parts?.map(p => aliases[p.toLowerCase()] ?? p.toUpperCase()).join("");
        const label = (glyph, text) => h_flex().min_w(0).gap(SPACING.metadata.gap).items_center()
            .child(pixelIcon(glyph, t.muted)).child(div().min_w(0).truncate().child(text));
        return rootBar(t).id("status-bar").on_size_change((size, cx) => { if (this.width !== size.width) {
            this.width = size.width;
            cx.notify();
        } })
            .px(SPACING.chrome.inset).gap(SPACING.chrome.gap).border_t(UI.stroke).border_color(t.border).text_size(14)
            .child(label(space?.machine ? "server" : "monitor", location).id("status-space").max_w(420)
            .text_color(t.foreground).tooltip(location))
            .when(width > 500 && Boolean(space?.branch), el => el.child(label("branch", space?.branch ?? "")))
            .when(width > 300, el => el.child(h_flex().flex_none().gap(SPACING.metadata.gap).items_center().child(`${counts.total} agents`)
            .when(counts.blocked > 0, el => el.child(div().text_color(t.blocked).child(`· ${counts.blocked} need you`)))))
            .child(div().flex_1().min_w(0))
            .when(width > 500, el => el.child(actionRow(t, "palette", "Commands", () => run("app.palette")).flex_none().h(24).text_color(t.dim)
            .child(hint ? `[${hint}] commands` : "commands")));
    }
}
