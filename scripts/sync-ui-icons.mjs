import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { sourceTokens } from "./ui-source.mjs";
const { GLYPHS } = await sourceTokens("glyphs");

// One compound path, so adjacent cells do not anti-alias separately.
for (const [name, rows] of Object.entries(GLYPHS)) {
  const path = rows.flatMap((row, y) => [...row.matchAll(/1+/g)].map(match =>
    `M${match.index} ${y}h${match[0].length}v1h-${match[0].length}z`)).join("");
  const text = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 7 7"><path d="${path}"/></svg>\n`;
  const file = new URL(`../mods/spaces-status/icons/ui/${name}.svg`, import.meta.url);
  if (process.argv.includes("--check")) {
    if (readFileSync(file, "utf8") !== text) throw new Error(`Run build: ${name}`);
  } else {
    mkdirSync(new URL("../mods/spaces-status/icons/ui/", import.meta.url), { recursive: true });
    writeFileSync(file, text);
  }
}
