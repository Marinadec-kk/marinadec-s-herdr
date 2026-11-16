import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  readAppearance, ensureMachineDefaults, withProfile, profileFor, assignSpaceColors,
  normalizeColor, readAvatar, resolveColor, machineKey, PIXELS, PROJECT_COLORS,
} from "../mods/spaces-status/appearance-model.js";
import { MATERIAL_ICONS } from "../mods/spaces-status/material-catalog.js";

const empty = () => readAppearance(null);
const machines = [null, "small", "pi", "big"];

test("pi and small have distinct default colors and mascots, as do all four machines", () => {
  const state = ensureMachineDefaults(empty(), machines);
  assert.equal(new Set(Object.values(state.defaults).map(p => p.color)).size, 4);
  assert.equal(new Set(Object.values(state.defaults).map(p => p.mascot)).size, 4);
  assert.notDeepEqual(state.defaults["remote:pi"], state.defaults["remote:small"]);
  assert.deepEqual(state, ensureMachineDefaults(empty(), [...machines].reverse()));
});

test("reordering, adding a machine, temporary absence and a serialized restart preserve existing identities", () => {
  const original = ensureMachineDefaults(empty(), [null, "pi", "small"]);
  const changed = ensureMachineDefaults(original, ["aaa", "small", null, "pi"]);
  for (const key of Object.keys(original.defaults)) assert.deepEqual(changed.defaults[key], original.defaults[key]);
  const away = ensureMachineDefaults(changed, [null]);
  assert.deepEqual(away.defaults, changed.defaults);
  assert.deepEqual(ensureMachineDefaults(readAppearance(JSON.parse(JSON.stringify(away))), ["pi", null, "small", "aaa"]), away);
});

test("default allocation repairs duplicate saved slots while space is available", () => {
  const state = empty();
  state.defaults = {
    "remote:pi": { color: "ansi4", mascot: "robot" },
    "remote:small": { color: "ansi4", mascot: "robot" },
  };
  const next = ensureMachineDefaults(state, ["pi", "small"]);
  assert.equal(next.defaults["remote:pi"].color, "ansi4");
  assert.notEqual(next.defaults["remote:pi"].color, next.defaults["remote:small"].color);
  assert.notEqual(next.defaults["remote:pi"].mascot, next.defaults["remote:small"].mascot);
});

test("finite pools gracefully reuse slots and remain stable past capacity", () => {
  const names = Array.from({ length: 16 }, (_, i) => `machine-${i}`);
  const state = ensureMachineDefaults(empty(), names);
  assert.equal(Object.keys(state.defaults).length, 16);
  for (const look of Object.values(state.defaults)) {
    assert.ok(PROJECT_COLORS.includes(look.color));
    assert.ok(PIXELS.includes(look.mascot));
  }
  assert.deepEqual(ensureMachineDefaults(state, [...names].reverse()), state);
});

test("local and a remote literally called local have different storage keys", () => {
  assert.notEqual(machineKey(null), machineKey("local"));
});

test("untrusted shared data is validated instead of cast to a profile", () => {
  for (const raw of [null, [], "bad", 1, { version: 999 }]) assert.deepEqual(readAppearance(raw), empty());
  assert.equal(readAvatar({ kind: "pixel", name: "../other/file" }), undefined);
  assert.equal(readAvatar({ kind: "material", family: "bad", name: "rocket" }), undefined);
  assert.equal(readAvatar({ kind: "material", family: "round", name: "../rocket" }), undefined);
  assert.deepEqual(readAvatar({ kind: "material", family: "round", name: "rocket" }),
    { kind: "material", family: "round", name: "rocket" });
});

test("custom colors normalize and reject invalid strings", () => {
  assert.equal(normalizeColor(" #AbCdEf "), "#abcdef");
  assert.equal(normalizeColor("ansi4"), "ansi4");
  for (const bad of ["", "auto", "#abc", "red", "#12345678", {}, null]) assert.equal(normalizeColor(bad), undefined);
  assert.equal(resolveColor("ansi4", { ansi4: "#ffffff", ansi6: "#000000" }), "#5b8def");
});

test("editing and resetting one entity does not mutate or erase other profiles", () => {
  const target = { kind: "space", id: "s1" };
  let state = ensureMachineDefaults(empty(), machines);
  state = withProfile(state, { kind: "machine", machine: "pi" }, { color: "#112233", avatar: { kind: "letter" } });
  const before = JSON.stringify(state);
  const next = withProfile(state, target, { color: "ansi3", avatar: { kind: "material", family: "sharp", name: "rocket_launch" } });
  assert.equal(JSON.stringify(state), before);
  assert.equal(profileFor(next, target).avatar.name, "rocket_launch");
  const reset = withProfile(next, target, {});
  assert.deepEqual(reset, state);
});

test("explicit space colors are pinned, including intentional duplicates", () => {
  const spaces = [{ id: "a", name: "First" }, { id: "b", name: "Second" }, { id: "c", name: "Third" }];
  const profiles = { a: { color: "#123456" }, b: { color: "#123456" } };
  const stored = { a: "ansi6", b: "ansi6", c: "ansi6" };
  const colors = assignSpaceColors(spaces, stored, profiles);
  assert.equal(colors.a, "#123456");
  assert.equal(colors.b, "#123456");
  assert.equal(colors.c, "ansi6");
  assert.deepEqual(stored, { a: "ansi6", b: "ansi6", c: "ansi6" });
  assert.deepEqual(assignSpaceColors([...spaces].reverse(), colors, profiles), colors);
});

test("auto colors yield to pinned colors and an empty snapshot does not wipe state", () => {
  const spaces = [{ id: "auto", name: "Auto" }, { id: "pinned", name: "Pinned" }];
  const colors = assignSpaceColors(spaces, { auto: "ansi6", pinned: "ansi6" }, { pinned: { color: "ansi6" } });
  assert.equal(colors.pinned, "ansi6");
  assert.notEqual(colors.auto, "ansi6");
  assert.deepEqual(assignSpaceColors([], colors, {}), colors);
});

test("the complete bundled catalog has all five families, not a curated subset", () => {
  assert.ok(MATERIAL_ICONS.length >= 2200);
  assert.equal(new Set(MATERIAL_ICONS.map(icon => icon.name)).size, MATERIAL_ICONS.length);
  for (let family = 0; family < 5; family++) assert.ok(MATERIAL_ICONS.filter(icon => icon.codes[family] != null).length >= 2100);
  for (const icon of MATERIAL_ICONS) for (const code of icon.codes) {
    if (code != null) assert.ok(Number.isInteger(code) && code > 0 && code <= 0x10ffff);
  }
  assert.ok(MATERIAL_ICONS.some(icon => icon.name === "rocket_launch"));
});

test("bundled fonts match the pinned source hashes and include their license", async () => {
  const root = new URL("../mods/spaces-status/fonts/", import.meta.url);
  const source = JSON.parse(await readFile(new URL("source.json", root), "utf8"));
  for (const [name, digest] of Object.entries(source.files).filter(([name]) => !name.endsWith(".codepoints"))) {
    const bytes = await readFile(new URL(name, root));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), digest, name);
  }
  assert.match(await readFile(new URL("LICENSE", root), "utf8"), /Apache License/);
});
