// Host mock: exercises real compiled handlers without touching Herdr or terminals.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { APPEARANCE_KEY, ensureMachineDefaults, ensureSpaceDefaults, readAppearance, machineColor } from "../mods/spaces-status/appearance-model.js";
import { CHARACTER_ACCENTS } from "../mods/spaces-status/character-accents.js";

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
    timers: 0, timerTasks: [], releases: 0, spawns: 0, notifications: 0, props: {}, scrolls: [], panes: [], agents: [], terminals: [], jobs: [], clipboard: [], stops: 0,
    layout: { id: "root", children: [{ id: "sidebar", size: { px: 299 } }] },
    spaces: [
      { id: "s1", name: "Demo", named: true, machine: null, folder: "/demo", tabs: [], active: true, status: null },
      { id: "s2", name: "Remote", named: true, machine: "pi", folder: "/remote", tabs: [], active: false, status: null },
      { id: "s3", name: "Other", named: true, machine: "small", folder: "/other", tabs: [], active: false, status: null },
    ],
  };
  env.values.set(APPEARANCE_KEY, ensureSpaceDefaults(ensureMachineDefaults(readAppearance(null), [null, "pi", "small"]), env.spaces));
  env.values.set("space.colors", { s1: "ansi6", s2: "ansi3", s3: "ansi4" });
  env.cx = {
    notify: () => { env.notifications++; }, stop_propagation() { env.stops++; },
    write_to_clipboard: text => env.clipboard.push(text),
    focus_handle: () => { let focused = false; return { focus() { focused = true; }, is_focused() { return focused; } }; },
    spawn: job => { env.spawns++; env.jobs.push(job); },
    timer: { every: (_ms, handler) => {
      env.timers++;
      const task = { handler, cancelled: false, cancel() { this.cancelled = true; } };
      env.timerTasks.push(task); return task;
    }, after: () => { env.timers++; } },
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
    if (name === "appHome") return "/mock/herdr";
    if (name === "readTextFile") return env.readTextFile ? env.readTextFile(...args) : Promise.resolve(null);
    if (name === "watchFolder" && env.watchFolder) return env.watchFolder(...args);
    if (name === "focused") return { space: "s1", tab: "t1", pane: "p1" };
    if (name === "exec" && env.exec) return env.exec(...args);
    if (name === "hc" && env.hc) return env.hc(...args);
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
    export const Scrollbar={vertical: id=>globalThis.__appearanceHost.element("scrollbar").id(id)};
    export const EditorState={new: options=>({options,release(){globalThis.__appearanceHost.releases++;}})};
    export const Editor={new: state=>globalThis.__appearanceHost.element("editor").state(state)};
    export const v_virtual_list=(id,count,height,key,render)=>globalThis.__appearanceHost.element("virtual-list").id(id).children(render({start:0,end:count}));
    export const InputState={new: options=>globalThis.__appearanceHost.input(options)};
    export const Input={new: state=>globalThis.__appearanceHost.element("input").state(state)};`,
  herdr: ["closeOverlay", "openOverlay", "props", "run", "shared", "setShared", "spaces", "theme", "agents", "terminals",
    "machines", "panes", "exec", "hc", "settings", "setAgentOrder", "watchFolder", "window", "layout",
    "home", "keys", "updates", "knownAgents", "nextCommand", "appHome", "readTextFile", "focused"]
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
const { createView } = await import("../mods/spaces-status/views/index.js");
const { openWorktree } = await import("../mods/spaces-status/overlays.js");
const { Menu } = await import("../mods/spaces-status/ui/menu.js");
const { button } = await import("../mods/spaces-status/ui/controls.js");
const { LINEAGE_KEY, checkoutKey, readLineage } = await import("../mods/spaces-status/worktree-lineage.js");
const { readRepository, readGitStatus } = await import("../mods/spaces-status/data/git.js");
const { checkouts } = await import("../mods/spaces-status/views/worktree-git.js");
const { parseMachines, machineError, loadMachines } = await import("../mods/spaces-status/data/machines.js");
const { PanelLifecycle } = await import("../mods/spaces-status/views/panel-lifecycle.js");
const { openSpaceMenu, openTabMenu } = await import("../mods/spaces-status/overlays.js");
const { menuHeight } = await import("../mods/spaces-status/ui/tokens.js");
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

test("machine editor derives color from its character and starts no sidebar pollers", () => {
  const ui = editor({ kind: "machine", machine: "pi" });
  assert.equal(find(ui.render(), "color-4"), undefined);
  click(ui, "avatar-plush-ss14-moth-icon");
  click(ui, "appearance-save");
  assert.deepEqual(env.values.get(APPEARANCE_KEY).machines["remote:pi"], { avatar: { kind: "plush", id: "ss14-moth-icon" } });
  assert.equal(machineColor(env.values.get(APPEARANCE_KEY), "pi", {}), CHARACTER_ACCENTS["ss14-moth-icon"]);
  assert.deepEqual(env.closed, ["editor"]);
  assert.equal(env.timers, 0);
  assert.equal(env.spawns, 0);
});

test("space rename and Sharp icon save against the clicked id without color controls", () => {
  const ui = editor({ kind: "space", id: "s1" });
  env.inputs[0].set_value("Renamed demo");
  env.inputs[1].set_value("rocket");
  assert.equal(find(ui.render(), "tone-2"), undefined);
  click(ui, "material-rocket");
  click(ui, "appearance-save");
  assert.deepEqual(env.commands, [["space.rename", { id: "s1", name: "Renamed demo" }]]);
  assert.deepEqual(env.values.get(APPEARANCE_KEY).spaces.s1, { avatar: { kind: "material", family: "sharp", name: "rocket" } });
});

test("cancel discards drafts without host writes or a rename", () => {
  const ui = editor({ kind: "space", id: "s1" });
  env.inputs[0].set_value("Not saved");
  env.inputs[1].set_value("home");
  click(ui, "material-home");
  click(ui, "appearance-cancel");
  assert.deepEqual(env.writes, []);
  assert.deepEqual(env.commands, []);
});

test("reset restores the saved icon without changing assigned shades or unrelated profiles", () => {
  const state = env.values.get(APPEARANCE_KEY);
  state.spaces = { s1: { avatar: { kind: "material", family: "sharp", name: "home" } },
    s2: { avatar: { kind: "material", family: "sharp", name: "rocket" } } };
  const defaults = structuredClone(state.spaceDefaults);
  const ui = editor({ kind: "space", id: "s1" });
  click(ui, "appearance-reset");
  click(ui, "appearance-save");
  assert.equal(env.values.get(APPEARANCE_KEY).spaces.s1, undefined);
  assert.equal(env.values.get(APPEARANCE_KEY).spaces.s2.avatar.name, "rocket");
  assert.deepEqual(env.values.get(APPEARANCE_KEY).spaceDefaults, defaults);
  assert.equal(env.values.get("space.colors").s1, "ansi6");
  assert.equal(env.values.get("space.colors").s2, "ansi3");
  assert.deepEqual(env.commands, []);
});

test("a closed space does not save or fall back to the current target", () => {
  const ui = editor({ kind: "space", id: "s1" });
  env.spaces = [];
  click(ui, "appearance-save");
  assert.deepEqual(env.writes, []);
});

test("worktree editor allows renaming but offers no icon or shade selector", () => {
  const state = env.values.get(APPEARANCE_KEY);
  state.spaceDefaults.s1 = { ...state.spaceDefaults.s1, worktree: true, parent: "s2" };
  const ui = editor({ kind: "space", id: "s1", tree: true });
  assert.equal(find(ui.render(), "avatar-gallery"), undefined);
  assert.equal(find(ui.render(), "avatar-auto"), undefined);
  assert.equal(find(ui.render(), "tone-0"), undefined);
  env.inputs[0].set_value("Feature branch");
  click(ui, "appearance-save");
  assert.deepEqual(env.commands, [["space.rename", { id: "s1", name: "Feature branch" }]]);
  assert.equal(env.values.get(APPEARANCE_KEY).spaceDefaults.s1.parent, "s2");
});

test("rename remains in the space menu and worktree actions retain the same target", () => {
  const ui = createAppearanceOverlay({ spaceMenu: { id: "s1", checkout: "linked", tree: true }, overlay: "menu" }, env.cx);
  click(ui, "space-action-0");
  assert.deepEqual(env.opened[0].props.appearance, { kind: "space", id: "s1", tree: true });
  assert.equal(env.opened[0].mod, "spaces-status");
  click(ui, "space-action-2");
  assert.deepEqual(env.opened[1].props, { view: "worktree", space: "s1", machine: null, action: "open" });
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

test("character saves, reopens and Default restores its saved random character and accent", () => {
  const target = { kind: "machine", machine: "pi" };
  let ui = editor(target);
  click(ui, "avatar-plush-ss14-shark-blue");
  click(ui, "appearance-save");
  assert.deepEqual(env.values.get(APPEARANCE_KEY).machines["remote:pi"],
    { avatar: { kind: "plush", id: "ss14-shark-blue" } });
  ui = editor(target);
  click(ui, "avatar-auto");
  click(ui, "appearance-save");
  assert.equal(env.values.get(APPEARANCE_KEY).machines["remote:pi"], undefined);
  const defaults = env.values.get(APPEARANCE_KEY).defaults["remote:pi"];
  assert.equal(machineColor(env.values.get(APPEARANCE_KEY), "pi", {}), CHARACTER_ACCENTS[defaults.avatar.id]);
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

test("all chrome roles render Liberation Sans 14 without sidebar polling or preferences writes", () => {
  for (const role of ["brand", "footer", "tabs", "status"]) {
    const view = chrome(role);
    const tree = view.render();
    assert.equal(tree.props.font_family, "Liberation Sans", role);
    assert.equal(tree.props.text_size, 14, role);
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
  assert.deepEqual(env.opened[1].props, { view: "rename", id: "t2" });
  const rename = createView({ ...env.opened[1].props, overlay: "rename" }, env.cx);
  env.inputs.at(-1).set_value("Renamed second");
  click(rename, "rename-save");
  assert.deepEqual(env.commands.pop(), ["tab.rename", { id: "t2", name: "Renamed second" }]);
  assert.deepEqual(env.closed, ["popup", "rename"]);
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
  assert.ok(find(group, "space-s1"));
  assert.ok(find(group, "session-t1"));
  click(view, "session-t1");
  assert.deepEqual(env.commands.slice(-2), [["space.select", { id: "s1" }], ["tab.select", { id: "t1" }]]);
  click(view, "space-fold-s1");
  assert.equal(find(view.render(), "session-t1"), undefined);
});

test("editors separate characters and icons, and keyboard selection saves the focused choice", () => {
  const machine = editor({ kind: "machine", machine: "pi" });
  assert.ok(find(machine.render(), "avatar-plush-ss14-shark-blue"));
  assert.equal(find(machine.render(), "family-sharp"), undefined);
  assert.equal(find(machine.render(), "color-auto"), undefined);
  const ui = editor({ kind: "space", id: "s1" });
  assert.equal(find(ui.render(), "avatar-plush-ss14-shark-blue"), undefined);
  assert.equal(find(ui.render(), "color-auto"), undefined);
  const choices = find(ui.render(), "avatar-gallery").kids;
  const expected = choices[1].props.id.replace("material-", "");
  const gallery = find(ui.render(), "avatar-gallery");
  gallery.events.on_key_down({ key: "right" }, env.cx);
  gallery.events.on_key_down({ key: "enter" }, env.cx);
  click(ui, "appearance-save");
  assert.equal(env.values.get(APPEARANCE_KEY).spaces.s1.avatar.name, expected);
});

test("automatic tab labels do not mistake a path for an agent title", () => {
  const tab = { name: "Agent", named: false };
  const pane = { terminal: "t1", title: "~/projects/demo", program: { agent: true, key: "agent", name: "Agent" } };
  assert.equal(tabLabel(tab, pane), "Agent");
  assert.equal(tabLabel(tab, { ...pane, title: "Fixing tests" }), "Fixing tests");
});

test("legacy Material choices reopen in Sharp without offering style variants", () => {
  env.values.get(APPEARANCE_KEY).spaces.s1 = { avatar: { kind: "material", family: "outlined", name: "home" } };
  const ui = editor({ kind: "space", id: "s1" });
  assert.equal(find(ui.render(), "family-outlined"), undefined);
  assert.equal(find(ui.render(), "family-round"), undefined);
  click(ui, "appearance-save");
  assert.deepEqual(env.values.get(APPEARANCE_KEY).spaces.s1.avatar,
    { kind: "material", family: "sharp", name: "home" });
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
  assert.deepEqual(env.commands, [["tab.new", { space: "s1", argv: ["pi", "--flag"] }]]);
  assert.deepEqual(env.closed, ["new-popup"]);
  assert.equal(env.spawns, 1); // agent discovery only; no machine/Git pollers
  assert.equal(env.timers, 0);
});

const key = (name, modifiers = {}) => ({ key: name, modifiers });
const text = node => typeof node === "string" ? node : (node?.kids ?? []).map(text).join(" ");

test("machine plus creates in that machine's home; only right-click opens appearance", () => {
  const view = new Spaces(); view.init({}, env.cx);
  view.machines = [{ name: "pi", state: "connected" }];
  const tree = view.render(), plus = find(tree, "machine-add-pi");
  assert.equal(find(tree, "machine-appearance-remote:pi"), undefined);
  plus.events["on_mouse_down:left"]({}, env.cx);
  plus.events["on_mouse_up:left"]({}, env.cx);
  plus.events.on_click({}, env.cx);
  assert.equal(env.stops, 3);
  assert.deepEqual(env.commands, [["space.new", { machine: "pi", folder: "" }]]);
  assert.equal(env.opened.length, 0);
  find(tree, "machine-pi").events["on_mouse_down:right"]({}, env.cx);
  assert.deepEqual(env.opened[0].props.appearance, { kind: "machine", machine: "pi" });
});

test("both sidebar plus buttons use the current machine's home rather than the focused checkout", () => {
  for (const width of [44, 300]) {
    env.layout.children[0].size.px = width;
    const view = width === 44 ? new Spaces() : chrome("brand");
    if (width === 44) view.init({}, env.cx);
    const plus = find(view.render(), "space-new");
    // Resolve the current machine at click time, including after a space switch.
    // The host's focused() still points at the local project throughout.
    for (const id of ["s2", "s3", "s1"]) {
      for (const space of env.spaces) space.active = space.id === id;
      plus.events.on_click({}, env.cx);
      const machine = env.spaces.find(s => s.id === id).machine ?? "";
      assert.deepEqual(env.commands.at(-1), ["space.new", { machine, folder: "" }]);
    }
  }
  assert.equal(env.commands.length, 6);
  assert.deepEqual(env.opened, []);
});

test("new-space menu retains its captured machine's home after focus changes", () => {
  env.spaces[0].active = false;
  env.spaces[1].active = true;
  const menu = createPixelMenu({ newMenu: true, overlay: "new-popup" }, env.cx);
  env.spaces[0].active = true;
  env.spaces[1].active = false;
  click(menu, "pixel-menu-space");
  assert.deepEqual(env.commands, [["space.new", { machine: "pi", folder: "" }]]);
});

test("worktree button opens immediately for a non-active remote space, without selection or drag", () => {
  const view = new Spaces(); view.init({}, env.cx);
  const control = find(view.render(), "space-worktree-s2");
  control.events["on_mouse_down:left"]({}, env.cx);
  control.events["on_mouse_up:left"]({}, env.cx);
  control.events.on_click({}, env.cx);
  assert.equal(view.pressed, null);
  assert.equal(env.stops, 3);
  assert.deepEqual(env.commands, []);
  assert.deepEqual(env.opened[0].props, { view: "worktree", space: "s2", machine: "pi", action: "new" });
  assert.equal(env.opened[0].frame, "none");
  const geometry = { width: env.opened[0].width, height: env.opened[0].height };
  openWorktree("s2", "new");
  assert.deepEqual({ width: env.opened[1].width, height: env.opened[1].height }, geometry);
  env.spaces = env.spaces.filter(s => s.id !== "s2");
  openWorktree("s2", "new");
  assert.equal(env.opened.length, 2);
});

test("right-click opens the captured space/worktree menu in both sidebar modes without selecting it", () => {
  for (const width of [44, 300]) {
    env.layout.children[0].size.px = width;
    env.values.set(APPEARANCE_KEY, ensureSpaceDefaults(env.values.get(APPEARANCE_KEY),
      [{ id: "s2", machine: "pi", worktree: true }]));
    const view = new Spaces(); view.init({}, env.cx);
    for (const id of ["s1", "s2"]) {
      find(view.render(), `space-${id}`).events["on_mouse_down:right"]({}, env.cx);
      const opened = env.opened.at(-1), worktree = id === "s2";
      assert.deepEqual(opened.props.spaceMenu, { id, checkout: worktree ? "linked" : null, tree: worktree });
      assert.equal(opened.kind, "popup");
      assert.ok(opened.height >= (worktree ? 5 : 4) * 32);
      assert.equal(view.pressed, null);
    }
  }
  assert.deepEqual(env.commands, []);
});

test("rail nests saved worktrees inside their parent and both inside their own machine", () => {
  env.layout.children[0].size.px = 44;
  env.spaces.push({ ...env.spaces[1], id: "wt", name: "Feature", active: false });
  let state = env.values.get(APPEARANCE_KEY);
  state = ensureSpaceDefaults(state, [{ id: "wt", machine: "pi", worktree: true, parent: "s2" }]);
  env.values.set(APPEARANCE_KEY, state);
  const view = new Spaces(); view.init({}, env.cx);
  const tree = view.render(), machine = find(tree, "machine-card-pi"), group = find(machine, "rail-space-group-s2");
  assert.ok(group);
  assert.ok(find(group, "space-s2"));
  assert.ok(find(find(group, "rail-worktrees-s2"), "space-wt"));
  assert.equal(find(find(tree, "machine-card-local"), "space-wt"), undefined);
  assert.match(find(group, "space-wt").props.tooltip, /pi → Remote → Feature/);
  click(view, "machine-pi");
  assert.equal(find(view.render(), "space-wt"), undefined);
  const restarted = new Spaces(); restarted.init({}, env.cx);
  assert.equal(find(restarted.render(), "space-wt"), undefined);
});

test("saved creation ancestry overrides flat Git grouping in both sidebar modes after restart", () => {
  env.spaces[1].folder = "/repo";
  env.spaces.push({ ...env.spaces[1], id: "wt-a", name: "Feature A", folder: "/trees/a", tabs: [] },
    { ...env.spaces[1], id: "wt-b", name: "Feature B", folder: "/trees/b", tabs: [] });
  const origin = { machine: "pi", path: "/trees/b", repo: "/repo", branch: "feature-b",
    source: { space: "wt-a", name: "Feature A", path: "/trees/a", branch: "feature-a", commit: "a".repeat(40) } };
  env.values.set(LINEAGE_KEY, { [checkoutKey("pi", origin.path)]: origin });
  const view = new Spaces(); view.init({}, env.cx);
  for (const path of ["/repo", "/trees/a", "/trees/b"]) view.git[JSON.stringify(["pi", path])] = {
    repo: JSON.stringify(["pi", "/repo/.git"]), top: path, main: "/repo", linked: path !== "/repo", branch: "feature", name: "repo",
  };
  const expanded = view.render();
  assert.match(text(find(expanded, "space-wt-b")), /From Feature A · feature-a @ aaaaaaa/);
  assert.equal(env.values.get(APPEARANCE_KEY).spaceDefaults["wt-b"].parent, "wt-a");
  assert.equal(env.values.get("space.colors")["wt-b"], env.values.get("space.colors").s2);
  env.layout.children[0].size.px = 44;
  const restarted = new Spaces(); restarted.init({}, env.cx); // Git has not answered yet.
  const rail = restarted.render();
  const branch = find(find(rail, "rail-space-group-wt-a"), "rail-worktrees-wt-a");
  assert.ok(find(branch, "space-wt-b"));
  assert.match(find(branch, "space-wt-b").props.tooltip, /pi → Remote → Feature A → Feature B/);
});

test("search reuses saved identities and never allocates or prunes colors, including offline records", () => {
  tabsFixture();
  env.values.get("space.colors").offline = "#abcdef";
  env.spaces[1].tabs = [{ id: "remote-tab", name: "Shell", named: false, active: true, status: null }];
  env.panes = [{ tab: "remote-tab", title: "Deploying", program: { key: "agent", name: "Agent", agent: true } }];
  const before = structuredClone([...env.values]);
  const picker = createView({ view: "picker", overlay: "find" }, env.cx);
  env.inputs.at(-1).set_value("deploy");
  const tree = picker.render();
  assert.ok(find(tree, "pk-remote-tab"));
  assert.ok(find(tree, "pk-head-s2"));
  assert.ok(text(tree).includes("Deploying"));
  assert.deepEqual([...env.values], before);
  assert.deepEqual(env.writes, []);
  click(picker, "pk-remote-tab");
  assert.deepEqual(env.commands, [["space.select", { id: "s2" }], ["tab.select", { id: "remote-tab" }]]);
  assert.equal(env.spawns, 1); // machine discovery only
  assert.equal(env.timers, 0);
});

test("menu keys skip disabled items, reveal the selected row, and execute once", () => {
  const actions = [], menu = new Menu(env.cx, () => actions.push("close")), t = env.call("theme");
  const items = [
    { id: "first", label: "First", action: () => actions.push("first") },
    { id: "disabled", label: "Disabled", enabled: false, action: () => actions.push("disabled") },
    { id: "last", label: "Last", action: () => actions.push("last") },
  ];
  menu.render(t, "test-menu", items).events.on_key_down(key("down"), env.cx);
  assert.equal(env.scrolls.at(-1), 2);
  menu.render(t, "test-menu", items).events.on_key_down(key("enter"), env.cx);
  assert.deepEqual(actions, ["close", "last"]);
  find(menu.render(t, "test-menu", items), "disabled").events.on_click({}, env.cx);
  assert.deepEqual(actions, ["close", "last"]);
  const empty = menu.render(t, "empty", []);
  empty.events.on_key_down(key("down"), env.cx);
  empty.events.on_key_down(key("enter"), env.cx);
  assert.deepEqual(actions, ["close", "last"]);
});

test("shared buttons consume nested gestures and disabled keyboard actions do nothing", () => {
  let actions = 0;
  const t = env.call("theme"), control = button(t, "action", "Action", () => actions++);
  control.events["on_mouse_down:left"]({}, env.cx);
  control.events["on_mouse_up:left"]({}, env.cx);
  control.events.on_key_down(key("enter"), env.cx);
  assert.equal(actions, 1);
  assert.equal(env.stops, 3);
  const disabled = button(t, "disabled", "Disabled", () => actions++, { disabled: true });
  disabled.events.on_click({}, env.cx);
  disabled.events.on_key_down(key("space"), env.cx);
  assert.equal(actions, 1);
});

test("explicitly named tabs win even when their names match the program", () => {
  const pane = { title: "[ Fixing ] tests", program: { key: "agent", name: "Agent", agent: true } };
  assert.equal(tabLabel({ name: "Agent", named: true }, pane), "Agent");
  assert.equal(tabLabel({ name: "1", named: false }, pane), "[ Fixing ] tests");
  assert.equal(tabLabel({ name: "1", named: false }, { ...pane, title: "[ ! ] Fixing tests" }), "Fixing tests");
});

test("terminal menu uses the clicked target and omits pane commands for composition terminals", () => {
  env.panes = [{ pane: "p2", tab: "t2" }];
  env.terminals = [{ address: "remote/child", parent: "remote/parent", labels: { "herdr.right-click": "program" } },
    { address: "remote/parent", name: "Parent" }];
  const menu = createView({ tab: "pane", target: { pane: "p2", terminal: "remote/child" }, overlay: "context" }, env.cx);
  click(menu, "terminal-menu-right");
  click(menu, "terminal-menu-mouse");
  click(menu, "terminal-menu-park");
  assert.deepEqual(env.commands, [
    ["pane.split", { pane: "p2", direction: "right" }],
    ["terminal.right_click", { terminal: "remote/child", to: "menu" }],
    ["terminal.park", { terminal: "remote/child" }],
  ]);
  const block = createView({ tab: "pane", target: { pane: "block", terminal: "remote/child" }, overlay: "context" }, env.cx);
  assert.equal(find(block.render(), "terminal-menu-right"), undefined);
  assert.equal(find(block.render(), "terminal-menu-close"), undefined);
  assert.equal(env.spawns, 0);
});

test("toast Copy consumes the action, and close confirmations retain their captured target", () => {
  const toast = createView({ title: "Login", body: "pi needs login; run hc machine login pi",
    overlay: "toast", action: { name: "space.select", args: { id: "s2" } } }, env.cx);
  click(toast, "toast-login-copy");
  assert.deepEqual(env.clipboard, ["hc machine login pi"]);
  assert.deepEqual(env.commands, []);
  assert.deepEqual(env.closed, []);
  const confirm = createView({ view: "confirm-close", kind: "space", id: "s2", overlay: "confirm" }, env.cx);
  env.spaces[0].active = true;
  click(confirm, "confirm-accept");
  assert.deepEqual(env.commands, [["space.close", { id: "s2", confirmed: true }]]);
});

test("remote worktree creation pins the clicked worktree's latest commit and saves its origin", async () => {
  env.spaces[1].tabs = [{ id: "remote-tab" }];
  env.panes = [{ tab: "remote-tab", cwd: "/remote/repo/subdir" }, { tab: "other-tab", cwd: "/wrong", focused: true }];
  const calls = [];
  let head = "a".repeat(40);
  env.exec = async (command, args, options) => {
    calls.push({ command, args, options });
    if (command === "sh") return { code: 0, stdout: "/home/remote", stderr: "" };
    if (args.includes("--show-toplevel")) return { code: 0, stdout: "/remote/repo/feature-a", stderr: "" };
    if (args.includes("--git-common-dir")) return { code: 0, stdout: "/remote/repo/.git", stderr: "" };
    if (args[0] === "show-ref") return { code: 1, stdout: "", stderr: "" };
    if (args[0] === "rev-parse" && args.includes("--verify")) return { code: 0, stdout: head, stderr: "" };
    if (args[0] === "symbolic-ref") return { code: 0, stdout: "feature-a", stderr: "" };
    return { code: 0, stdout: "", stderr: "" };
  };
  const ui = createView({ view: "worktree", space: "s2", action: "new", overlay: "worktree" }, env.cx);
  await env.jobs.shift()(env.cx);
  head = "b".repeat(40); // The source advanced while the dialog was open.
  env.inputs.at(-1).set_value("feature/new");
  click(ui, "worktree-submit");
  await env.jobs.shift()(env.cx);
  assert.ok(calls.every(call => call.options.on === "pi"));
  const add = calls.find(call => call.args[0] === "worktree");
  assert.equal(add.options.cwd, "/remote/repo/feature-a");
  assert.deepEqual(add.args, ["worktree", "add", "-b", "feature/new", "/home/remote/.herdr/worktrees/repo/feature-new", head]);
  const origin = readLineage(env.values.get(LINEAGE_KEY))[checkoutKey("pi", "/home/remote/.herdr/worktrees/repo/feature-new")];
  assert.deepEqual(origin.source, { space: "s2", name: "Remote", path: "/remote/repo/feature-a", branch: "feature-a", commit: head });
  assert.deepEqual(env.commands, [["space.new", { folder: "/home/remote/.herdr/worktrees/repo/feature-new", machine: "pi" }]]);
  assert.deepEqual(env.closed, ["worktree"]);
});

test("opening an existing branch does not invent ancestry from the clicked worktree", async () => {
  env.exec = async (command, args) => {
    if (command === "sh") return { code: 0, stdout: "/home/remote", stderr: "" };
    if (args.includes("--show-toplevel")) return { code: 0, stdout: "/repo/source", stderr: "" };
    if (args.includes("--git-common-dir")) return { code: 0, stdout: "/repo/.git", stderr: "" };
    if (args[0] === "rev-parse") return { code: 0, stdout: "a".repeat(40), stderr: "" };
    return { code: 0, stdout: "", stderr: "" };
  };
  const ui = createView({ view: "worktree", space: "s2", action: "new", overlay: "worktree" }, env.cx);
  await env.jobs.shift()(env.cx);
  env.inputs.at(-1).set_value("existing");
  click(ui, "worktree-submit");
  await env.jobs.shift()(env.cx);
  assert.deepEqual(env.values.get(LINEAGE_KEY), {});
  assert.equal(env.commands[0][0], "space.new");
});

test("worktree removal rechecks newly dirty state before closing the space or deleting files", async () => {
  let dirty = false;
  const calls = [];
  env.exec = async (_command, args, options) => {
    calls.push({ args, options });
    if (args.includes("--show-toplevel")) return { code: 0, stdout: "/repo/worktree", stderr: "" };
    if (args.includes("--git-common-dir")) return { code: 0, stdout: "/repo/main/.git", stderr: "" };
    if (args.includes("--absolute-git-dir")) return { code: 0, stdout: "/repo/main/.git/worktrees/feature", stderr: "" };
    if (args.includes("status")) return { code: 0, stdout: dirty ? " M file" : "", stderr: "" };
    if (args.includes("config")) return { code: 1, stdout: "", stderr: "" };
    return { code: 0, stdout: "", stderr: "" };
  };
  const ui = createView({ view: "worktree", space: "s1", action: "remove", overlay: "remove" }, env.cx);
  await env.jobs.shift()(env.cx);
  dirty = true;
  click(ui, "worktree-submit");
  await env.jobs.shift()(env.cx);
  assert.deepEqual(env.commands, []);
  assert.equal(calls.some(call => call.args[0] === "worktree"), false);
  assert.match(text(ui.render()), /changed since/);
  click(ui, "worktree-submit");
  await env.jobs.shift()(env.cx);
  assert.deepEqual(env.commands, [["space.close", { id: "s1", confirmed: true }]]);
  assert.deepEqual(calls.find(call => call.args[0] === "worktree").args, ["worktree", "remove", "--force", "/repo/worktree"]);
});

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const ok = stdout => ({ code: 0, stdout, stderr: "" });
const activate = id => { for (const space of env.spaces) space.active = space.id === id; };

test("shared Git reads preserve actual whitespace paths, linked checkouts and NUL status records", async () => {
  const directory = mkdtempSync(join(existsSync("/tmp/opencode") ? "/tmp/opencode" : tmpdir(), "herdr-git-"));
  const root = join(directory, " repo\twith\nspace \n"), linked = join(directory, " checkout\n ");
  mkdirSync(root);
  const calls = [];
  env.exec = async (command, args, options) => {
    calls.push({ command, args, options });
    const r = spawnSync(command, args, { cwd: options.cwd, encoding: "utf8" });
    if (r.error) throw r.error;
    return { code: r.status, stdout: r.stdout, stderr: r.stderr };
  };
  const run = args => {
    const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  };
  try {
    run(["init", "-q"]);
    run(["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--allow-empty", "-qm", "Initial"]);
    run(["worktree", "add", "-qb", "linked", linked]);
    const { repo } = await readRepository(linked, "pi");
    assert.equal(repo.top, linked);
    assert.equal(repo.main, root);
    assert.equal(repo.linked, true);
    assert.deepEqual(calls.map(c => c.args[0]), ["rev-parse", "rev-parse"]);
    const list = await checkouts(repo, "pi");
    assert.deepEqual(new Set(list.map(c => c.path)), new Set([root, linked]));
    const filenames = [" leading ", "tab\tname", "line\nname", "back\\slash"];
    for (const name of filenames) writeFileSync(join(linked, name), "new\n");
    const status = await readGitStatus(linked, "pi", 1000);
    assert.deepEqual(new Set(status.files.map(f => f.path)), new Set(filenames));
    assert.ok(calls.every(c => c.options.on === "pi"));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("machine parsing shares filtering, defaults and structured/plain error handling", async () => {
  assert.deepEqual(parseMachines({ machines: [null, { name: 9 }, { name: "temp", temporary: true },
    { name: "pi", state: "connected", via: true }, { name: "small", target: "user@host", keeps_running_after_logout: false }] }), [
    { name: "pi", target: "pi", state: "connected", via: true },
    { name: "small", target: "user@host", keeps_running_after_logout: false },
  ]);
  assert.deepEqual(parseMachines({ machines: {} }), []);
  assert.deepEqual(machineError({ stdout: "progress", stderr: '{"error":{"kind":"login_needed","message":"Log in"}}' }), { kind: "login_needed", message: "Log in" });
  assert.equal(machineError({ stdout: "", stderr: " offline \n" }).message, "offline");
  env.hc = async () => ({ code: 1, stdout: "", stderr: "offline" });
  await assert.rejects(loadMachines, /offline/);
  const sidebar = new Spaces(); sidebar.init({}, env.cx);
  sidebar.machines = [{ name: "saved", target: "saved" }];
  await env.jobs.shift()(env.cx);
  assert.equal(sidebar.machines[0].name, "saved");
});

test("static popup opening height matches rendered rows for main, linked and tab menus", () => {
  const count = (node, prefix) => (node?.props?.id?.startsWith(prefix) ? 1 : 0) + (node?.kids ?? []).reduce((n, child) => n + count(child, prefix), 0);
  for (const checkout of [null, "main", "linked"]) {
    openSpaceMenu("s2", checkout, checkout === "linked");
    const opened = env.opened.at(-1), ui = createAppearanceOverlay(opened.props, env.cx);
    const rendered = ui.render();
    assert.equal(opened.height, menuHeight(count(rendered, "space-action-")));
    assert.equal(rendered.props.h, opened.height);
  }
  openTabMenu("tab", "s2");
  const opened = env.opened.at(-1), ui = createPixelMenu(opened.props, env.cx);
  assert.equal(ui.render().props.h, opened.height);
  click(ui, "pixel-menu-new");
  assert.deepEqual(env.commands.at(-1), ["tab.new", { space: "s2" }]);
});

test("panel lifecycle coalesces refreshes and cancels watches on context changes and close", async () => {
  let refreshes = 0, cancelled = 0;
  const lifecycle = new PanelLifecycle(env.cx, () => { refreshes++; });
  const local = lifecycle.sync(), request = lifecycle.begin(local);
  lifecycle.begin(local); lifecycle.begin(local);
  lifecycle.finish(request, env.cx);
  assert.equal(refreshes, 1);
  env.watchFolder = () => {
    const waiting = deferred();
    return Object.assign(waiting.promise, { cancel() { cancelled++; waiting.resolve([]); } });
  };
  lifecycle.watch("/demo", local, env.cx);
  const oldWatch = env.jobs.shift()(env.cx);
  activate("s2"); const remote = lifecycle.sync();
  await oldWatch;
  assert.equal(cancelled, 1);
  assert.equal(lifecycle.current(local), false);
  lifecycle.watch("/remote", remote, env.cx);
  assert.equal(env.jobs.length, 0);
  activate("s1"); const again = lifecycle.sync();
  assert.notEqual(again, local);
  lifecycle.watch("/demo", again, env.cx);
  const watch = env.jobs.shift()(env.cx);
  lifecycle.close(); await watch;
  env.timerTasks[0].handler(env.cx);
  assert.equal(refreshes, 1);
  assert.equal(cancelled, 2);
  assert.equal(env.timerTasks[0].cancelled, true);
  assert.equal(lifecycle.begin(again), undefined);
});

for (const view of ["files", "changes"]) test(`${view} ignores stale A -> B -> A results without clearing the new load`, async () => {
  activate("s2");
  const first = deferred(), second = deferred();
  let reads = 0;
  env.exec = async (command, args, options) => {
    const initial = view === "files" ? command === "sh" : args.includes("--show-toplevel");
    if (initial && options.on === "pi") return (++reads === 1 ? first : second).promise;
    if (command === "sh") return ok("f\0conflict\0");
    if (args.includes("--show-toplevel")) return ok(options.cwd + "\n");
    if (args.includes("status")) return ok("AA conflict\0");
    if (args.includes("--numstat")) return ok("");
    if (args.includes("diff")) return ok("@@ -1 +1 @@\n-old\n+new\n");
    return ok("a".repeat(40));
  };
  const ui = createView({ view }, env.cx), a1 = env.jobs.shift()(env.cx);
  activate("s3"); ui.render(env.cx);
  await env.jobs.shift()(env.cx);
  assert.ok(find(ui.render(), view === "files" ? "file-conflict" : "change-conflict"));
  assert.match(text(ui.render()), /\bU\b/);
  activate("s2"); ui.render(env.cx);
  const a2 = env.jobs.shift()(env.cx);
  first.resolve(ok(view === "files" ? "f\0obsolete\0" : "/old\n"));
  await a1;
  assert.match(text(ui.render()), view === "files" ? /Loading files/ : /Loading changes/);
  assert.doesNotMatch(text(ui.render()), /obsolete|conflict/);
  second.resolve(ok(view === "files" ? "f\0conflict\0" : "/remote\n"));
  await a2;
  assert.ok(find(ui.render(), view === "files" ? "file-conflict" : "change-conflict"));
  ui.close();
  assert.equal(env.timerTasks[0].cancelled, true);
});

test("file preview selection A -> B -> A rejects the first A and releases on close", async () => {
  activate("s2");
  env.exec = async command => command === "sh" ? ok("f\0a\0f\0b\0") : { code: 1, stdout: "", stderr: "not a git repository" };
  const ui = createView({ view: "files" }, env.cx);
  await env.jobs.shift()(env.cx);
  const first = deferred();
  env.readTextFile = () => first.promise;
  click(ui, "file-a"); const old = env.jobs.shift()(env.cx);
  click(ui, "files-back"); click(ui, "file-b");
  env.readTextFile = async () => "B";
  await env.jobs.shift()(env.cx);
  click(ui, "files-back"); click(ui, "file-a");
  env.readTextFile = async () => "latest A";
  await env.jobs.shift()(env.cx);
  const editorValue = node => node?.kind === "editor" ? node.props.state.options.value : node?.kids?.map(editorValue).find(Boolean);
  assert.equal(editorValue(ui.render()), "latest A");
  first.resolve("obsolete A"); await old;
  assert.equal(editorValue(ui.render()), "latest A");
  assert.equal(env.releases, 1); // B was released when returning to A.
  click(ui, "files-back"); click(ui, "file-b");
  const pending = deferred(); env.readTextFile = () => pending.promise;
  const job = env.jobs.shift()(env.cx);
  ui.close(); pending.resolve("closed preview"); await job;
  assert.equal(editorValue(ui.render()), undefined);
  assert.equal(env.releases, 2);
});

test("sidebar and search agree when top-level agents repeat and children share their tab", () => {
  const tab = { id: "tab", name: "Agent", named: true, active: true, index: 1, status: "working" };
  env.spaces[0].tabs = [tab];
  const program = { key: "agent", name: "Agent", agent: true };
  const root = { address: "root", space: "s1", tab: "tab", status: "working", program };
  env.agents = [root, root, { ...root, address: "child" }];
  env.terminals = [
    { address: "root", state: "live" },
    { address: "child", parent: "root", state: "live" },
    { address: "leaf", parent: "child", state: "live" },
    { address: "finished", parent: "root", state: "exited" },
  ];
  const sidebar = new Spaces();
  const sessions = sidebar.sessions([{ w: env.spaces[0] }], new Map([["s1", env.agents]]), env.terminals, []);
  assert.equal(sessions.get("s1")[0].subs, 2);
  const picker = createView({ view: "picker" }, env.cx);
  assert.match(text(find(picker.render(), "pk-tab")), /\+2/);
});

test("legacy uncancellable watches cannot refresh or rearm after close", async () => {
  const waiting = deferred();
  env.watchFolder = () => waiting.promise;
  let refreshes = 0;
  const lifecycle = new PanelLifecycle(env.cx, () => { refreshes++; });
  lifecycle.watch("/demo", lifecycle.sync(), env.cx);
  const watching = env.jobs.shift()(env.cx);
  lifecycle.close();
  waiting.resolve(["/demo/file"]);
  await watching;
  assert.equal(refreshes, 0);
  assert.equal(env.calls.get("watchFolder"), 1);
});
