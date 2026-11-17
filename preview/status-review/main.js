// Review-only scene with synthetic data. No live spaces/agents, polling,
// terminal commands, preference writes or network access.
import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { checking, props, run, setWindowTitle, theme } from "herdr";
import { renderAvatar } from "./appearance-avatar.js";
import { tint, tonePalette } from "./appearance-colors.js";
import { pixelIcon, pixelStatus } from "./pixel-ui.js";
import { button, iconButton } from "./ui/controls.js";
import { STATES, aggregate, stateLabel, statusBadge } from "./status.js";
import { MACHINES, fixtures, spaceTip } from "./fixtures.js";
import { project, segments } from "./tree.js";

export default class StatusReview extends View {
  init() {
    const p = props() ?? {};
    this.railWidth = [44, 76, 159].includes(p.railWidth) ? p.railWidth : 44;
    this.wideWidth = p.wideWidth === 340 ? 340 : 299;
    this.rows = fixtures();
    this.selected = this.rows.some(row => row.id === p.selected) ? p.selected : "atlas";
    this.selectedSession = this.rows.find(row => row.id === this.selected).sessions[0]?.id;
    this.folded = new Set(Array.isArray(p.folded) ? p.folded : []);
    if (!checking()) setWindowTitle("Herdr · статусы — тестовое превью");
  }

  select(row, cx, session = row.sessions[0]) {
    this.selected = row.id; this.selectedSession = session?.id; cx.notify();
  }

  color(row, t) {
    const base = MACHINES.find(machine => machine.id === row.machine).color;
    return tonePalette(base, parseInt(t.chrome.slice(1, 3), 16) < 128)[row.tone];
  }

  tip(row) {
    return `${spaceTip(row, this.rows)}\n${row.sessions.length
      ? row.sessions.map(session => `${session.program} · ${session.name}: ${stateLabel(session.status)}`).join("\n")
      : "Нет агента — только терминал"}`;
  }

  railRow(row, t) {
    const on = this.selected === row.id, fill = this.color(row, t);
    const height = row.depth ? 28 : 32, size = row.depth ? 14 : 18;
    const cluster = (this.railWidth - 44) / 2;
    return h_flex().id(`rail-${row.id}`).relative().w_full().h(height).flex_none()
      .bg(tint(fill, t.chrome, on ? .24 : .07))
      .when(!on, el => el.hover(style => style.bg(t.hover)))
      .cursor_pointer().tooltip(this.tip(row))
      .on_click((_event, cx) => this.select(row, cx))
      .children(segments(row, height).map(([x, y, w, h]) => div().absolute().left(cluster + x).top(y).w(w).h(h).bg(tint(fill, t.chrome, .65))))
      .when(on, el => el.child(div().absolute().left(-4).top(5).bottom(5).w(2).bg(t.foreground)))
      .child(div().absolute().left(cluster + (row.depth ? 8 : 4)).top((height - size) / 2)
        .child(renderAvatar({ kind: "material", family: "sharp", name: row.icon }, size, fill, row.name)))
      .child(div().absolute().left(cluster + 22).top((height - 10) / 2)
        .child(statusBadge(t, aggregate(row.sessions), { compact: true, label: this.tip(row) })));
  }

  rail(t) {
    return v_flex().w(this.railWidth).flex_none().bg(t.chrome).py(6)
      .children(MACHINES.map((machine, index) =>
        v_flex().w_full().flex_none().when(index > 0, el => el.mt(12))
          .child(v_flex().mx(2).pb(4).border(2).border_color(tint(machine.color, t.chrome, .4))
            .child(h_flex().h(40).flex_none().justify_center().items_center()
              .tooltip(`${machine.name} · подключено (не статус агента)`)
              .child(renderAvatar({ kind: "plush", id: machine.character }, 28, machine.color, machine.name)))
            .child(v_flex().mx(2)
              .children(project(this.rows).map(row => ({ ...row, children: this.rows.some(child => child.parent === row.id) }))
                .filter(row => row.machine === machine.id).map(row => this.railRow(row, t)))))));
  }

  wideRow(row, t) {
    const on = this.selected === row.id, fill = this.color(row, t), folded = this.folded.has(row.id);
    const title = h_flex().id(`wide-${row.id}`).h(row.depth ? 28 : 32).px(8).gap(6).items_center()
      .cursor_pointer().tooltip(this.tip(row)).on_click((_event, cx) => this.select(row, cx))
      .child(renderAvatar({ kind: "material", family: "sharp", name: row.icon }, row.depth ? 16 : 20, fill, row.name))
      .child(div().flex_1().min_w(0).truncate().text_size(row.depth ? 12 : 14).child(row.name))
      .child(h_flex().w(24).flex_none().items_center().justify_center()
        .child(pixelIcon("branch", t.dim, 12)).tooltip("Создание worktree в макете отключено"))
      .child(h_flex().w(24).flex_none().items_center().justify_center()
        .when(row.sessions.length > 0, el => el.child(iconButton(t, `fold-${row.id}`, folded ? "Показать сессии" : "Скрыть сессии",
          pixelIcon(folded ? "right" : "down", t.muted, 12), cx => {
            folded ? this.folded.delete(row.id) : this.folded.add(row.id); cx.notify();
          }, { quiet: true }))))
      // The column is reserved even when the expanded space delegates to sessions.
      .child(statusBadge(t, folded ? aggregate(row.sessions) : null, { label: this.tip(row) }));
    return v_flex().flex_none().mb(4)
      .border(2).border_color(tint(fill, t.chrome, on ? .6 : .22)).bg(tint(fill, t.chrome, on ? .08 : .025))
      .child(title)
      .when(!folded, el => el.children(row.sessions.map(session =>
        h_flex().id(`session-${session.id}`).h(28).pl(12).pr(8).gap(6).items_center()
          .when(on && session.id === this.selectedSession, el => el.bg(tint(fill, t.chrome, .2)))
          .cursor_pointer().hover(style => style.bg(t.hover))
          .on_click((_event, cx) => this.select(row, cx, session))
          .tooltip(`${row.name} → ${session.program} · ${session.name}: ${stateLabel(session.status)}`)
          .child(div().size(14).flex_none().border(1).border_color(t.border).text_size(10).text_color(t.muted)
            .flex().items_center().justify_center().child(session.letter).tooltip(session.program))
          .child(div().flex_1().min_w(0).truncate().text_size(13).child(session.name))
          .child(statusBadge(t, session.status, { label: `${session.program} · ${session.name}: ${stateLabel(session.status)}` })))));
  }

  wideBranch(row, t) {
    const children = this.rows.filter(child => child.parent === row.id);
    return v_flex().relative().flex_none()
      .when(row.parent, el => el.child(div().absolute().left(-8).top(0).w(2).h(16).bg(this.color(row, t)))
        .child(div().absolute().left(-8).top(16).w(8).h(2).bg(this.color(row, t)))
        .when(!row.last, el => el.child(div().absolute().left(-8).top(16).bottom(0).w(2).bg(this.color(row, t)))))
      .child(this.wideRow(row, t))
      .when(children.length, el => el.child(v_flex().pl(12)
        .children(children.map((child, index) => this.wideBranch({ ...child, last: index === children.length - 1 }, t)))));
  }

  wide(t) {
    return v_flex().w(this.wideWidth).flex_none().bg(t.chrome).p(8)
      .children(MACHINES.map((machine, index) =>
        v_flex().flex_none().when(index > 0, el => el.mt(12))
          .child(h_flex().h(44).gap(8).items_center()
            .child(renderAvatar({ kind: "plush", id: machine.character }, 32, machine.color, machine.name))
            .child(v_flex().flex_1().min_w(0)
              .child(div().text_size(16).font_semibold().child(machine.name))
              .child(div().text_size(11).text_color(t.muted).child("подключено · только тестовые данные"))))
          .children(this.rows.filter(row => row.machine === machine.id && !row.parent).map(row => this.wideBranch(row, t)))));
  }

  panel(t, title) {
    return v_flex().min_h(0).border(2).border_color(t.border).bg(t.chrome)
      .child(div().h(36).px(12).flex().items_center().font_semibold().border_b(2).border_color(t.border).child(title));
  }

  legend(t) {
    const pair = (state, old) => h_flex().w(76).flex_none().gap(14).items_center().justify_center()
      .child(old ? pixelStatus(t, state) ?? div().size(16) : statusBadge(t, state))
      .child(old ? div().size(state === "blocked" || state === "done" ? 5 : 3).bg(t[state] ?? t.unknown)
        : statusBadge(t, state, { compact: true }));
    return v_flex().gap(4)
      .child(h_flex().h(24).gap(12).text_size(11).text_color(t.muted)
        .child(div().flex_1().child("СОСТОЯНИЕ")).child(div().w(76).child("БЫЛО: ш / у")).child(div().w(76).child("МАКЕТ: ш / у")))
      .children(STATES.map(state => h_flex().h(36).gap(12).items_center().border_b(1).border_color(t.border)
        .child(div().flex_1().text_size(13).child(state ? stateLabel(state) : "Нет агента"))
        .child(pair(state, true)).child(pair(state, false))))
      .child(div().mt(6).text_size(12).text_color(t.muted)
        .child("Песочные часы пульсируют без вращения.\nРазмер слота не зависит от состояния.\nНет агента — нет ложной серой точки."));
  }

  inspector(t) {
    const row = this.rows.find(row => row.id === this.selected);
    const session = row.sessions.find(session => session.id === this.selectedSession) ?? row.sessions[0];
    return v_flex().gap(8)
      .child(div().text_size(15).font_semibold().child("Попробуй переключить"))
      .child(div().text_size(12).text_color(t.muted).child("Кликни спейс или сессию в любой колонке.\nНаведение покажет, чей именно это статус."))
      .child(div().text_size(14).font_semibold().child(row.name))
      .child(div().text_size(12).text_color(t.muted).child(session ? `${session.program} · ${session.name}` : "Только терминал — без агента"))
      .child(h_flex().flex_wrap().gap(6).children(STATES.filter(Boolean).map(state =>
        button(t, `set-${state}`, stateLabel(state), cx => { session.status = state; cx.notify(); },
          { selected: session?.status === state, disabled: !session }).h(28).px(8).text_size(12))))
      .child(h_flex().gap(8).items_center().child(statusBadge(t, aggregate(row.sessions)))
        .child(div().text_size(12).text_color(t.muted).child(`Сводный статус спейса: ${stateLabel(aggregate(row.sessions))}`)))
      .child(div().text_size(12).text_color(t.muted)
        .child("Приоритет: нужен ответ → завершил → работает → простой.\nУ cross_analysis две сессии: сводка может отличаться\nот состояния одной выбранной сессии."));
  }

  render() {
    const t = theme(), dark = parseInt(t.chrome.slice(1, 3), 16) < 128;
    const selected = this.rows.find(row => row.id === this.selected);
    const modeButton = (id, label, on, action) => button(t, id, label, action, { selected: on }).h(28).px(8).text_size(12);
    return v_flex().size_full().min_w(0).font_family("Liberation Sans").text_size(14).text_color(t.foreground).bg(t.canvas)
      .child(h_flex().h(72).px(20).gap(14).items_center().flex_none().bg(t.chrome).border_b(2).border_color(t.border)
        .child(v_flex().flex_1().min_w(0).gap(4)
          .child(div().text_size(19).font_semibold().child("СТАТУСЫ / ТЕСТОВОЕ ПРЕВЬЮ"))
          .child(div().text_size(12).text_color(t.muted).child("Синтетические данные · основной интерфейс не изменён")))
        .child(modeButton("dark", "Тёмная", dark, () => run("app.theme", { name: "ink" })))
        .child(modeButton("light", "Светлая", !dark, () => run("app.theme", { name: "paper" }))))
      .child(h_flex().flex_1().min_h(0).p(16).gap(16).items_stretch()
        .child(this.panel(t, `Узкий · ${this.railWidth} px`).w(Math.max(154, this.railWidth + 20)).flex_none()
          .child(h_flex().p(8).gap(4).children([44, 76, 159].map(width =>
            modeButton(`rail-${width}`, String(width), this.railWidth === width, cx => { this.railWidth = width; cx.notify(); }))))
          .child(v_flex().flex_1().min_h(0).items_center().overflow_y_scrollbar().child(this.rail(t))))
        .child(this.panel(t, `Широкий · ${this.wideWidth} px`).w(this.wideWidth + 20).flex_none()
          .child(h_flex().p(8).gap(6).children([299, 340].map(width =>
            modeButton(`wide-${width}`, String(width), this.wideWidth === width, cx => { this.wideWidth = width; cx.notify(); }))))
          .child(v_flex().flex_1().min_h(0).items_center().overflow_y_scrollbar().child(this.wide(t))))
        .child(this.panel(t, "Разбор состояний").flex_1().min_w(330)
          .child(v_flex().flex_1().min_h(0).p(16).gap(20).overflow_y_scrollbar()
            .child(this.legend(t))
            .child(div().h(2).flex_none().bg(t.border))
            .child(this.inspector(t))
            .child(div().text_size(12).text_color(t.muted)
              .child("Выбор — светлая полоска слева + заливка.\nСтатус — отдельный слот справа.\nПодключение машины не изображается статусом агента.\nСтрелки в широком режиме сворачивают сессии.")))))
      .child(h_flex().h(36).flex_none().px(18).gap(10).items_center().bg(t.chrome).border_t(2).border_color(t.border)
        .child(div().flex_1().min_w(0).truncate().child(spaceTip(selected, this.rows)))
        .child(div().text_size(12).text_color(t.muted).child("Макет · реальные терминалы не затронуты")));
  }
}
