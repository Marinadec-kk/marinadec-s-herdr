import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, props } from "herdr";
import { createPixelChrome } from "./pixel-chrome.js";
import { pixelIcon } from "./pixel-ui.js";
import { GLYPHS } from "./ui/glyphs.js";
import { pane, setReviewWidth } from "./host.js";
import Spaces from "./sidebar.js";
import { CHROME } from "./ui/tokens.js";
import { createAppearanceOverlay } from "./appearance-editor.js";
import { createView } from "./views/index.js";
import { Menu } from "./ui/menu.js";

export default class Review extends View {
  init(_p, cx) {
    this.page = props()?.page ?? "chrome";
    if (this.page === "palette") console.log("[review-palette] " + JSON.stringify(theme()));
    this.panes = Array.from({ length: 6 }, () => createPixelChrome({ chrome: "pane" }));
    this.status = Array.from({ length: 3 }, () => createPixelChrome({ chrome: "status" }));
    this.tabs = createPixelChrome({ chrome: "tabs" });
    this.widths = props()?.sidebarWidth ? [props().sidebarWidth] : [44, 76, 159, 299, 340];
    // Real production renderer, without even synthetic polling/background jobs.
    this.sidebars = this.widths.map(() => {
      const sidebar = new Spaces();
      sidebar.init({}, { spawn() {}, timer: { every() {} } });
      sidebar.machines = [{ name: "devbox", state: "connected" }];
      return sidebar;
    });
    this.brand = createPixelChrome({ chrome: "brand" });
    this.footer = createPixelChrome({ chrome: "footer" });
    this.appearance = ["appearance", "machine"].includes(this.page)
      ? createAppearanceOverlay({ appearance: this.page === "machine"
        ? { kind: "machine", machine: null } : { kind: "space", id: "s" }, overlay: "x" }, cx) : null;
    this.panel = ["files", "changes", "picker", "rename", "confirm-close", "machine-add", "worktree"].includes(this.page)
      ? createView({ view: this.page, id: "t", kind: "tab", space: "s", action: "new" }, cx) : null;
    this.menu = this.page === "menu" ? new Menu(cx, () => {}) : null;
  }
  render() {
    const t = theme();
    const root = v_flex().size_full().min_w(0).min_h(0).font_family("Liberation Sans").text_size(14)
      .bg(t.background).text_color(t.foreground);
    if (this.page === "sidebar") return root.overflow_x_scrollbar().child(h_flex().h_full().p(16).gap(16)
      .children(this.widths.map((width, i) => {
        setReviewWidth(width);
        return v_flex().w(width).flex_none().h_full()
          .child(div().h(24).flex_none().child(`${width} px`))
          .child(div().h(CHROME.brand).flex_none().child(this.brand.render()))
          .child(div().flex_1().min_h(0).child(this.sidebars[i].render()))
          .child(div().h(CHROME.footer).flex_none().child(this.footer.render()));
      })));
    if (this.appearance || this.panel) {
      const width = ["files", "changes"].includes(this.page) ? 368 : this.page === "appearance" ? 640 : 560;
      return root.items_center().justify_center().child(div().w(width).max_w_full().h(640).max_h_full()
        .child((this.appearance ?? this.panel).render()));
    }
    if (this.menu) return root.p(20).child(div().w(280).child(this.menu.render(t, "review-menu", [
      { id: "long", label: "Очень длинное название пункта, которое не должно выходить за границы", hint: "Ctrl+Shift+P", action() {} },
      { id: "disabled", label: "Unavailable action", enabled: false, action() {} },
      { id: "normal", label: "Close pane", action() {} },
    ])));
    return root.id("review-scroll").overflow_y_scrollbar().p(20).gap(12)
      .child(div().text_size(20).child("UI review · synthetic data"))
      .children([10, 12, 14, 18].map(size => h_flex().flex_none().flex_wrap().gap(14).items_center()
        .child(div().w(20).child(String(size)))
        .children(Object.keys(GLYPHS).map(name => pixelIcon(name, t.foreground, size)))))
      .child(div().h(42).flex_none().child(this.tabs.render()))
      .children([220, 420, 680, 680, 680, 680].map((width, i) => {
        const status = ["blocked", "working", "done", "idle", null, "blocked"][i];
        pane.status = status;
        // Exercise the actual production render in both visibility states.
        this.panes[i].hovered = i === 1 || i === 5;
        this.panes[i].keyboardControls = i === 0;
        return v_flex().flex_none().gap(4)
          .child(div().text_size(12).child(`${width} px · ${status ?? "no status"}${i === 0 ? " · keyboard" : this.panes[i].hovered ? " · hover" : ""}`))
          .child(div().w(width).max_w_full().h(32).child(this.panes[i].render()));
      }))
      .children([220, 480, 900].map((width, i) => div().w(width).max_w_full().h(28).flex_none().child(this.status[i].render())));
  }
}
