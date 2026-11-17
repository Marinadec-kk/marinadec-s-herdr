// Small original bitmap glyphs. Program/harness logos keep their own artwork.
import { div, image, svg } from "gpui-kit";
import type { Color, Element } from "gpui-kit";
import type { Program, Status } from "herdr";
import type { Theme } from "./appearance-model.js";
import { iconButton } from "./ui/controls.js";
import type { Action, ControlOptions } from "./ui/controls.js";
import { statusWord } from "./presentation/status.js";
import { statusBadge } from "./ui/status.js";

const GLYPHS = {
  plus: ["0001000", "0001000", "0001000", "1111111", "0001000", "0001000", "0001000"],
  close: ["1100011", "1110111", "0111110", "0011100", "0111110", "1110111", "1100011"],
  down: ["0000000", "1100011", "0110110", "0011100", "0001000", "0000000", "0000000"],
  right: ["0100000", "0110000", "0011000", "0001100", "0011000", "0110000", "0100000"],
  search: ["0111000", "1101100", "1000100", "1101100", "0111000", "0001100", "0000110"],
  sidebar: ["1111111", "1010001", "1010001", "1010001", "1010001", "1010001", "1111111"],
  settings: ["0011100", "0111110", "1100011", "1101011", "1100011", "0111110", "0011100"],
  monitor: ["1111111", "1000001", "1000001", "1000001", "1111111", "0001000", "0011100"],
  server: ["1111111", "1000101", "1111111", "0000000", "1111111", "1000101", "1111111"],
  file: ["1111100", "1001110", "1000111", "1000001", "1000001", "1000001", "1111111"],
  branch: ["1100011", "1100011", "0100010", "0111110", "0100000", "1100000", "1100000"],
  split: ["1111111", "1001001", "1001001", "1001001", "1001001", "1001001", "1111111"],
  splitDown: ["1111111", "1000001", "1000001", "1111111", "1000001", "1000001", "1111111"],
  zoom: ["1111111", "1000001", "1011101", "1010101", "1011101", "1000001", "1111111"],
  minimize: ["0000000", "0000000", "0000000", "0000000", "0000000", "1111111", "1111111"],
  terminal: ["0000000", "1100000", "0110000", "0011000", "0110000", "1101111", "0000000"],
} as const;
export type PixelGlyph = keyof typeof GLYPHS;

export function programIcon(program: Program | null | undefined, size: number, color: Color): Element | null {
  if (!program?.icon) return null;
  return program.tint ? svg(program.icon).size(size).flex_none().text_color(color)
    : image(program.icon).size(size).flex_none();
}

export function pixelIcon(name: PixelGlyph, color: Color, size = 14): Element {
  const unit = size / 7;
  return div().relative().size(size).flex_none().children(GLYPHS[name].flatMap((row, y) =>
    [...row].flatMap((bit, x) => bit === "1"
      ? [div().absolute().left(x * unit).top(y * unit).w(unit).h(unit).bg(color)] : [])));
}

export function pixelButton(t: Theme, id: string, glyph: PixelGlyph, hint: string, action: Action, options: ControlOptions = {}): Element {
  return iconButton(t, id, hint, pixelIcon(glyph, t.muted), action, options);
}

export function pixelStatus(t: Theme, status: Status | null, label = statusWord(status)): Element | null {
  return status ? statusBadge(t, status, label) : null;
}
