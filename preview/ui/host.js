// Synthetic host. Only appearance/window reads come from the isolated app;
// commands, filesystem reads, core access and shared writes stay in this fixture.
export { theme, settings, home, keys, updates, window } from "herdr";
const sample = [{
  id: "s", name: "Очень длинное название проекта / Demo", machine: null, active: true,
  folder: "/demo", branch: "feature/long-branch-name", status: "blocked",
  tabs: [{ id: "t", name: "Исправление интерфейса", named: true, active: true, status: "blocked" }],
}, ...[
  ["notes", "Заметки", null, null], ["r", "Remote project", "devbox", "working"],
  ["w", "feature/sidebar", "devbox", "done"], ["deep", "Вложенный worktree", "devbox", "idle"],
].map(([id, name, machine, status]) => ({
  id, name, machine, status, active: false, folder: `/demo/${id}`,
  tabs: [{ id: `t-${id}`, name, named: true, active: true, status }],
}))];
export const spaces = () => sample;
export const panes = () => [pane, ...sample.slice(1).map(space => ({
  pane: `p-${space.id}`, tab: space.tabs[0].id, terminal: space.id, cwd: space.folder,
  title: space.name, status: space.status, program: space.status ? { key: "opencode", name: "OpenCode", agent: true } : null,
}))];
export const agents = () => sample.filter(space => space.status).map(space => ({
  address: space.id === "s" ? "term" : space.id, space: space.id, tab: space.tabs[0].id,
  status: space.status, title: space.name, program: { key: "opencode", name: "OpenCode", agent: true },
}));
export const terminals = () => agents();
let sidebarWidth = 299;
export const setReviewWidth = width => { sidebarWidth = width; };
export const layout = () => ({ id: "root", children: [
  { id: "sidebar", size: { px: sidebarWidth } }, { id: "panel", hidden: true },
] });
export const machines = () => [{ name: null, layout: "ready" }, { name: "devbox", layout: "ready" }];
export const props = () => ({ pane: "p" });
export const pane = {
  pane: "p", tab: "t", terminal: "term", title: "OpenCode", status: "idle",
  cwd: "/demo/very/long/path/to/project", focused: true,
};
export const run = () => {};
const values = new Map([
  ["spaces-status.appearance", {
    version: 2, machines: {}, spaces: {},
    defaults: {
      local: { color: "#6f9bad", avatar: { kind: "plush", id: "ss14-shark-blue" } },
      "remote:devbox": { color: "#b48ead", avatar: { kind: "plush", id: "ss14-moth-icon" } },
    },
    spaceDefaults: Object.fromEntries(sample.map((space, i) => [space.id, {
      machine: space.machine ? `remote:${space.machine}` : "local", tone: i === 1 ? 1 : 0,
      avatar: { kind: "material", family: "sharp", name: ["rocket", "description", "home", "account_tree", "account_tree"][i] },
      ...(["w", "deep"].includes(space.id) ? { worktree: true, parent: space.id === "w" ? "r" : "w" } : {}),
    }])),
  }],
  ["space.colors", { s: "ansi6" }],
]);
export const shared = key => values.get(key);
export const setShared = (key, value) => values.set(key, value);
export const exec = async () => ({ code: 0, stdout: "", stderr: "" });
export const hc = async () => ({ code: 0, stdout: "[]", stderr: "" });
export const knownAgents = async () => [];
export const readTextFile = async () => null;
export const watchFolder = () => new Promise(() => {});
export const openOverlay = () => null;
export const closeOverlay = () => {};
export const appHome = () => "/preview";
export const focused = () => ({ space: "s", tab: "t", pane: "p", terminal: "term" });
export const setAgentOrder = () => {};
export const nextCommand = () => new Promise(() => {});
