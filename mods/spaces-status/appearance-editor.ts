import { div } from "gpui-kit";
import type { AsyncContext, Context, Element } from "gpui-kit";
import { h_flex, v_flex, InputState, ScrollHandle } from "gpui-base";
import { closeOverlay, run, shared, setShared, spaces, theme } from "herdr";
import {
  APPEARANCE_KEY, SHARP_INDEX, WORKTREE_AVATAR, machineKey,
  profileFor, readAppearance, record, resolveColor, withProfile,
} from "./appearance-model.js";
import type { AppearanceTarget, AvatarChoice, Theme } from "./appearance-model.js";
import { tint } from "./appearance-colors.js";
import { renderAvatar } from "./appearance-avatar.js";
import { MATERIAL_ICONS } from "./material-catalog.js";
import { PLUSHIES } from "./plush-catalog.js";
import { characterLabel } from "./avatar-labels.js";
import { button as controlButton, textInput, secondary } from "./ui/controls.js";
import { dialogFrame, dialogError, dialogActions, scrollBody } from "./ui/surfaces.js";
import { Menu } from "./ui/menu.js";
import { spaceMenu } from "./presentation/menus.js";
import { openAppearance, openWorktree, closeSpace, overlayProps } from "./overlays.js";
import { machineLabel } from "./presentation/labels.js";
import { CHARACTER_ACCENTS } from "./character-accents.js";
import { UI, SPACING, GALLERY } from "./ui/tokens.js";
import { uiScale } from "./ui/geometry.js";
export { openAppearance, openSpaceMenu } from "./overlays.js";

const PAGE_SIZE = 48;
const CATEGORIES = [...new Set(MATERIAL_ICONS.flatMap(icon => icon.categories))].sort();
export interface AppearanceOverlay { render(cx?: Context): Element; close?(cx: AsyncContext): void | Promise<void> }
type Checkout = "main" | "linked" | null;

function targetFrom(raw: unknown): AppearanceTarget | null {
  const value = record(raw);
  if (value.kind === "space" && typeof value.id === "string") return { kind: "space", id: value.id, tree: value.tree === true };
  if (value.kind === "machine" && (value.machine === null || typeof value.machine === "string"))
    return { kind: "machine", machine: typeof value.machine === "string" ? value.machine : null };
  return null;
}

export function createAppearanceOverlay(raw: unknown, cx: AsyncContext): AppearanceOverlay | null {
  const data = overlayProps(raw), target = targetFrom(data.appearance);
  const overlay = typeof data.overlay === "string" ? data.overlay : "";
  if (target) return new AppearanceEditor(target, overlay, cx);
  const menu = record(data.spaceMenu);
  return typeof menu.id === "string" ? new SpaceMenu(menu.id,
    menu.checkout === "main" || menu.checkout === "linked" ? menu.checkout : null,
    menu.tree === true, overlay, cx) : null;
}

function button(t: Theme, id: string, label: string, action: (cx: Context) => void, selected = false): Element {
  return controlButton(t, id, label, action, { selected });
}

class AppearanceEditor implements AppearanceOverlay {
  private name: InputState;
  private search: InputState;
  private handle: ReturnType<Context["focus_handle"]>;
  private gallery: ReturnType<Context["focus_handle"]>;
  private scroll = ScrollHandle.new();
  private initialName: string;
  private avatar: AvatarChoice | undefined;
  private query = "";
  private category = "all";
  private categoriesOpen = false;
  private page = 0;
  private cursor = 0;
  private columns = 8;
  private error = "";

  constructor(private target: AppearanceTarget, private overlay: string, cx: AsyncContext) {
    const state = readAppearance(shared(APPEARANCE_KEY)), profile = profileFor(state, target);
    const space = target.kind === "space" ? spaces().find(s => s.id === target.id) : null;
    this.initialName = space?.name ?? (target.kind === "machine" ? machineLabel(target.machine) : "");
    this.avatar = profile.avatar;
    this.name = InputState.new({ value: this.initialName, placeholder: "Name" });
    this.search = InputState.new({ placeholder: target.kind === "machine" ? "Search characters…" : "Search icons…" });
    this.name.on("change", (_event, cx) => cx.notify());
    this.name.on("submit", (_event, cx) => this.save(cx));
    this.search.on("change", (_event, cx) => {
      this.query = this.search.value().trim().toLowerCase(); this.page = this.cursor = 0; cx.notify();
    });
    this.handle = cx.focus_handle();
    this.gallery = cx.focus_handle();
    if (target.kind === "space") {
      this.name.set_selected_range({ start: 0, end: this.initialName.length }); this.name.focus();
    } else this.search.focus();
  }

  private save(cx: Context): void {
    const stored = shared(APPEARANCE_KEY), state = readAppearance(stored);
    if (this.target.kind === "space") {
      const id = this.target.id;
      if (!spaces().some(space => space.id === id)) { this.error = "This space is no longer available."; cx.notify(); return; }
      const nextName = this.name.value().trim();
      if (nextName !== this.initialName) run("space.rename", { id, name: nextName });
    }
    const next = withProfile(state, this.target, {
      ...(this.avatar ? { avatar: this.avatar } : {}),
    });
    if (JSON.stringify(next) !== JSON.stringify(stored)) setShared(APPEARANCE_KEY, next);
    closeOverlay(this.overlay);
  }

  render(): Element {
    const t = theme() as Theme, state = readAppearance(shared(APPEARANCE_KEY));
    const target = this.target, isMachine = target.kind === "machine";
    const space = target.kind === "space" ? spaces().find(s => s.id === target.id) : undefined;
    const machine = target.kind === "machine" ? target.machine : space?.machine ?? null;
    const worktree = target.kind === "space" && (target.tree || state.spaceDefaults[target.id]?.worktree);
    const label = isMachine ? this.initialName : this.name.value() || "Automatic name";
    const automatic = target.kind === "machine" ? state.defaults[machineKey(machine)]?.avatar : state.spaceDefaults[target.id]?.avatar;
    const avatar = worktree ? WORKTREE_AVATAR : this.avatar ?? automatic;
    const color = target.kind === "machine" ? avatar?.kind === "plush" ? CHARACTER_ACCENTS[avatar.id] : t.ansi6
      : resolveColor(record(shared("space.colors"))[target.id] as string, t);
    const choices: { id: string; label: string; avatar: AvatarChoice }[] = isMachine
      ? PLUSHIES.filter(p => characterLabel(p.id).toLowerCase().includes(this.query)).map(p =>
        ({ id: `avatar-plush-${p.id}`, label: characterLabel(p.id), avatar: { kind: "plush", id: p.id } }))
      : MATERIAL_ICONS.filter(icon => icon.codes[SHARP_INDEX] != null
        && (this.category === "all" || icon.categories.includes(this.category))
        && (!this.query || icon.search.includes(this.query) || icon.name.includes(this.query))).map(icon =>
        ({ id: `material-${icon.name}`, label: icon.name.replace(/_/g, " "), avatar: { kind: "material", family: "sharp", name: icon.name } }));
    const pages = Math.max(1, Math.ceil(choices.length / PAGE_SIZE)), page = Math.min(this.page, pages - 1);
    const shown = choices.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const field = (text: string) => secondary(t, text);
    const input = (value: InputState) => textInput(t, value);
    const select = (index: number, cx: Context) => {
      if (shown[index]) { this.avatar = shown[index].avatar; this.cursor = index; cx.notify(); }
    };
    const gallery = h_flex().id("avatar-gallery").justify_center().track_focus(this.gallery).tab_index(0)
      .role("list_box").accessibility_label(isMachine ? "Characters" : "Icons")
      .on_size_change((size, cx) => {
        const columns = Math.max(1, Math.floor((size.width / uiScale() + GALLERY.gap) / (GALLERY.cell + GALLERY.gap)));
        if (columns !== this.columns) { this.columns = columns; cx.notify(); }
      })
      .on_key_down((event, cx) => {
        const steps: Record<string, number> = { left: -1, right: 1, up: -this.columns, down: this.columns };
        if (event.key in steps && shown.length) {
          this.cursor = Math.max(0, Math.min(shown.length - 1, this.cursor + steps[event.key])); cx.notify();
        } else if (event.key === "enter" || event.key === "space") select(this.cursor, cx);
        else return;
        cx.stop_propagation();
      })
      // Center the complete column grid, not each incomplete row independently:
      // keyboard up/down must still land in the same visual column.
      .child(h_flex().id("avatar-grid").w(this.columns * (GALLERY.cell + GALLERY.gap) - GALLERY.gap).max_w_full()
        .flex_wrap().gap(GALLERY.gap).children(shown.map((item, index) => {
        const selected = JSON.stringify(item.avatar) === JSON.stringify(avatar);
        return div().id(item.id).size(GALLERY.cell).flex_none().flex().items_center().justify_center()
          .border(UI.stroke).border_color(selected ? color : t.border).bg(selected ? tint(color, t.popover, .15) : t.raised)
          .when(this.gallery.is_focused() && index === this.cursor, el => el.border_color(t.foreground))
          .role("list_box_option").aria_selected(selected).accessibility_label(item.label)
          .tooltip(item.label).cursor_pointer().hover(el => el.bg(t.hover))
          .on_click((_event, cx) => { this.gallery.focus(); select(index, cx); })
          .child(renderAvatar(item.avatar, isMachine ? 36 : 24, color, label));
      })));
    const colorNote = field(isMachine ? "Group color follows the character’s accent."
      : worktree ? "Worktree · parent color · fixed Git tree icon" : `Color assigned by ${machineLabel(machine)}`);
    return dialogFrame(t, "appearance-editor", isMachine ? "Machine appearance" : "Space appearance",
      this.handle, () => closeOverlay(this.overlay), "appearance-close", (event, cx) => {
        if (event.key === "enter" && (event.modifiers.control || event.modifiers.platform)) { cx.stop_propagation(); this.save(cx); }
      })
      .child(scrollBody("appearance-scroll", this.scroll)
        .when(!isMachine, el => el.child(field("Name")).child(input(this.name)))
        .child(colorNote)
        .when(!worktree, el => el.child(h_flex().gap(SPACING.row.gap).items_center()
          .child(div().flex_1().text_size(14).font_semibold().child(isMachine ? "Character" : "Icon"))
          .child(button(t, isMachine ? "avatar-auto" : "appearance-reset", "Default", cx => { this.avatar = undefined; cx.notify(); }, !this.avatar)
            .tooltip("Use the saved random choice")))
        .child(div().id("appearance-search").flex_none().on_key_down((event, cx) => {
           if (event.key === "down") { cx.stop_propagation(); this.gallery.focus(); cx.notify(); }
         }).child(input(this.search)))
        .when(!isMachine, el => el.child(button(t, "categories", this.category === "all" ? "Categories" : this.category,
          cx => { this.categoriesOpen = !this.categoriesOpen; cx.notify(); }, this.categoriesOpen)))
        .when(!isMachine && this.categoriesOpen, el => el.child(h_flex().flex_wrap().gap(SPACING.metadata.gap).children(["all", ...CATEGORIES].map(category =>
          button(t, `category-${category}`, category, cx => {
            this.category = category; this.page = this.cursor = 0; this.categoriesOpen = false; cx.notify();
          }, category === this.category)))))
        .child(gallery)
        .when(!shown.length, el => el.child(field("No matches.")))
        .when(pages > 1, el => el.child(h_flex().flex_wrap().gap(SPACING.row.gap).items_center()
          .child(button(t, "icons-prev", "Previous", cx => { this.page = Math.max(0, page - 1); this.cursor = 0; cx.notify(); }))
          .child(div().flex_1().min_w(0).text_size(12).text_color(t.muted).child(`${choices.length} icons · ${page + 1}/${pages}`))
          .child(button(t, "icons-next", "Next", cx => { this.page = Math.min(pages - 1, page + 1); this.cursor = 0; cx.notify(); }))))))
      .child(v_flex().flex_none().gap(SPACING.row.gap).p(SPACING.panel.inset).border(UI.stroke).border_color(tint(color, t.popover, .45)).bg(tint(color, t.popover, .06))
        .child(h_flex().gap(SPACING.row.gap).items_center()
          .child(renderAvatar(avatar, isMachine ? 36 : 24, color, label))
          .child(div().flex_1().min_w(0).truncate().font_semibold().child(label))))
      .when(Boolean(this.error), el => el.child(dialogError(t, this.error)))
      .child(dialogActions()
        .child(div().flex_1())
        .child(button(t, "appearance-cancel", "Cancel", () => closeOverlay(this.overlay)))
        .child(button(t, "appearance-save", "Save", cx => this.save(cx), true)));
  }
}

class SpaceMenu implements AppearanceOverlay {
  private menu: Menu;
  constructor(private id: string, private checkout: Checkout, private tree: boolean, private overlay: string, cx: AsyncContext) {
    this.menu = new Menu(cx, () => closeOverlay(this.overlay));
  }
  private items(): { label: string; action: () => void }[] {
    return spaceMenu(this.checkout).map(item => ({ label: item.label, action: () => {
      if (item.action === "appearance") openAppearance({ kind: "space", id: this.id, tree: this.tree });
      else if (item.action === "close") closeSpace(this.id);
      else openWorktree(this.id, item.action);
    } }));
  }
  render(): Element {
    return this.menu.render(theme() as Theme, "space-context", this.items().map((item, index) => ({ ...item, id: `space-action-${index}` })));
  }
}
