import { svg } from "gpui-kit";
import { h_flex } from "gpui-base";

export const STATES = ["working", "blocked", "done", "idle", null];
export const LABELS = {
  working: "Работает", blocked: "Нужен ответ", done: "Завершил", idle: "В простое",
};
const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };

export const aggregate = sessions => sessions.reduce((state, session) =>
  (RANK[session.status] ?? 0) > (RANK[state] ?? 0) ? session.status : state, null);
export const stateLabel = state => LABELS[state] ?? "Без статуса";

// Prototype only. Every state keeps the same bounds; animation never rotates
// outside the slot. Empty slots are real empty space, not an "unknown" dot.
export function statusBadge(t, state, { compact = false, label = stateLabel(state) } = {}) {
  const slot = compact ? 10 : 16, size = compact ? 8 : 12;
  const el = h_flex().size(slot).flex_none().items_center().justify_center();
  if (!state || !STATES.includes(state)) return el;
  const glyph = svg(`mods/status-review/status-${state}.svg`).size(size).flex_none().text_color(t[state])
    .when(state === "working", el => el.loop("opacity", { from: .4, to: 1, period: 1100 }));
  return el.tooltip(label).accessibility_label(label).child(glyph);
}
