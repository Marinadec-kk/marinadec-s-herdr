// Small original bitmap glyphs. Program/harness logos keep their own artwork.
import { image, svg } from "gpui-kit";
import { iconButton } from "./ui/controls.js";
import { statusWord } from "./presentation/status.js";
import { statusBadge } from "./ui/status.js";
export function programIcon(program, size, color) {
    if (!program?.icon)
        return null;
    return program.tint ? svg(program.icon).size(size).flex_none().text_color(color)
        : image(program.icon).size(size).flex_none();
}
export function pixelIcon(name, color, size = 14) {
    return svg(`mods/spaces-status/icons/ui/${name}.svg`).size(size).flex_none().text_color(color);
}
export function pixelButton(t, id, glyph, hint, action, options = {}) {
    return iconButton(t, id, hint, pixelIcon(glyph, t.muted), action, options);
}
export function pixelStatus(t, status, label = statusWord(status)) {
    return status ? statusBadge(t, status, label) : null;
}
