// Native layout JSON cannot import UI tokens; keep its frames in sync at build time.
import { readFile, writeFile } from "node:fs/promises";
import { UI } from "../mods/spaces-status/ui/tokens.js";
const path = new URL("../layouts/main-status.json", import.meta.url);
const source = await readFile(path, "utf8"), layout = JSON.parse(source);
function visit(node) {
  if (!node || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node)) {
    if (["border", "focus", "divider"].includes(key) && typeof value?.width === "number") value.width = UI.stroke;
    visit(value);
  }
}
visit(layout);
if (JSON.stringify(JSON.parse(source)) !== JSON.stringify(layout)) {
  if (process.argv.includes("--check")) throw Error("Layout frame widths differ from UI.stroke; run npm run build.");
  await writeFile(path, JSON.stringify(layout, null, 2) + "\n");
}
