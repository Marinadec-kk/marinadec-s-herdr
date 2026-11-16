// Host mock: exercises real compiled handlers without touching Herdr or terminals.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { APPEARANCE_KEY, ensureMachineDefaults, readAppearance } from "../mods/spaces-status/appearance-model.js";

function element(kind) {
  const node = { kind, kids: [], props: {}, events: {} };
  const proxy = new Proxy(node, {
    get(object, key) {
      if (key in object) return object[key];
      if (typeof key !== "string" || key === "then") return undefined;
      return (...args) => {
        if (key === "child") node.kids.push(...args.filter(v => v != null));
        else if (key === "children") node.kids.push(...args[0].flat().filter(v => v != null));
        else if (key === "when") return args[0] ? args[1](proxy) : proxy;
        else if (key.startsWith("on_")) {
          const event = typeof args[0] === "string" ? `${key}:${args[0]}` : key;
          node.events[event] = args.at(-1);
        } else node.props[key] = args[0] ?? true;
        return proxy;
      };
    },
  });
  return proxy;
}

function environment() {
  const env = {
    inputs: [], values: new Map(), calls: new Map(), commands: [], opened: [], closed: [], writes: [],
    timers: 0, spawns: 0, notifications: 0, props: {}, scrolls: [], panes: [], agents: [], terminals: [],
    layout: { id: "root", children: [{ id: "sidebar", size: { px: 299 } }] },
    spaces: [
      { id: "s1", name: "Demo", named: true, machine: null, folder: "/demo", tabs: [], active: true, status: null },
      { id: "s2", name: "Remote", named: true, machine: "pi", folder: "/remote", tabs: [], active: false, status: null },
      { id: "s3", name: "Other", named: true, machine: "small", folder: "/other", tabs: [], active: false, status: null },
    ],
  };
  env.values.set(APPEARANCE_KEY, ensureMachineDefaults(readAppearance(null), [null, "pi", "small"]));
  env.values.set("space.colors", { s1: "ansi6", s2: "ansi3", s3: "ansi4" });
  env.cx = {
    notify: () => { env.notifications++; }, stop_propagation() {},
    focus_handle: () => ({ focus() {} }),
    spawn: () => { env.spawns++; },
    timer: { every: () => { env.timers++; }, after: () => { env.timers++; } },
  };
  env.element = element;
  env.input = options => {
    let text = options?.value ?? "";
    const handlers = new Map();
    const state = {
      value: () => text, focus() {}, set_selected_range() {},
      set_value: value => { text = value; handlers.get("change")?.({}, env.cx); },
      on: (event, handler) => handlers.set(event, handler),
    };
    env.inputs.push(state);
    return state;
  };
  env.call = (name, ...args) => {
    env.calls.set(name, (env.calls.get(name) ?? 0) + 1);
    if (name === "props") return env.props;
    if (name === "shared") return structuredClone(env.values.get(args[0]));
    if (name === "setShared") { env.writes.push(args[0]); env.values.set(args[0], structuredClone(args[1])); return null; }
    if (name === "spaces") return structuredClone(env.spaces);
    if (name === "machines") return [{ name: null, layout: "ready" }, { name: "pi", layout: "ready" }, { name: "small", layout: "ready" }];
    if (["agents", "terminals", "panes"].includes(name)) return structuredClone(env[name]);
    if (name === "settings") return { dark: true, zoom: 1 };
    if (name === "layout") return structuredClone(env.layout);
    if (name === "window") return { platform: "linux", buttons: true, titlebar: "none" };
    if (name === "home") return "/home/test";
    if (name === "keys") return [{ section: "global", keys: "ctrl-shift-p", action: "app.palette" }];
    if (name === "updates") return { app: { ready: null } };
    if (name === "theme") return new Proxy({ foreground: "#eeeeee", ansi6: "#22a99a" }, { get: (o, k) => o[k] ?? "#333333" });
    if (name === "run") { env.commands.push(args); return null; }
    if (name === "openOverlay") { env.opened.push(args[0]); return "new-overlay"; }
    if (name === "closeOverlay") { env.closed.push(args[0]); return null; }
    if (name === "setAgentOrder") return null;
    throw new Error(`Unexpected host call in UI test: ${name}`);
  };
  return env;
}

const modules = {
  "gpui-kit": `export class View {};
    export const div=()=>globalThis.__appearanceHost.element("div");
    export const svg=path=>globalThis.__appearanceHost.element("svg").asset(path);
    export const image=path=>globalThis.__appearanceHost.element("image").asset(path);`,
  "gpui-base": `export const h_flex=()=>globalThis.__appearanceHost.element("row");
    export const v_flex=()=>globalThis.__appearanceHost.element("column");
    export const ScrollHandle={new:()=>({scroll_to_item: index=>globalThis.__appearanceHost.scrolls.push(index)})};
    export const InputState={new: options=>globalThis.__appearanceHost.input(options)};
    export const Input={new: state=>globalThis.__appearanceHost.element("input").state(state)};`,
  herdr: ["closeOverlay", "openOverlay", "props", "run", "shared", "setShared", "spaces", "theme", "agents", "terminals",
    "machines", "panes", "exec", "hc", "settings", "setAgentOrder", "watchFolder", "window", "layout",
    "home", "keys", "updates", "knownAgents"]
    .map(name => `export const ${name}=(...args)=>globalThis.__appearanceHost.call("${name}",...args);`).join("\n"),
};
registerHooks({ resolve(specifier, context, next) {
  if (modules[specifier]) return { url: `data:text/javascript,${encodeURIComponent(modules[specifier])}`, shortCircuit: true };
  return next(specifier, context);
} });
const { createAppearanceOverlay } = await import("../mods/spaces-status/appearance-editor.js");
const { default: Spaces } = await import("../mods/spaces-status/main.js");
const { renderAvatar } = await import("../mods/spaces-status/appearance-avatar.js");
const { createPixelMenu } = await import("../mods/spaces-status/pixel-menu.js");
const { tabLabel } = await import("../mods/spaces-status/pixel-chrome.js");
let env;
beforeEach(() => {
  env = environment();
  globalThis.__appearanceHost = env;
  const storage = new Map();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  } });
});
const find = (node, id) => node?.props?.id === id ? node : node?.kids?.map(child => find(child, id)).find(Boolean);
const click = (ui, id) => {
  const node = find(ui.render(), id);
  assert.ok(node, `Missing control ${id}`);
  node.events.on_click({}, env.cx);
};
const editor = target => createAppearanceOverlay({ appearance: target, overlay: "editor" }, env.cx);

test("machine editor has both color and avatar controls and starts no sidebar pollers", () => {
  const ui = editor({ kind: "machine", machine: "pi" });
  click(ui, "color-4");
  click(ui, "avatar-pixel-ghost");
  click(ui, "appearance-save");
  assert.deepEqual(env.values.get(APPEARANCE_KEY).machines["remote:pi"], { color: "ansi2", avatar: { kind: "pixel", name: "ghost" } });
  assert.deepEqual(env.closed, ["editor"]);
  assert.equal(env.timers, 0);
  assert.equal(env.spawns, 0);
});

test("space rename, explicit color and a Material icon save against the clicked id", () => {
  const ui = editor({ kind: "space", id: "s1" });
  env.inputs[0].set_value("Renamed demo");
  env.inputs[2].set_value("rocket");
  click(ui, "color-2");
  click(ui, "material-rocket");
  click(ui, "appearance-save");
  assert.deepEqual(env.commands, [["space.rename", { id: "s1", name: "Renamed demo" }]]);
  assert.deepEqual(env.values.get(APPEARANCE_KEY).spaces.s1, { color: "ansi4", avatar: { kind: "material", family: "round", name: "rocket" } });
});

test("cancel discards drafts without host writes or a rename", () => {
  const ui = editor({ kind: "space", id: "s1" });
  env.inputs[0].set_value("Not saved");
  click(ui, "color-3");
  click(ui, "avatar-pixel-cat");
  click(ui, "appearance-cancel");
  assert.deepEqual(env.writes, []);
  assert.deepEqual(env.commands, []);
});

test("reset releases a pinned space color without removing unrelated preferences", () => {
  const state = env.values.get(APPEARANCE_KEY);
  state.spaces = { s1: { color: "#abcdef", avatar: { kind: "letter" } }, s2: { color: "#123456" } };
  const ui = editor({ kind: "space", id: "s1" });
  click(ui, "appearance-reset");
  click(ui, "appearance-save");
  assert.equal(env.values.get(APPEARANCE_KEY).spaces.s1, undefined);
  assert.equal(env.values.get(APPEARANCE_KEY).spaces.s2.color, "#123456");
  assert.equal(env.values.get("space.colors").s1, undefined);
  assert.equal(env.values.get("space.colors").s2, "ansi3");
  assert.deepEqual(env.commands, []);
});

test("invalid hex and a closed space do not save", () => {
  const ui = editor({ kind: "space", id: "s1" });
  env.inputs[1].set_value("#oops");
  click(ui, "appearance-save");
  assert.deepEqual(env.writes, []);
  assert.deepEqual(env.closed, []);
  env.inputs[1].set_value("#123456");
  env.spaces = [];
  click(ui, "appearance-save");
  assert.deepEqual(env.writes, []);
});

test("rename remains in the space menu and worktree actions retain the same target", () => {
  const ui = createAppearanceOverlay({ spaceMenu: { id: "s1", checkout: "linked", tree: true }, overlay: "menu" }, env.cx);
  click(ui, "space-action-0");
  assert.deepEqual(env.opened[0].props.appearance, { kind: "space", id: "s1", tree: true });
  assert.equal(env.opened[0].mod, "spaces-status");
  click(ui, "space-action-2");
  assert.deepEqual(env.opened[1].props, { space: "s1", action: "open" });
});

test("sidebar uses one live-data snapshot and does not publish unchanged preferences on every render", () => {
  const view = new Spaces();
  view.init({}, env.cx);
  view.machines = [{ name: "pi", state: "connected" }, { name: "small", state: "connected" }];
  env.calls.clear();
  view.render();
  for (const name of ["spaces", "panes", "machines", "agents", "terminals", "settings", "layout"]) assert.equal(env.calls.get(name), 1, name);
  const writes = env.writes.length;
  view.render();
  assert.equal(env.writes.length, writes);
});

test("SS14 avatar saves, reopens and Default avatar preserves its manual color", () => {
  const target = { kind: "machine", machine: "pi" };
  let ui = editor(target);
  click(ui, "color-2");
  click(ui, "avatar-plush-ss14-shark-blue");
  click(ui, "appearance-save");
  assert.deepEqual(env.values.get(APPEARANCE_KEY).machines["remote:pi"],
    { color: "ansi4", avatar: { kind: "plush", id: "ss14-shark-blue" } });
  ui = editor(target);
  click(ui, "avatar-auto");
  click(ui, "appearance-save");
  assert.deepEqual(env.values.get(APPEARANCE_KEY).machines["remote:pi"], { color: "ansi4" });
});

test("plush sprite sheet is clipped to the first frame, not squeezed into the tile", () => {
  const node = renderAvatar({ kind: "plush", id: "ss14-carp-holoplush" }, 32, "#123456", "Demo");
  assert.equal(node.props.overflow_hidden, true);
  assert.equal(node.props.size, 32);
  assert.equal(node.kids.length, 1);
  assert.equal(node.kids[0].props.asset, "mods/spaces-status/icons/plushies/ss14-carp-holoplush.png");
  assert.equal(node.kids[0].props.w, 128);
  assert.equal(node.kids[0].props.h, 128);
});

function chrome(role) {
  const view = new Spaces();
  view.init({ chrome: role }, env.cx);
  return view;
}
function tabsFixture() {
  env.spaces[0].tabs = [
    { id: "t1", name: "One", named: true, active: true, status: null },
    { id: "t2", name: "Two", named: true, active: false, status: "working" },
  ];
}

test("all chrome roles render pixel typography without sidebar polling or preferences writes", () => {
  for (const role of ["brand", "footer", "tabs", "status"]) {
    const view = chrome(role);
    assert.equal(view.render().props.font_family, "Tiny5", role);
  }
  assert.equal(env.spawns, 0);
  assert.equal(env.timers, 0);
  assert.deepEqual(env.writes, []);
});

test("tabs select, drag by stable id, close independently, and read panes only once", () => {
  tabsFixture();
  const ui = chrome("tabs");
  env.calls.clear();
  let tree = ui.render();
  assert.equal(env.calls.get("panes"), 1);
  find(tree, "tab-t2").events["on_mouse_down:left"]({}, env.cx);
  find(tree, "tab-t2").events["on_mouse_up:left"]({}, env.cx);
  assert.deepEqual(env.commands.pop(), ["tab.select", { id: "t2" }]);
  find(tree, "tab-t1").events["on_mouse_down:left"]({}, env.cx);
  find(tree, "tab-t2").events["on_mouse_up:left"]({}, env.cx);
  assert.deepEqual(env.commands.pop(), ["tab.move", { id: "t1", index: 2 }]);
  tree = ui.render();
  find(tree, "close-t1").events.on_click({}, env.cx);
  assert.deepEqual(env.commands, [["tab.close", { id: "t1" }]]);
  assert.equal(env.scrolls[0], 0);
});

test("tab wheel and panel buttons retain stock commands; tab menu targets the clicked tab", () => {
  tabsFixture();
  const ui = chrome("tabs"), tree = ui.render();
  tree.events.on_scroll_wheel({ delta_lines: { y: 1 }, delta: { y: 25 } });
  assert.deepEqual(env.commands.pop(), ["tab.prev"]);
  find(tree, "panel-files").events.on_click({}, env.cx);
  assert.deepEqual(env.commands.splice(0), [
    ["layout.select", { stack: "panel-body", child: "files" }], ["layout.show", { id: "panel" }],
  ]);
  find(tree, "tab-t2").events["on_mouse_down:right"]({}, env.cx);
  assert.deepEqual(env.opened[0].props.chromeMenu, { id: "t2", space: "s1" });
  const menu = createPixelMenu({ ...env.opened[0].props, overlay: "popup" }, env.cx);
  click(menu, "pixel-menu-rename");
  assert.deepEqual(env.commands.pop(), ["tab.rename", { id: "t2" }]);
  assert.deepEqual(env.closed, ["popup"]);
});

test("pane buttons keep explicit pane targets and never focus/close a different pane", () => {
  env.props = { pane: "p2" };
  env.panes = [{ pane: "p2", title: "shell", cwd: "/home/test/demo", focused: true, status: "blocked" }];
  const ui = chrome("pane"), tree = ui.render();
  tree.events.on_hover(true, env.cx);
  click(ui, "ph-r-p2");
  click(ui, "ph-z-p2");
  assert.deepEqual(env.commands, [
    ["pane.split", { direction: "right", pane: "p2" }], ["pane.zoom", { pane: "p2" }],
  ]);
  assert.equal(env.spawns, 0);
});

test("pixel space groups wrap their own sessions and keep fold/navigation behavior", () => {
  tabsFixture();
  env.agents = [{ address: "a1", space: "s1", tab: "t1", title: "Agent", status: "idle",
    program: { name: "Agent", key: "agent", agent: true } }];
  const view = new Spaces();
  view.init({}, env.cx);
  const tree = view.render(), group = find(tree, "space-group-s1");
  assert.ok(group);
  assert.equal(group.props.border_l, 3);
  assert.ok(find(group, "space-s1"));
  assert.ok(find(group, "session-t1"));
  click(view, "session-t1");
  assert.deepEqual(env.commands.slice(-2), [["space.select", { id: "s1" }], ["tab.select", { id: "t1" }]]);
  find(view.render(), "space-fold-s1").events["on_mouse_down:left"]({}, env.cx);
  assert.equal(find(view.render(), "session-t1"), undefined);
});

test("automatic tab labels do not mistake a path for an agent title", () => {
  const tab = { name: "Agent", named: false };
  const pane = { terminal: "t1", title: "~/projects/demo", program: { agent: true, key: "agent", name: "Agent" } };
  assert.equal(tabLabel(tab, pane), "Agent");
  assert.equal(tabLabel(tab, { ...pane, title: "Fixing tests" }), "Fixing tests");
});

test("changing Material style applies to the selected icon, not just the browser", () => {
  const ui = editor({ kind: "space", id: "s1" });
  env.inputs[2].set_value("home");
  click(ui, "material-home");
  click(ui, "family-outlined");
  click(ui, "appearance-save");
  assert.deepEqual(env.values.get(APPEARANCE_KEY).spaces.s1.avatar,
    { kind: "material", family: "outlined", name: "home" });
});

test("new pixel menu restores installed agents from cache and preserves launch argv", () => {
  env.values.set("new-menu.agents", { "": [
    { key: "pi", name: "Pi", run: ["pi", "--flag"], installed: true },
    { key: "missing", name: "Missing", run: ["missing"], installed: false },
  ] });
  const ui = createPixelMenu({ newMenu: true, overlay: "new-popup" }, env.cx);
  click(ui, "pixel-menu-missing");
  assert.deepEqual(env.commands, []);
  click(ui, "pixel-menu-pi");
  assert.deepEqual(env.commands, [["tab.new", { name: "Pi", space: "s1", argv: ["pi", "--flag"] }]]);
  assert.deepEqual(env.closed, ["new-popup"]);
  assert.equal(env.spawns, 1); // agent discovery only; no machine/Git pollers
  assert.equal(env.timers, 0);
});
