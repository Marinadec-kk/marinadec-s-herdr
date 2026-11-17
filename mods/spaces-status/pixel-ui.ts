// Small original bitmap glyphs. Program/harness logos keep their own artwork.
import { image, svg } from "gpui-kit";
import type { Color, Element } from "gpui-kit";
import type { Program, Status } from "herdr";
import type { Theme } from "./appearance-model.js";
import { iconButton } from "./ui/controls.js";
import type { Action, ControlOptions } from "./ui/controls.js";
import { statusWord } from "./presentation/status.js";
import { statusBadge } from "./ui/status.js";

import type { PixelGlyph } from "./ui/glyphs.js";
export type { PixelGlyph } from "./ui/glyphs.js";

export function programIcon(program: Program | null | undefined, size: number, color: Color): Element | null {
  if (!program?.icon) return null;
  return program.tint ? svg(program.icon).size(size).flex_none().text_color(color)
    : image(program.icon).size(size).flex_none();
}

export function pixelIcon(name: PixelGlyph, color: Color, size = 14): Element {
  return svg(`mods/spaces-status/icons/ui/${name}.svg`).size(size).flex_none().text_color(color);
}

export function pixelButton(t: Theme, id: string, glyph: PixelGlyph, hint: string, action: Action, options: ControlOptions = {}): Element {
  return iconButton(t, id, hint, pixelIcon(glyph, t.muted), action, options);
}

export function pixelStatus(t: Theme, status: Status | null, label = statusWord(status)): Element | null {
  return status ? statusBadge(t, status, label) : null;
}
