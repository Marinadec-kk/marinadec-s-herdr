import { div } from "gpui-kit";
import { h_flex, v_flex, Input, InputState, ScrollHandle } from "gpui-base";
import { closeOverlay, openOverlay, props, run, shared, setShared, spaces, theme, settings } from "herdr";
import { APPEARANCE_KEY, SHARP_INDEX, UI_FONT, UI_FONT_SIZE, PROJECT_COLORS, COLOR_NAMES, WORKTREE_AVATAR, machineColor, machineKey, normalizeColor, profileFor, readAppearance, record, resolveColor, withProfile, } from "./appearance-model.js";
import { tint } from "./appearance-colors.js";
import { renderAvatar } from "./appearance-avatar.js";
import { MATERIAL_ICONS } from "./material-catalog.js";
import { PLUSHIES } from "./plush-catalog.js";
import { characterLabel } from "./avatar-labels.js";
const SELF = "spaces-status";
const PAGE_SIZE = 48;
const CATEGORIES = [...new Set(MATERIAL_ICONS.flatMap(icon => icon.categories))].sort();
function targetFrom(raw) {
    const value = record(raw);
    if (value.kind === "space" && typeof value.id === "string")
        return { kind: "space", id: value.id, tree: value.tree === true };
    if (value.kind === "machine" && (value.machine === null || typeof value.machine === "string"))
        return { kind: "machine", machine: typeof value.machine === "string" ? value.machine : null };
    return null;
}
export function openAppearance(target) {
    const size = typeof window !== "undefined" ? window.viewport_size() : { width: 1000, height: 900 };
    const zoom = settings().zoom, scale = typeof zoom === "number" && zoom > 0 ? zoom : 1;
    openOverlay({ mod: SELF, kind: "dialog", frame: "none",
        width: Math.max(300, Math.min(target.kind === "machine" ? 560 : 640, size.width / scale - 32)),
        height: Math.max(300, Math.min(target.kind === "machine" ? 580 : target.tree ? 320 : 640, size.height / scale - 32)),
        props: { appearance: target } });
}
export function openSpaceMenu(id, checkout, tree) {
    openOverlay({ mod: SELF, kind: "popup", width: 250, height: 280, props: { spaceMenu: { id, checkout, tree } } });
}
export function createAppearanceOverlay(raw, cx) {
    const data = { ...record(raw), ...record(props()) }, target = targetFrom(data.appearance);
    const overlay = typeof data.overlay === "string" ? data.overlay : "";
    if (target)
        return new AppearanceEditor(target, overlay, cx);
    const menu = record(data.spaceMenu);
    return typeof menu.id === "string" ? new SpaceMenu(menu.id, menu.checkout === "main" || menu.checkout === "linked" ? menu.checkout : null, menu.tree === true, overlay, cx) : null;
}
function button(t, id, label, action, selected = false) {
    return div().id(id).h(30).px(10).flex_none().flex().items_center().justify_center()
        .border_1().border_color(selected ? t.accent : t.border).bg(selected ? t.selected : t.raised)
        .text_size(14).text_color(t.foreground).cursor_pointer().hover(el => el.bg(t.hover))
        .role("button").accessibility_label(label).tab_index(0).focus(el => el.border_color(t.accent))
        .on_key_down((event, cx) => {
        if (event.key === "enter" || event.key === "space") {
            cx.stop_propagation();
            action(cx);
        }
    })
        .on_click((_event, cx) => { cx.stop_propagation(); action(cx); }).child(label);
}
class AppearanceEditor {
    constructor(target, overlay, cx) {
        this.target = target;
        this.overlay = overlay;
        this.scroll = ScrollHandle.new();
        this.query = "";
        this.category = "all";
        this.categoriesOpen = false;
        this.page = 0;
        this.cursor = 0;
        this.columns = 8;
        this.error = "";
        const state = readAppearance(shared(APPEARANCE_KEY)), profile = profileFor(state, target);
        const space = target.kind === "space" ? spaces().find(s => s.id === target.id) : null;
        this.initialName = space?.name ?? (target.kind === "machine" ? target.machine ?? "This computer" : "");
        this.color = target.kind === "machine"
            ? resolveColor(profile.color ?? state.defaults[machineKey(target.machine)]?.color, theme())
            : profile.color ?? "";
        this.avatar = profile.avatar;
        this.name = InputState.new({ value: this.initialName, placeholder: "Name" });
        this.hex = InputState.new({ value: this.color, placeholder: "#rrggbb" });
        this.search = InputState.new({ placeholder: target.kind === "machine" ? "Search characters…" : "Search icons…" });
        this.name.on("change", (_event, cx) => cx.notify());
        this.name.on("submit", (_event, cx) => this.save(cx));
        this.hex.on("change", (_event, cx) => { this.color = this.hex.value(); this.error = ""; cx.notify(); });
        this.search.on("change", (_event, cx) => {
            this.query = this.search.value().trim().toLowerCase();
            this.page = this.cursor = 0;
            cx.notify();
        });
        this.handle = cx.focus_handle();
        this.gallery = cx.focus_handle();
        if (target.kind === "space") {
            this.name.set_selected_range({ start: 0, end: this.initialName.length });
            this.name.focus();
        }
        else
            this.search.focus();
    }
    setColor(color, cx) {
        this.color = this.target.kind === "machine" && color ? resolveColor(color, theme()) : color;
        this.hex.set_value(this.color);
        this.error = "";
        cx.notify();
    }
    save(cx) {
        const color = normalizeColor(this.color);
        if (this.color.trim() && !color) {
            this.error = "Use a six-digit hex color, for example #5b8def.";
            cx.notify();
            return;
        }
        const stored = shared(APPEARANCE_KEY), state = readAppearance(stored);
        if (this.target.kind === "space") {
            const id = this.target.id;
            if (!spaces().some(space => space.id === id)) {
                this.error = "This space is no longer available.";
                cx.notify();
                return;
            }
            const nextName = this.name.value().trim();
            if (nextName !== this.initialName)
                run("space.rename", { id, name: nextName });
        }
        const next = withProfile(state, this.target, {
            ...(color ? { color } : {}),
            ...(this.avatar ? { avatar: this.avatar } : {}),
        });
        if (JSON.stringify(next) !== JSON.stringify(stored))
            setShared(APPEARANCE_KEY, next);
        closeOverlay(this.overlay);
    }
    render() {
        const t = theme(), state = readAppearance(shared(APPEARANCE_KEY));
        const target = this.target, isMachine = target.kind === "machine";
        const space = target.kind === "space" ? spaces().find(s => s.id === target.id) : undefined;
        const machine = target.kind === "machine" ? target.machine : space?.machine ?? null;
        const base = isMachine ? resolveColor(normalizeColor(this.color) ?? state.defaults[machineKey(machine)]?.color, t)
            : machineColor(state, machine, t);
        const worktree = target.kind === "space" && (target.tree || state.spaceDefaults[target.id]?.worktree);
        const color = target.kind === "machine" ? base : resolveColor(record(shared("space.colors"))[target.id], t);
        const label = isMachine ? this.initialName : this.name.value() || "Automatic name";
        const automatic = target.kind === "machine" ? state.defaults[machineKey(machine)]?.avatar : state.spaceDefaults[target.id]?.avatar;
        const avatar = worktree ? WORKTREE_AVATAR : this.avatar ?? automatic;
        const choices = isMachine
            ? PLUSHIES.filter(p => characterLabel(p.id).toLowerCase().includes(this.query)).map(p => ({ id: `avatar-plush-${p.id}`, label: characterLabel(p.id), avatar: { kind: "plush", id: p.id } }))
            : MATERIAL_ICONS.filter(icon => icon.codes[SHARP_INDEX] != null
                && (this.category === "all" || icon.categories.includes(this.category))
                && (!this.query || icon.search.includes(this.query) || icon.name.includes(this.query))).map(icon => ({ id: `material-${icon.name}`, label: icon.name.replace(/_/g, " "), avatar: { kind: "material", family: "sharp", name: icon.name } }));
        const pages = Math.max(1, Math.ceil(choices.length / PAGE_SIZE)), page = Math.min(this.page, pages - 1);
        const shown = choices.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
        const field = (text) => div().text_size(12).text_color(t.muted).child(text);
        const input = (value) => Input.new(value).h(32).flex_none().px(9).rounded(0)
            .border_1().border_color(t.input).bg(t.background).text_size(UI_FONT_SIZE).text_color(t.foreground);
        const select = (index, cx) => {
            if (shown[index]) {
                this.avatar = shown[index].avatar;
                this.cursor = index;
                cx.notify();
            }
        };
        const swatch = (id, fill, selected, action, hint) => button(t, id, "", action, selected).w(30).px(0).tooltip(hint).accessibility_label(hint)
            .child(div().size(20).bg(fill))
            .when(selected, el => el.border(2).border_color(t.foreground));
        const gallery = h_flex().id("avatar-gallery").flex_wrap().gap(6).track_focus(this.gallery).tab_index(0)
            .role("list_box").accessibility_label(isMachine ? "Characters" : "Icons")
            .on_size_change((size, cx) => {
            const columns = Math.max(1, Math.floor((size.width + 6) / 54));
            if (columns !== this.columns) {
                this.columns = columns;
                cx.notify();
            }
        })
            .on_key_down((event, cx) => {
            const steps = { left: -1, right: 1, up: -this.columns, down: this.columns };
            if (event.key in steps && shown.length) {
                this.cursor = Math.max(0, Math.min(shown.length - 1, this.cursor + steps[event.key]));
                cx.notify();
            }
            else if (event.key === "enter" || event.key === "space")
                select(this.cursor, cx);
            else
                return;
            cx.stop_propagation();
        })
            .children(shown.map((item, index) => {
            const selected = JSON.stringify(item.avatar) === JSON.stringify(avatar);
            return div().id(item.id).size(48).flex_none().flex().items_center().justify_center()
                .border_1().border_color(selected ? color : t.border).bg(selected ? tint(color, t.popover, .15) : t.raised)
                .when(this.gallery.is_focused() && index === this.cursor, el => el.border(2).border_color(t.foreground))
                .role("list_box_option").aria_selected(selected).accessibility_label(item.label)
                .tooltip(item.label).cursor_pointer().hover(el => el.bg(t.hover))
                .on_click((_event, cx) => { this.gallery.focus(); select(index, cx); })
                .child(renderAvatar(item.avatar, isMachine ? 32 : 24, color, label));
        }));
        const colorControls = isMachine
            ? v_flex().gap(8)
                .child(field("Group color"))
                .child(h_flex().flex_wrap().gap(6)
                .children(PROJECT_COLORS.map((value, index) => swatch(`color-${index}`, resolveColor(value, t), base === resolveColor(value, t), cx => this.setColor(value, cx), COLOR_NAMES[index]))))
                .child(input(this.hex))
            : field(worktree ? "Worktree · parent color · fixed Git tree icon" : `Color assigned by ${machine ?? "This computer"}`);
        return v_flex().id("appearance-editor").size_full().min_h(0).p(16).gap(12).bg(t.popover)
            .border_1().border_color(t.border).font_family(UI_FONT).text_size(UI_FONT_SIZE).text_color(t.foreground)
            .track_focus(this.handle).on_key_down((event, cx) => {
            if (event.key === "escape") {
                cx.stop_propagation();
                closeOverlay(this.overlay);
            }
            else if (event.key === "enter" && (event.modifiers.control || event.modifiers.platform)) {
                cx.stop_propagation();
                this.save(cx);
            }
        })
            .child(h_flex().flex_none().items_center().gap(8)
            .child(div().size(6).bg(color))
            .child(div().flex_1().text_size(18).font_semibold().child(isMachine ? "Machine appearance" : "Space appearance"))
            .child(button(t, "appearance-close", "×", () => closeOverlay(this.overlay)).accessibility_label("Close")))
            .child(v_flex().id("appearance-scroll").flex_1().min_h(0).gap(12).overflow_y_scrollbar().track_scroll(this.scroll)
            .when(!isMachine, el => el.child(field("Name")).child(input(this.name)))
            .child(colorControls)
            .when(!worktree, el => el.child(h_flex().gap(8).items_center()
            .child(div().flex_1().text_size(14).font_semibold().child(isMachine ? "Character" : "Icon"))
            .child(button(t, "avatar-auto", "Auto", cx => { this.avatar = undefined; cx.notify(); }, !this.avatar)
            .tooltip("Use the saved random choice")))
            .child(input(this.search).on_key_down((event, cx) => {
            if (event.key === "down") {
                cx.stop_propagation();
                this.gallery.focus();
                cx.notify();
            }
        }))
            .when(!isMachine, el => el.child(button(t, "categories", this.category === "all" ? "Categories" : this.category, cx => { this.categoriesOpen = !this.categoriesOpen; cx.notify(); }, this.categoriesOpen)))
            .when(!isMachine && this.categoriesOpen, el => el.child(h_flex().flex_wrap().gap(4).children(["all", ...CATEGORIES].map(category => button(t, `category-${category}`, category, cx => {
            this.category = category;
            this.page = this.cursor = 0;
            this.categoriesOpen = false;
            cx.notify();
        }, category === this.category)))))
            .child(gallery)
            .when(!shown.length, el => el.child(field("No matches.")))
            .when(pages > 1, el => el.child(h_flex().gap(8).items_center()
            .child(button(t, "icons-prev", "Previous", cx => { this.page = Math.max(0, page - 1); this.cursor = 0; cx.notify(); }))
            .child(div().flex_1().text_size(12).text_color(t.muted).child(`${choices.length} icons · ${page + 1}/${pages}`))
            .child(button(t, "icons-next", "Next", cx => { this.page = Math.min(pages - 1, page + 1); this.cursor = 0; cx.notify(); }))))))
            .child(v_flex().flex_none().gap(8).p(10).border_1().border_color(tint(color, t.popover, .45)).bg(tint(color, t.popover, .06))
            .child(h_flex().gap(10).items_center()
            .child(renderAvatar(avatar, isMachine ? 32 : 24, color, label))
            .child(div().flex_1().min_w(0).truncate().font_semibold().child(label))
            .child(div().text_size(12).text_color(t.muted).child("Preview"))))
            .when(Boolean(this.error), el => el.child(div().text_size(12).text_color(t.blocked).child(this.error)))
            .child(h_flex().flex_none().gap(8).items_center()
            .when(!worktree, el => el.child(button(t, "appearance-reset", "Reset", cx => {
            this.avatar = undefined;
            this.setColor(isMachine ? state.defaults[machineKey(machine)]?.color ?? "ansi6" : "", cx);
        })))
            .child(div().flex_1())
            .child(button(t, "appearance-cancel", "Cancel", () => closeOverlay(this.overlay)))
            .child(button(t, "appearance-save", "Save", cx => this.save(cx), true)));
    }
}
class SpaceMenu {
    constructor(id, checkout, tree, overlay, cx) {
        this.id = id;
        this.checkout = checkout;
        this.tree = tree;
        this.overlay = overlay;
        this.selected = 0;
        this.handle = cx.focus_handle();
        this.handle.focus();
    }
    items() {
        const worktree = (action) => openOverlay({
            mod: "worktree", kind: "dialog", width: action === "open" ? 560 : 440,
            height: action === "open" ? 480 : 260, props: { space: this.id, action },
        });
        return [
            { label: "Rename & appearance…", action: () => openAppearance({ kind: "space", id: this.id, tree: this.tree }) },
            ...(this.checkout ? [
                { label: "New worktree", action: () => worktree("new") }, { label: "Open worktree", action: () => worktree("open") },
            ] : [{ label: "Other space actions…", action: () => openOverlay({ mod: "menu", kind: "popup", width: 220, height: 260, props: { tab: "space", target: { id: this.id } } }) }]),
            ...(this.checkout === "linked" ? [{ label: "Remove worktree", action: () => worktree("remove") }] : []),
            { label: "Close space", action: () => { run("space.close", { id: this.id }); } },
        ];
    }
    render() {
        const t = theme(), items = this.items();
        const choose = (index) => { closeOverlay(this.overlay); items[index]?.action(); };
        return v_flex().id("space-context").track_focus(this.handle).w_full().min_h(0).p(5).bg(t.popover)
            .font_family(UI_FONT).text_size(UI_FONT_SIZE).border_1().border_color(t.border)
            .on_key_down((event, cx) => {
            if (event.key === "down")
                this.selected = (this.selected + 1) % items.length;
            else if (event.key === "up")
                this.selected = (this.selected + items.length - 1) % items.length;
            else if (event.key === "enter")
                choose(this.selected);
            else if (event.key === "escape")
                closeOverlay(this.overlay);
            else
                return;
            cx.stop_propagation();
            cx.notify();
        })
            .children(items.map((item, index) => div().id(`space-action-${index}`).h(32).px(10).flex().items_center()
            .text_color(t.foreground).cursor_pointer().when(index === this.selected, el => el.bg(t.selected))
            .hover(el => el.bg(t.hover)).on_click(() => choose(index)).child(item.label)));
    }
}
