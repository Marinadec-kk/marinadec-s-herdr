import { svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { statusWord } from "../presentation/status.js";
import { UI } from "./tokens.js";
// One size per mode, including empty slots; native animation stays in bounds.
export function statusBadge(t, status, label = statusWord(status), compact = false) {
    const el = h_flex().size(compact ? UI.statusCompact : UI.status).flex_none().items_center().justify_center();
    if (!status)
        return el;
    return el.tooltip(label).child(svg("mods/spaces-status/icons/status/" + status + ".svg").size(compact ? 8 : 12).flex_none().text_color(t[status])
        .when(status === "working", el => el.loop("opacity", { from: .4, to: 1, period: 1100 })));
}
