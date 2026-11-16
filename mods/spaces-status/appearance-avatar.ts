import { div, image } from "gpui-kit";
import type { Color, Element } from "gpui-kit";
import { MATERIAL_FAMILIES, UI_FONT } from "./appearance-model.js";
import type { AvatarChoice } from "./appearance-model.js";
import { MATERIAL_ICONS } from "./material-catalog.js";
import { PLUSHIES } from "./plush-catalog.js";

const icons = new Map(MATERIAL_ICONS.map(icon => [icon.name, icon]));

export function renderAvatar(
  choice: AvatarChoice | undefined,
  size: number,
  color: Color,
  name: string,
  fallback?: () => Element,
): Element {
  if (!choice && fallback) return fallback();
  if (choice?.kind === "plush") {
    const plush = PLUSHIES.find(p => p.id === choice.id);
    if (plush) return div().size(size).flex_none().relative().overflow_hidden()
      .child(image(`mods/spaces-status/icons/plushies/${plush.id}.png`).absolute().left(0).top(0)
        .w(size * plush.width / plush.frameWidth).h(size * plush.height / plush.frameHeight));
  }
  if (choice?.kind === "pixel") return image(`mods/spaces-status/icons/machines/${choice.name}.svg`).w(size).h(size).flex_none();
  if (choice?.kind === "material") {
    const family = MATERIAL_FAMILIES.findIndex(f => f.id === choice.family);
    const code = icons.get(choice.name)?.codes[family];
    if (code != null) return div().size(size).flex_none().flex().items_center().justify_center()
      .font_family(MATERIAL_FAMILIES[family].font).text_size(size).text_color(color).child(String.fromCodePoint(code));
  }
  return div().size(size).flex_none().flex().items_center().justify_center()
    .font_family(UI_FONT).text_size(size * 0.9).font_bold().text_color(color).child([...name][0]?.toUpperCase() ?? "?");
}
