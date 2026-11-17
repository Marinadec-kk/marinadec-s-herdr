import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { UI, SPACING, CHROME, GALLERY, menuHeight } from "../mods/spaces-status/ui/tokens.js";
import { sourceTokens } from "../scripts/ui-source.mjs";
import { checkSpacing, spacingIssues } from "../scripts/check-ui-spacing.mjs";
import { tonePalette, tint } from "../mods/spaces-status/appearance-colors.js";
import { CHARACTER_ACCENTS } from "../mods/spaces-status/character-accents.js";

const root = new URL("../", import.meta.url);
const theme = JSON.parse(readFileSync(new URL("themes/opencode-tui.json", root), "utf8"));
const layout = JSON.parse(readFileSync(new URL("layouts/main-status.json", root), "utf8"));
const find = (node, id) => node?.id === id ? node : node.children?.map(child => find(child, id)).find(Boolean);
const luminance = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return .2126 * r + .7152 * g + .0722 * b;
};
const contrast = (a, b) => {
  const l = [luminance(a), luminance(b)].sort((a, b) => b - a);
  return (l[0] + .05) / (l[1] + .05);
};

test("owned UI padding, margins and gaps have no local nonzero literals", () => {
  assert.deepEqual(checkSpacing(new URL("../mods/spaces-status/", import.meta.url).pathname), []);
});
test("spacing guard understands expressions, zero resets, comments and native shortcuts", () => {
  for (const source of ["el.gap(8)", "el.px(compact ? 4 : 8)", "el.pl(BASE + depth * 12)", "el.gap_2()", "el.p('8px')"])
    assert.equal(spacingIssues(source).length, 1, source);
  for (const source of ["el.px(0)", "el.gap(SPACING.row.gap)", "el.pl(depth < 6 ? SPACING.sidebar.indent : 0)",
    "// el.gap(8)\nconst example = 'el.p(9)'"])
    assert.deepEqual(spacingIssues(source), [], source);
});
test("canonical TS and runtime tokens agree; native layout geometry uses the same decisions", async () => {
  const source = await sourceTokens();
  assert.deepEqual(source.SPACING, SPACING);
  assert.deepEqual(source.CHROME, CHROME);
  for (const [id, height] of [["brand", CHROME.brand], ["tabs", CHROME.tabs], ["sidebar-footer", CHROME.footer], ["status", CHROME.status]])
    assert.equal(find(layout, id).size.px, height);
  assert.equal(find(layout, "main").content.pane.header.height, CHROME.pane);
  assert.equal(find(layout, "main").content.pane.gap, SPACING.workspace.gap);
  assert.equal(find(layout, "work-body").padding, SPACING.workspace.inset);
  assert.equal(find(layout, "work-body").gap, SPACING.workspace.gap);
  assert.deepEqual(layout.terminal_padding, [14, 12]); // Not generic UI spacing.
  assert.equal(CHROME.footer, UI.stroke + SPACING.chrome.footerInset * 2 + CHROME.footerRow * 2 + SPACING.chrome.footerGap);
  assert.equal(menuHeight(3), UI.stroke * 2 + SPACING.menu.inset * 2 + UI.control * 3 + SPACING.menu.rowGap * 2);
  assert.equal(GALLERY.cell + GALLERY.gap, 54);
});
test("OpenCode terminal adaptation pins real UI colors without inventing an ANSI palette", () => {
  assert.equal(layout.theme.dark, "opencode-tui");
  assert.equal(layout.theme.light, "paper");
  assert.equal(theme.background, "#0a0a0a");
  assert.equal(theme.colors.chrome, "#141414");
  assert.equal(theme.colors.raised, "#1e1e1e");
  assert.equal(theme.foreground, "#eeeeee");
  assert.equal(theme.colors.accent, "#fab283");
  assert.deepEqual(theme.ansi, [
    "#414b5a", "#e58c9a", "#89c5aa", "#d9be82", "#91b6ee", "#b9a0e2", "#85c4d0", "#cdd6e4",
    "#7f91a7", "#f5a5b2", "#a5dec3", "#edd39c", "#accbfa", "#d0b7f4", "#a0dce5", "#f0f5fc",
  ]);
  assert.match(readFileSync(new URL("themes/OpenCode-LICENSE.txt", root), "utf8"), /Copyright \(c\) 2025 opencode/);
});
test("OpenCode surfaces retain readable text, distinct statuses and character-derived space colors", () => {
  const t = theme.colors;
  for (const bg of [t.background, t.chrome, t.raised, t.popover])
    assert.ok(contrast(t.foreground, bg) >= 4.5);
  assert.ok(contrast(t.muted, t.chrome) >= 4.5);
  assert.equal(new Set(["working", "blocked", "done", "idle"].map(key => t[key])).size, 4);
  for (const key of ["working", "blocked", "done", "idle"]) assert.ok(contrast(t[key], t.chrome) >= 3);
  for (const accent of Object.values(CHARACTER_ACCENTS)) {
    for (const shade of tonePalette(accent, true))
      assert.ok(contrast(shade, tint(shade, t.chrome, .24)) >= 3, shade);
  }
});
