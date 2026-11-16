import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { readAvatar, readAppearance, withProfile } from "../mods/spaces-status/appearance-model.js";
import { PLUSHIES } from "../mods/spaces-status/plush-catalog.js";

test("all 32 SS14 sprites validate, retain original dimensions/hashes and non-NC attribution", async () => {
  const root = new URL("../mods/spaces-status/icons/plushies/", import.meta.url);
  const manifest = JSON.parse(await readFile(new URL("source.json", root), "utf8"));
  const credits = await readFile(new URL("CREDITS.md", root), "utf8");
  assert.equal(PLUSHIES.length, 32);
  assert.equal(new Set(PLUSHIES.map(p => p.id)).size, 32);
  for (const plush of PLUSHIES) {
    const choice = { kind: "plush", id: plush.id };
    assert.deepEqual(readAvatar(choice), choice);
    const png = await readFile(new URL(`${plush.id}.png`, root));
    assert.equal(png.readUInt32BE(16), plush.width);
    assert.equal(png.readUInt32BE(20), plush.height);
    assert.equal(createHash("sha256").update(png).digest("hex"), plush.sha256);
    assert.equal(plush.frameWidth, 32);
    assert.equal(plush.frameHeight, 32);
    assert.ok(["CC-BY-SA-3.0", "CC-BY-SA-4.0", "CC0-1.0"].includes(plush.license));
    assert.ok(credits.includes(plush.id));
  }
  for (const record of manifest.records) {
    const meta = JSON.parse(await readFile(new URL(`${record.group}.meta.json`, root), "utf8"));
    assert.equal(meta.copyright, record.copyright);
    assert.ok(credits.includes(record.copyright));
  }
  assert.equal(PLUSHIES.some(p => p.id.includes("vulp")), false);
  assert.equal(readAvatar({ kind: "plush", id: "../../secret" }), undefined);
  assert.equal(readAvatar({ kind: "plush", id: "ss14-does-not-exist" }), undefined);
});

test("character profiles round-trip in v2 and retain compatible v1 Material settings", () => {
  const old = readAppearance({ version: 1, machines: { local: { avatar: { kind: "pixel", name: "cat" } } },
    spaces: { s1: { avatar: { kind: "material", family: "round", name: "home" } } } });
  const next = withProfile(old, { kind: "machine", machine: "pi" }, { avatar: { kind: "plush", id: PLUSHIES[0].id } });
  assert.deepEqual(readAppearance(JSON.parse(JSON.stringify(next))), next);
  assert.deepEqual(next.machines.local, old.machines.local);
  assert.deepEqual(next.spaces.s1, old.spaces.s1);
});

// Inspect the font's actual cmap, not a website's claim about supported subsets.
function glyphFor(font, code) {
  let cmap;
  for (let i = 0; i < font.readUInt16BE(4); i++) {
    const at = 12 + i * 16;
    if (font.toString("ascii", at, at + 4) === "cmap") cmap = font.readUInt32BE(at + 8);
  }
  assert.ok(cmap, "font has a cmap table");
  for (let i = 0; i < font.readUInt16BE(cmap + 2); i++) {
    const sub = cmap + font.readUInt32BE(cmap + 4 + i * 8 + 4), format = font.readUInt16BE(sub);
    if (format === 12) {
      for (let j = 0; j < font.readUInt32BE(sub + 12); j++) {
        const at = sub + 16 + j * 12, start = font.readUInt32BE(at), end = font.readUInt32BE(at + 4);
        if (code >= start && code <= end) return font.readUInt32BE(at + 8) + code - start;
      }
    }
    if (format === 4) {
      const segments = font.readUInt16BE(sub + 6) / 2, ends = sub + 14, starts = ends + segments * 2 + 2;
      const deltas = starts + segments * 2, ranges = deltas + segments * 2;
      for (let j = 0; j < segments; j++) {
        if (code < font.readUInt16BE(starts + j * 2) || code > font.readUInt16BE(ends + j * 2)) continue;
        const delta = font.readInt16BE(deltas + j * 2), range = font.readUInt16BE(ranges + j * 2);
        if (!range) return (code + delta) & 0xffff;
        const glyph = font.readUInt16BE(ranges + j * 2 + range + (code - font.readUInt16BE(starts + j * 2)) * 2);
        if (glyph) return (glyph + delta) & 0xffff;
      }
    }
  }
  return 0;
}

test("bundled text fonts have every Russian letter (including Ё/ё), pinned hashes and OFL licenses", async () => {
  const root = new URL("../mods/spaces-status/fonts/", import.meta.url);
  const tiny5 = JSON.parse(await readFile(new URL("tiny5-source.json", root), "utf8"));
  const liberation = JSON.parse(await readFile(new URL("liberation-source.json", root), "utf8"));
  for (const [file, hash] of Object.entries({ "Tiny5.ttf": tiny5.sha256, ...liberation.files })) {
    const font = await readFile(new URL(file, root));
    assert.equal(createHash("sha256").update(font).digest("hex"), hash, file);
    for (const char of "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя") {
      assert.ok(glyphFor(font, char.codePointAt(0)) > 0, `${file}: missing glyph ${char}`);
    }
  }
  assert.match(await readFile(new URL("OFL-Tiny5.txt", root), "utf8"), /SIL OPEN FONT LICENSE/);
  assert.match(await readFile(new URL(liberation.license, root), "utf8"), /SIL OPEN FONT LICENSE/);
});
