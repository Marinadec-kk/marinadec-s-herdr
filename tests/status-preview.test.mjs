import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { MACHINES, fixtures, spaceTip } from "../preview/status-review/fixtures.js";
import { project, segments } from "../preview/status-review/tree.js";

function element() {
  const node = { props: {}, kids: [] };
  const proxy = new Proxy(node, { get(object, key) {
    if (key in object) return object[key];
    if (key === "then") return undefined;
    return (...args) => {
      if (key === "child") node.kids.push(args[0]);
      else if (key === "children") node.kids.push(...args[0]);
      else if (key === "when") return args[0] ? args[1](proxy) : proxy;
      else node.props[key] = args.length > 1 ? args : args[0] ?? true;
      return proxy;
    };
  } });
  return proxy;
}
globalThis.__statusPreviewElement = element;
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "gpui-kit" || specifier === "gpui-base")
    return { url: "data:text/javascript,export const div=()=>globalThis.__statusPreviewElement(); export const h_flex=div; export const svg=path=>div().asset(path);", shortCircuit: true };
  return next(specifier, context);
} });
const { STATES, aggregate, statusBadge } = await import("../preview/status-review/status.js");

test("prototype status slots have constant bounds, native animation, and no false null status", () => {
  for (const compact of [true, false]) {
    for (const state of STATES) {
      const t = { working: "#e6bd62", blocked: "#ec5e71", done: "#77c89b", idle: "#80909f" };
      const badge = statusBadge(t, state, { compact, label: "Owner → Agent: status" });
      assert.equal(badge.props.size, compact ? 10 : 16);
      if (!state) { assert.equal(badge.kids.length, 0); continue; }
      assert.equal(badge.props.tooltip, "Owner → Agent: status");
      const glyph = badge.kids[0], size = compact ? 8 : 12;
      assert.equal(glyph.props.size, size);
      assert.equal(glyph.props.spin, undefined);
      assert.equal(glyph.props.loop?.[0], state === "working" ? "opacity" : undefined);
      assert.equal(glyph.props.asset, `mods/status-review/status-${state}.svg`);
      assert.equal(glyph.props.text_color, t[state]);
    }
  }
});

test("synthetic fixtures include every state, no-agent space, nested worktrees and mixed-session summaries", () => {
  const rows = fixtures();
  assert.equal(MACHINES.length, 2);
  assert.deepEqual(new Set(rows.flatMap(row => row.sessions.map(session => session.status))), new Set(STATES.filter(Boolean)));
  assert.equal(aggregate(rows.find(row => row.id === "notes").sessions), null);
  assert.equal(aggregate(rows.find(row => row.id === "cross").sessions), "done");
  assert.equal(aggregate([{ status: "idle" }, { status: "working" }, { status: "done" }, { status: "blocked" }]), "blocked");
  assert.equal(spaceTip(rows.find(row => row.id === "atlas-deep"), rows), "devbox → cross_analysis → atlas_merging → atlas_validation");
  const second = fixtures();
  rows[0].sessions[0].status = "blocked";
  assert.equal(second[0].sessions[0].status, "working");
});

test("tree keeps ancestry and stops lines at the last child", () => {
  const rows = project(fixtures()), get = id => rows.find(row => row.id === id);
  assert.equal(get("atlas").depth, 1);
  assert.equal(get("atlas-deep").depth, 2);
  assert.equal(get("atlas").last, false);
  assert.equal(get("docs-tree").last, true);
  assert.deepEqual(segments(get("gov"), 32), []);
  assert.deepEqual(segments(get("atlas"), 28)[0], [0, 0, 2, 28]);
  assert.deepEqual(segments(get("docs-tree"), 28)[0], [0, 0, 2, 14]);
  const deep = segments(get("atlas-deep"), 28);
  assert.ok(deep.some(line => line[0] === 0 && line[3] === 28));
  assert.ok(deep.some(line => line[0] === 4));
  for (const line of deep) assert.ok(line[0] + line[2] <= 8);
});
