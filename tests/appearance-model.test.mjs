import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  readAppearance, ensureMachineDefaults, ensureSpaceDefaults, withProfile, profileFor, assignSpaceColors,
  normalizeColor, readAvatar, resolveColor, machineKey, machineAvatar, spaceAvatar,
  PROJECT_COLORS, WORKTREE_AVATAR,
} from "../mods/spaces-status/appearance-model.js";
import { tonePalette } from "../mods/spaces-status/appearance-colors.js";
import { MATERIAL_ICONS } from "../mods/spaces-status/material-catalog.js";
import { PLUSHIES } from "../mods/spaces-status/plush-catalog.js";

const empty = () => readAppearance(null);
const machines = [null, "small", "pi", "big"];
const spaces = Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, machine: "small", name: `Space ${i}` }));
const theme = { ansi6: "#22a99a" };
const seeded = () => {
  let n = 17;
  return () => ((n = (n * 1664525 + 1013904223) >>> 0) / 2 ** 32);
};
const make = () => ensureSpaceDefaults(ensureMachineDefaults(empty(), machines, seeded()), spaces, seeded());

test("random characters and icons allocate without repeats and do not depend on names", () => {
  const state = make();
  assert.equal(new Set(machines.map(m => machineAvatar(state, m).id)).size, 4);
  assert.equal(new Set(spaces.map(s => spaceAvatar(state, s.id).name)).size, 6);
  assert.equal(new Set(spaces.map(s => state.spaceDefaults[s.id].tone)).size, 6);
  const renamed = spaces.map(s => ({ ...s, name: "all the same" }));
  const noRandom = () => { throw new Error("Existing identities must not reroll"); };
  assert.deepEqual(ensureSpaceDefaults(state, renamed.reverse(), noRandom), state);
  assert.deepEqual(ensureMachineDefaults(state, [...machines].reverse(), noRandom), state);
  const first = ensureMachineDefaults(empty(), [null], () => 0);
  const last = ensureMachineDefaults(empty(), [null], () => .9999);
  assert.notDeepEqual(machineAvatar(first, null), machineAvatar(last, null));
});

test("restart, empty snapshots, offline machines and adding siblings preserve existing defaults", () => {
  const original = make();
  const reloaded = readAppearance(JSON.parse(JSON.stringify(original)));
  assert.deepEqual(reloaded, original);
  assert.deepEqual(ensureSpaceDefaults(original, []), original);
  assert.deepEqual(ensureMachineDefaults(original, []), original);
  const next = ensureSpaceDefaults(ensureMachineDefaults(original, [...machines, "new"], seeded()),
    [...spaces, { id: "new-space", machine: "small" }], seeded());
  for (const s of spaces) assert.deepEqual(next.spaceDefaults[s.id], original.spaceDefaults[s.id]);
  for (const key of Object.keys(original.defaults)) assert.deepEqual(next.defaults[key], original.defaults[key]);
});

test("v1 migration preserves characters, Material names and machine colors, and removes space color overrides", () => {
  const legacy = { version: 1,
    machines: { local: { color: "#abcdef", avatar: { kind: "plush", id: PLUSHIES[7].id } },
      "remote:pi": { avatar: { kind: "material", family: "round", name: "home" } } },
    spaces: { s0: { avatar: { kind: "material", family: "round", name: "rocket" }, color: "#123456" },
      s1: { avatar: { kind: "plush", id: PLUSHIES[0].id } } },
    defaults: { local: { color: "ansi6", mascot: "robot" } },
  };
  const state = ensureSpaceDefaults(ensureMachineDefaults(readAppearance(legacy), machines, seeded()), spaces, seeded());
  assert.equal(state.version, 2);
  assert.deepEqual(state.machines.local, legacy.machines.local);
  assert.deepEqual(state.spaces.s0, { avatar: { ...legacy.spaces.s0.avatar, family: "sharp" } });
  assert.equal(machineAvatar(state, "pi").kind, "plush");
  assert.equal(spaceAvatar(state, "s1").kind, "material");
  assert.equal(state.defaults.local.color, "ansi6");
  assert.deepEqual(readAppearance(JSON.parse(JSON.stringify(state))), state);
});

test("allocation reserves manual choices and reuses finite pools gracefully", () => {
  const state = empty();
  state.machines.local = { avatar: { kind: "plush", id: PLUSHIES[0].id } };
  const next = ensureMachineDefaults(state, [null, "pi"], () => 0);
  assert.notEqual(machineAvatar(next, "pi").id, PLUSHIES[0].id);
  const many = ensureMachineDefaults(next, Array.from({ length: 40 }, (_, i) => `m${i}`), seeded());
  assert.equal(Object.keys(many.defaults).length, 42);
  assert.deepEqual(ensureMachineDefaults(readAppearance(JSON.parse(JSON.stringify(many))), []), many);
});

test("space shades inherit their machine and follow recoloring without rerolling icons or slots", () => {
  const state = make(), colors = assignSpaceColors(spaces, {}, state, theme, true);
  const next = withProfile(state, { kind: "machine", machine: "small" }, { color: "#d9649a" });
  const changed = assignSpaceColors(spaces, colors, next, theme, true);
  for (const s of spaces) assert.notEqual(changed[s.id], colors[s.id]);
  assert.deepEqual(next.spaceDefaults, state.spaceDefaults);
  assert.deepEqual(assignSpaceColors([...spaces].reverse(), colors, state, theme, true), colors);
  assert.deepEqual(assignSpaceColors([], colors, state, theme, true), colors);
  const edited = withProfile(next, { kind: "space", id: "s0" }, { tone: 4, color: "#ffffff" });
  assert.deepEqual(edited.spaces, next.spaces);
  assert.equal(assignSpaceColors(spaces, {}, edited, theme, true).s0, changed.s0);
});

test("light and dark tonal palettes are distinct, valid and readable against their surfaces", () => {
  const luminance = hex => {
    const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4);
    return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
  };
  assert.equal(PROJECT_COLORS.length, 24);
  for (const color of [...PROJECT_COLORS.map(c => resolveColor(c, theme)), "#000000", "#ffffff", "#ff0000"]) {
    for (const dark of [true, false]) {
      const palette = tonePalette(color, dark);
      assert.equal(new Set(palette).size, 12);
      for (const shade of palette) {
        assert.match(shade, /^#[a-f0-9]{6}$/);
        const l = luminance(shade), bg = luminance(dark ? "#10151b" : "#f5f5f0");
        const contrast = (Math.max(l, bg) + .05) / (Math.min(l, bg) + .05);
        assert.ok(contrast >= 3, `${color} → ${shade}, dark=${dark}: ${contrast}`);
      }
    }
  }
});

test("profile editing enforces machine/space avatar roles and resets overrides only", () => {
  const state = make(), target = { kind: "space", id: "s0" }, before = JSON.stringify(state);
  const next = withProfile(state, target, { avatar: { kind: "material", family: "sharp", name: "rocket_launch" } });
  assert.equal(JSON.stringify(state), before);
  assert.equal(profileFor(next, target).avatar.name, "rocket_launch");
  assert.deepEqual(withProfile(next, target, {}), state);
  assert.equal(withProfile(state, target, { avatar: { kind: "plush", id: PLUSHIES[0].id } }).spaces.s0, undefined);
  assert.equal(withProfile(state, { kind: "machine", machine: null },
    { avatar: { kind: "material", family: "round", name: "home" } }).machines.local, undefined);
});

test("invalid state is rejected; a remote named local has a distinct identity", () => {
  for (const raw of [null, [], "bad", 1, { version: 999 }]) assert.deepEqual(readAppearance(raw), empty());
  assert.notEqual(machineKey(null), machineKey("local"));
  assert.equal(readAvatar({ kind: "material", family: "bad", name: "rocket" }), undefined);
  assert.equal(readAvatar({ kind: "material", family: "sharp", name: "not_a_real_icon" }), undefined);
  assert.equal(readAvatar({ kind: "pixel", name: "cat" }), undefined);
  assert.equal(normalizeColor(" #AbCdEf "), "#abcdef");
  for (const bad of ["", "auto", "#abc", "red", "#12345678", {}, null]) assert.equal(normalizeColor(bad), undefined);
  assert.equal(resolveColor("ansi4", theme), "#5b8def");
});

test("the full Material catalog retains all five styles", () => {
  assert.ok(MATERIAL_ICONS.length >= 2200);
  for (let family = 0; family < 5; family++) assert.ok(MATERIAL_ICONS.filter(icon => icon.codes[family] != null).length >= 2100);
});

test("twelve ordinary siblings use free shades before any reuse; worktrees consume no slot", () => {
  const all = Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, machine: "small" }));
  const tree = { id: "tree", machine: "small", worktree: true, parent: "s0" };
  const state = ensureSpaceDefaults(ensureMachineDefaults(empty(), ["small"]), [tree, ...all], seeded());
  assert.equal(new Set(all.map(s => state.spaceDefaults[s.id].tone)).size, 12);
  assert.deepEqual(spaceAvatar(state, "tree"), WORKTREE_AVATAR);
  const changed = withProfile(state, { kind: "space", id: "tree" },
    { color: "#ffffff", avatar: { kind: "material", family: "sharp", name: "home" } });
  assert.deepEqual(spaceAvatar(changed, "tree"), WORKTREE_AVATAR);
  const colors = assignSpaceColors([tree, ...all], {}, changed, theme, true);
  assert.equal(colors.tree, colors.s0);
  const recolored = withProfile(changed, { kind: "machine", machine: "small" }, { color: "#ef6f6c" });
  const nextColors = assignSpaceColors([tree], colors, recolored, theme, true);
  assert.equal(nextColors.tree, nextColors.s0);
  assert.notEqual(nextColors.tree, colors.tree);
  assert.deepEqual(ensureSpaceDefaults(state, [tree, ...all].reverse(), () => { throw Error("rerolled"); }), state);
});

test("late worktree discovery releases its shade and retains parent while Git is unavailable", () => {
  const initial = ensureSpaceDefaults(make(), [{ id: "tree", machine: "small" }], seeded());
  const detected = ensureSpaceDefaults(initial, [{ id: "tree", machine: "small", worktree: true, parent: "s0" }]);
  assert.deepEqual(spaceAvatar(detected, "tree"), WORKTREE_AVATAR);
  assert.deepEqual(ensureSpaceDefaults(detected, [{ id: "tree", machine: "small" }]), detected);
  assert.deepEqual(readAppearance(JSON.parse(JSON.stringify(detected))), detected);
});

test("bundled fonts match pinned hashes and retain their license", async () => {
  const root = new URL("../mods/spaces-status/fonts/", import.meta.url);
  const source = JSON.parse(await readFile(new URL("source.json", root), "utf8"));
  for (const [name, digest] of Object.entries(source.files).filter(([name]) => !name.endsWith(".codepoints"))) {
    assert.equal(createHash("sha256").update(await readFile(new URL(name, root))).digest("hex"), digest, name);
  }
  assert.match(await readFile(new URL("LICENSE", root), "utf8"), /Apache License/);
});
