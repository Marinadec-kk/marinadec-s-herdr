import { div, svg } from "gpui-kit";
import type { AsyncContext, Context, Element } from "gpui-kit";
import { h_flex, v_flex, Input, InputState } from "gpui-base";
import { closeOverlay, openOverlay, props, run, shared, setShared, spaces, theme } from "herdr";
import {
  APPEARANCE_KEY, MATERIAL_FAMILIES, PIXELS, UI_FONT, UI_FONT_SIZE, PROJECT_COLORS, machineKey,
  normalizeColor, profileFor, readAppearance, record, resolveColor, withProfile,
} from "./appearance-model.js";
import type { AppearanceTarget, AvatarChoice, MaterialFamily, Theme } from "./appearance-model.js";
import { renderAvatar } from "./appearance-avatar.js";
import { MATERIAL_ICONS } from "./material-catalog.js";
import { PLUSHIES } from "./plush-catalog.js";

const SELF = "spaces-status";
const PAGE_SIZE = 60;
const CATEGORIES = [...new Set(MATERIAL_ICONS.flatMap(icon => icon.categories))].sort();
export interface AppearanceOverlay { render(): Element }
type Checkout = "main" | "linked" | null;

function targetFrom(raw: unknown): AppearanceTarget | null {
  const value = record(raw);
  if (value.kind === "space" && typeof value.id === "string") return { kind: "space", id: value.id, tree: value.tree === true };
  if (value.kind === "machine" && (value.machine === null || typeof value.machine === "string")) {
    return { kind: "machine", machine: typeof value.machine === "string" ? value.machine : null };
  }
  return null;
}

export function openAppearance(target: AppearanceTarget): void {
  openOverlay({ mod: SELF, kind: "dialog", width: 720, height: 760, props: { appearance: target } });
}

export function openSpaceMenu(id: string, checkout: Checkout, tree: boolean): void {
  openOverlay({ mod: SELF, kind: "popup", width: 250, height: 280, props: { spaceMenu: { id, checkout, tree } } });
}

export function createAppearanceOverlay(raw: unknown, cx: AsyncContext): AppearanceOverlay | null {
  const data = { ...record(raw), ...record(props()) };
  const overlay = typeof data.overlay === "string" ? data.overlay : "";
  const target = targetFrom(data.appearance);
  if (target) return new AppearanceEditor(target, overlay, cx);
  const menu = record(data.spaceMenu);
  if (typeof menu.id === "string") return new SpaceMenu(menu.id,
    menu.checkout === "main" || menu.checkout === "linked" ? menu.checkout : null,
    menu.tree === true, overlay, cx);
  return null;
}

function button(t: Theme, id: string, label: string, action: (cx: Context) => void, selected = false): Element {
  return div().id(id).h(28).px(9).flex_none().flex().items_center().justify_center()
    .border_1().border_color(selected ? t.accent : t.border).bg(selected ? t.selected : t.raised)
    .text_size(14).text_color(t.foreground).cursor_pointer().hover(el => el.bg(t.hover))
    .on_click((_event, cx) => { cx.stop_propagation(); action(cx); }).child(label);
}

class AppearanceEditor implements AppearanceOverlay {
  private name: InputState;
  private hex: InputState;
  private search: InputState;
  private handle: ReturnType<Context["focus_handle"]>;
  private initialName: string;
  private color: string;
  private avatar: AvatarChoice | undefined;
  private family: MaterialFamily;
  private query = "";
  private category = "all";
  private page = 0;
  private error = "";

  constructor(private target: AppearanceTarget, private overlay: string, cx: AsyncContext) {
    const state = readAppearance(shared(APPEARANCE_KEY));
    const profile = profileFor(state, target);
    const space = target.kind === "space" ? spaces().find(s => s.id === target.id) : null;
    this.initialName = space?.name ?? (target.kind === "machine" ? target.machine ?? "This computer" : "");
    this.color = profile.color ?? "";
    this.avatar = profile.avatar;
    this.family = this.avatar?.kind === "material" ? this.avatar.family : "round";
    this.name = InputState.new({ value: this.initialName, placeholder: "Empty name restores the automatic name" });
    this.hex = InputState.new({ value: this.color, placeholder: "#rrggbb · blank = Auto" });
    this.search = InputState.new({ placeholder: "Search all Material Icons: rocket, robot, folder…" });
    this.name.on("change", (_event, cx) => cx.notify());
    this.name.on("submit", (_event, cx) => this.save(cx));
    this.hex.on("change", (_event, cx) => { this.color = this.hex.value(); this.error = ""; cx.notify(); });
    this.search.on("change", (_event, cx) => { this.query = this.search.value().trim().toLowerCase(); this.page = 0; cx.notify(); });
    this.handle = cx.focus_handle();
    if (target.kind === "space") {
      this.name.set_selected_range({ start: 0, end: this.initialName.length });
      this.name.focus();
    } else this.search.focus();
  }

  private setColor(color: string, cx: Context): void {
    this.color = color;
    this.hex.set_value(color);
    this.error = "";
    cx.notify();
  }

  private setFamily(family: MaterialFamily, cx: Context): void {
    this.family = family;
    this.page = 0;
    if (this.avatar?.kind === "material") {
      const name = this.avatar.name, index = MATERIAL_FAMILIES.findIndex(f => f.id === family);
      if (MATERIAL_ICONS.find(icon => icon.name === name)?.codes[index] != null)
        this.avatar = { kind: "material", family, name };
    }
    cx.notify();
  }

  private save(cx: Context): void {
    const color = normalizeColor(this.color);
    if (this.color.trim() && !color) { this.error = "Use a six-digit hex color, for example #5b8def."; cx.notify(); return; }
    const state = readAppearance(shared(APPEARANCE_KEY));
    if (this.target.kind === "space") {
      const id = this.target.id;
      if (!spaces().some(space => space.id === id)) { this.error = "This space is no longer available."; cx.notify(); return; }
      const nextName = this.name.value().trim();
      if (nextName !== this.initialName) run("space.rename", { id, name: nextName });
      // Reset must release a previous manual color, rather than retain it as auto.
      if (!color && profileFor(state, this.target).color) {
        const colors = { ...record(shared("space.colors")) };
        delete colors[id];
        setShared("space.colors", colors);
      }
    }
    const next = withProfile(state, this.target, { ...(color ? { color } : {}), ...(this.avatar ? { avatar: this.avatar } : {}) });
    if (JSON.stringify(next) !== JSON.stringify(state)) setShared(APPEARANCE_KEY, next);
    closeOverlay(this.overlay);
  }

  render(): Element {
    const t = theme() as Theme, state = readAppearance(shared(APPEARANCE_KEY));
    const color = resolveColor(normalizeColor(this.color) ?? (this.target.kind === "machine"
      ? state.defaults[machineKey(this.target.machine)]?.color
      : record(shared("space.colors"))[this.target.id] as string), t);
    const label = this.target.kind === "space" ? this.name.value() || "Automatic name" : this.initialName;
    const autoAvatar: AvatarChoice | undefined = this.target.kind === "machine"
      ? { kind: "pixel", name: state.defaults[machineKey(this.target.machine)]?.mascot ?? "robot" } : undefined;
    const familyIndex = MATERIAL_FAMILIES.findIndex(f => f.id === this.family);
    const matches = MATERIAL_ICONS.filter(icon => icon.codes[familyIndex] != null
      && (this.category === "all" || icon.categories.includes(this.category))
      && (!this.query || icon.search.includes(this.query) || icon.name.includes(this.query)));
    const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
    const page = Math.min(this.page, pages - 1);
    const shown = matches.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const field = (text: string) => div().text_size(14).text_color(t.muted).child(text);
    const input = (value: InputState) => Input.new(value).h(32).flex_none().px(9).rounded(0)
      .border_1().border_color(t.input).bg(t.background).text_size(UI_FONT_SIZE).text_color(t.foreground);
    const choose = (avatar: AvatarChoice | undefined, cx: Context) => { this.avatar = avatar; cx.notify(); };
    const categories = ["all", ...CATEGORIES];
    const grid = Array.from({ length: Math.ceil(shown.length / 10) }, (_, row) =>
      h_flex().gap(5).children(shown.slice(row * 10, row * 10 + 10).map(icon => {
        const selected = this.avatar?.kind === "material" && this.avatar.family === this.family && this.avatar.name === icon.name;
        return div().id(`material-${icon.name}`).w(54).h(36).flex_none()
          .border_1().border_color(selected ? t.accent : t.border).bg(selected ? t.selected : t.raised)
          .flex().items_center().justify_center().tooltip(icon.name).cursor_pointer().hover(el => el.bg(t.hover))
          .on_click((_event, cx) => choose({ kind: "material", family: this.family, name: icon.name }, cx))
          .child(renderAvatar({ kind: "material", family: this.family, name: icon.name }, 23, color, label));
      })));
    return v_flex().id("appearance-editor").size_full().min_h(0).p(18).gap(12).bg(t.popover)
      .border(2).border_color(t.border).font_family(UI_FONT).text_size(UI_FONT_SIZE).text_color(t.foreground)
      .track_focus(this.handle).on_key_down((event, cx) => {
        if (event.key === "escape") { cx.stop_propagation(); closeOverlay(this.overlay); }
      })
      .child(h_flex().items_center().gap(8)
        .child(div().size(8).bg(color))
        .child(div().flex_1().text_size(20).child(this.target.kind === "space" ? "RENAME & APPEARANCE" : `MACHINE · ${this.initialName}`))
        .child(div().text_size(14).text_color(t.dim).child("[Esc]")))
      .child(v_flex().flex_1().min_h(0).gap(10).overflow_y_scrollbar()
        .when(this.target.kind === "space", el => el.child(field("Name")).child(input(this.name)))
        .child(field(this.target.kind === "space" ? "Color · avatar" : "Color · avatar, frame and card tint"))
        .child(h_flex().gap(6).items_center()
          .child(button(t, "color-auto", "Auto", cx => this.setColor("", cx), !this.color.trim()))
          .children(PROJECT_COLORS.map((value, index) => div().id(`color-${index}`).size(25).flex_none()
            .bg(resolveColor(value, t)).border(2).border_color(this.color === value ? t.foreground : t.border)
            .tooltip(value).cursor_pointer().on_click((_event, cx) => this.setColor(value, cx))))
          .child(input(this.hex).flex_1().min_w(0)))
        .child(field("Avatar"))
        .child(h_flex().gap(6).items_center()
          .child(button(t, "avatar-auto", "Default avatar", cx => choose(undefined, cx), !this.avatar))
          .child(button(t, "avatar-letter", "Letter", cx => choose({ kind: "letter" }, cx), this.avatar?.kind === "letter"))
          .children(PIXELS.map(name => div().id(`avatar-pixel-${name}`).size(32).flex_none()
            .border_1().border_color(this.avatar?.kind === "pixel" && this.avatar.name === name ? t.accent : t.border)
            .bg(t.raised).flex().items_center().justify_center().tooltip(name).cursor_pointer()
            .on_click((_event, cx) => choose({ kind: "pixel", name }, cx))
            .child(renderAvatar({ kind: "pixel", name }, 24, color, label))))
          .child(div().flex_1())
          .child(div().text_size(14).text_color(t.muted).child("Original critters")))
        .child(field(this.target.kind === "machine"
          ? "Default avatar = assigned critter. Your color stays unchanged."
          : "Default avatar = first letter, home for ~, tree for a worktree. Color stays unchanged."))
        .child(field(`SS14 PLUSHIES · ${PLUSHIES.length} characters`))
        .child(h_flex().flex_wrap().gap(5).children(PLUSHIES.map(plush =>
          div().id(`avatar-plush-${plush.id}`).size(42).flex_none().border_1()
            .border_color(this.avatar?.kind === "plush" && this.avatar.id === plush.id ? t.accent : t.border)
            .bg(t.raised).flex().items_center().justify_center().cursor_pointer()
            .tooltip(`${plush.label} · ${plush.license} · credits in icons/plushies/CREDITS.md`)
            .on_click((_event, cx) => choose({ kind: "plush", id: plush.id }, cx))
            .child(renderAvatar({ kind: "plush", id: plush.id }, 32, color, label)))))
        .child(field(`MATERIAL ICONS · ${MATERIAL_ICONS.length} names · styles change the drawing, not its meaning`))
        .child(h_flex().flex_wrap().gap(5).children(MATERIAL_FAMILIES.map(family =>
          button(t, `family-${family.id}`, family.label, cx => this.setFamily(family.id, cx), family.id === this.family)
            .gap(5).tooltip(family.description)
            .child(renderAvatar({ kind: "material", family: family.id, name: "home" }, 16, color, label)))))
        .child(input(this.search))
        .child(h_flex().flex_wrap().gap(4).children(categories.map(category => button(t, `category-${category}`, category, cx => {
          this.category = category; this.page = 0; cx.notify();
        }, category === this.category))))
        .child(v_flex().h(236).flex_none().gap(4)
          .when(!shown.length, el => el.child(div().text_size(12).text_color(t.muted).child("No matching icons.")))
          .children(grid))
        .child(h_flex().gap(8).items_center()
          .child(button(t, "icons-prev", "Previous", cx => { this.page = Math.max(0, page - 1); cx.notify(); }))
          .child(div().flex_1().text_size(14).text_color(t.muted).child(`${matches.length} icons · page ${page + 1}/${pages}`))
          .child(button(t, "icons-next", "Next", cx => { this.page = Math.min(pages - 1, page + 1); cx.notify(); }))))
      .child(h_flex().flex_none().gap(12).p(10).border(2).border_color(color).bg((color + "14") as `#${string}`).items_center()
          .child(renderAvatar(this.avatar ?? autoAvatar, 32, color, label, () =>
            this.target.kind === "space" && (this.target.tree || label === "~")
              ? svg(`mods/spaces-status/icons/${this.target.tree ? "account_tree" : "home"}.svg`).size(24).text_color(color)
              : renderAvatar({ kind: "letter" }, 32, color, label)))
          .child(div().flex_1().min_w(0).truncate().text_size(18).child(label))
          .child(div().text_size(14).text_color(t.muted).child("Preview · not saved yet")))
      .when(Boolean(this.error), el => el.child(div().text_size(12).text_color(t.blocked).child(this.error)))
      .child(h_flex().gap(8).items_center()
        .child(button(t, "appearance-reset", "Reset appearance", cx => { this.avatar = undefined; this.setColor("", cx); }))
        .child(div().flex_1())
        .child(button(t, "appearance-cancel", "Cancel", () => closeOverlay(this.overlay)))
        .child(button(t, "appearance-save", "Save", cx => this.save(cx), true)));
  }
}

class SpaceMenu implements AppearanceOverlay {
  private handle: ReturnType<Context["focus_handle"]>;
  private selected = 0;
  constructor(private id: string, private checkout: Checkout, private tree: boolean, private overlay: string, cx: AsyncContext) {
    this.handle = cx.focus_handle();
    this.handle.focus();
  }
  private items(): { label: string; action: () => void }[] {
    const worktree = (action: "new" | "open" | "remove") => openOverlay({
      mod: "worktree", kind: "dialog", width: action === "open" ? 560 : 440,
      height: action === "open" ? 480 : 260, props: { space: this.id, action },
    });
    return [
      { label: "Rename & appearance…", action: () => openAppearance({ kind: "space", id: this.id, tree: this.tree }) },
      ...(this.checkout ? [
        { label: "New worktree", action: () => worktree("new") },
        { label: "Open worktree", action: () => worktree("open") },
      ] : [{ label: "Other space actions…", action: () => openOverlay({ mod: "menu", kind: "popup", width: 220, height: 260, props: { tab: "space", target: { id: this.id } } }) }]),
      ...(this.checkout === "linked" ? [{ label: "Remove worktree", action: () => worktree("remove") }] : []),
      { label: "Close space", action: () => { run("space.close", { id: this.id }); } },
    ];
  }
  render(): Element {
    const t = theme() as Theme, items = this.items();
    const choose = (index: number) => { closeOverlay(this.overlay); items[index]?.action(); };
    return v_flex().id("space-context").track_focus(this.handle).w_full().min_h(0).p(5).bg(t.popover)
      .font_family(UI_FONT).text_size(UI_FONT_SIZE).border(2).border_color(t.border)
      .on_key_down((event, cx) => {
        if (event.key === "down") this.selected = (this.selected + 1) % items.length;
        else if (event.key === "up") this.selected = (this.selected + items.length - 1) % items.length;
        else if (event.key === "enter") choose(this.selected);
        else if (event.key === "escape") closeOverlay(this.overlay);
        else return;
        cx.stop_propagation(); cx.notify();
      })
      .children(items.map((item, index) => div().id(`space-action-${index}`).h(32).px(10).flex().items_center()
        .text_color(t.foreground).cursor_pointer().when(index === this.selected, el => el.bg(t.selected))
        .hover(el => el.bg(t.hover)).on_click(() => choose(index)).child(item.label)));
  }
}
