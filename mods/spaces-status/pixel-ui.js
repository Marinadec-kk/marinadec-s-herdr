// Small original bitmap glyphs. Program/harness logos keep their own artwork.
import { div, image, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { iconButton } from "./ui/controls.js";
import { tint } from "./appearance-colors.js";
import { statusWord } from "./presentation/status.js";
import { UI } from "./ui/tokens.js";
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
};
export function programIcon(program, size, color) {
    if (!program?.icon)
        return null;
    return program.tint ? svg(program.icon).size(size).flex_none().text_color(color)
        : image(program.icon).size(size).flex_none();
}
export function pixelIcon(name, color, size = 14) {
    const unit = size / 7;
    return div().relative().size(size).flex_none().children(GLYPHS[name].flatMap((row, y) => [...row].flatMap((bit, x) => bit === "1"
        ? [div().absolute().left(x * unit).top(y * unit).w(unit).h(unit).bg(color)] : [])));
}
export function pixelButton(t, id, glyph, hint, action, options = {}) {
    return iconButton(t, id, hint, pixelIcon(glyph, t.muted), action, options);
}
export function pixelStatus(t, status, label = statusWord(status)) {
    if (!status)
        return null;
    if (status === "working")
        return div().size(10).flex_none().relative().spin(1000).tooltip(label)
            .child(div().absolute().left(0).top(0).size(4).bg(t.working))
            .child(div().absolute().right(0).bottom(0).size(4).bg(t.working));
    if (status === "blocked")
        return h_flex().size(14).flex_none().items_center().justify_center()
            .bg(tint(t.blocked, t.chrome, .15)).text_size(14).text_color(t.blocked).tooltip(label).child("!");
    return div().size(6).flex_none().tooltip(label)
        .when(status === "idle", el => el.border(UI.stroke).border_color(t.idle ?? t.dim))
        .when(status !== "idle", el => el.bg(t.done));
}
