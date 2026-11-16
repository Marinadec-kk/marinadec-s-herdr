import test from "node:test";
import assert from "node:assert/strict";
import { readLineage, checkoutKey, originFor, sourceParent, originLabel } from "../mods/spaces-status/worktree-lineage.js";
import { spaceHierarchy } from "../mods/spaces-status/presentation/hierarchy.js";
import { readAppearance, ensureMachineDefaults, ensureSpaceDefaults, assignSpaceColors } from "../mods/spaces-status/appearance-model.js";

const origin = {
  machine: "pi", repo: "/repo", path: "/trees/b", branch: "feature-b",
  source: { space: "a", name: "Feature A", path: "/trees/a", branch: "feature-a", commit: "a".repeat(40) },
};
const fixtures = () => {
  const items = [
    { id: "main", machine: "pi", path: "/repo", repo: "/repo" },
    { id: "a", machine: "pi", path: "/trees/a", repo: "/repo", worktree: true, parent: "main" },
    { id: "b", machine: "pi", path: "/trees/b", repo: "/repo", worktree: true, parent: "a" },
    { id: "c", machine: "pi", path: "/trees/c", repo: "/repo", worktree: true, parent: "main" },
  ];
  const state = ensureSpaceDefaults(ensureMachineDefaults(readAppearance(null), ["pi"]), items);
  return { items, state };
};
test("creation ancestry survives restart, preserves exact origin and inherits one color through multiple worktrees", () => {
  const { items, state } = fixtures();
  const lineage = readLineage(JSON.parse(JSON.stringify({ entry: origin })));
  assert.deepEqual(originFor(lineage, items[2]), origin);
  assert.equal(sourceParent(origin, items, state), "a");
  assert.match(originLabel(origin), /Feature A · feature-a @ aaaaaaa/);
  const restarted = readAppearance(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(spaceHierarchy([items[2], items[3], items[0], items[1]], restarted).map(n => [n.id, n.depth]),
    [["main", 0], ["c", 1], ["a", 1], ["b", 2]]);
  const colors = assignSpaceColors(items, {}, restarted, { ansi6: "#abcdef" }, true);
  assert.equal(new Set(Object.values(colors)).size, 1);
});
test("a reopened source resolves by exact machine and checkout, never the main checkout or a matching name", () => {
  const { items, state } = fixtures();
  const reopened = items.map(item => item.id === "a" ? { ...item, id: "a-new" } : item);
  assert.equal(sourceParent(origin, reopened, state), "a-new");
  assert.equal(sourceParent(origin, reopened.map(s => s.id === "a-new" ? { ...s, machine: "other" } : s), state), "a");
  assert.equal(originFor(readLineage({ entry: origin }), { ...items[2], repo: "/different" }), undefined);
  assert.equal(originFor(readLineage({ entry: origin }), { ...items[2], machine: "other" }), undefined);
  assert.equal(checkoutKey("pi", "C:\\trees\\b\\"), checkoutKey("pi", "C:/trees/b"));
});
test("missing sources attach to the nearest visible ancestor; unrelated machines and cycles cannot lose rows", () => {
  const { items, state } = fixtures();
  const absent = spaceHierarchy(items.filter(s => s.id !== "a"), state);
  assert.equal(absent.find(n => n.id === "b").parent, "main");
  state.spaceDefaults.main.worktree = true;
  state.spaceDefaults.main.parent = "b";
  const cycle = spaceHierarchy(items, state);
  assert.equal(new Set(cycle.map(n => n.id)).size, items.length);
  const foreign = spaceHierarchy([{ id: "a", machine: "other" }, items[2]], state);
  assert.equal(foreign.find(n => n.id === "b").parent, undefined);
  assert.deepEqual(readLineage({ invalid: { ...origin, source: { ...origin.source, commit: "bad" } } }), {});
});
