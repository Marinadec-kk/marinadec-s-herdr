// Only owned geometry paths are synchronized; topology, user sizing, terminal
// padding, themes and platform exclusions are not generic spacing fields.
import { readFile, writeFile } from "node:fs/promises";
import { sourceTokens } from "./ui-source.mjs";
const { UI, SPACING, CHROME } = await sourceTokens();
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
const node = id => {
  const find = value => value?.id === id ? value : value?.children?.map(find).find(Boolean);
  const found = find(layout);
  if (!found) throw new Error(`Missing owned layout node: ${id}`);
  return found;
};
for (const [id, px] of [["brand", CHROME.brand], ["tabs", CHROME.tabs], ["sidebar-footer", CHROME.footer], ["status", CHROME.status]])
  node(id).size.px = px;
node("work-body").padding = SPACING.workspace.inset;
node("work-body").gap = SPACING.workspace.gap;
node("main").content.pane.gap = SPACING.workspace.gap;
node("main").content.pane.header.height = CHROME.pane;
if (JSON.stringify(JSON.parse(source)) !== JSON.stringify(layout)) {
  if (process.argv.includes("--check")) throw Error("Owned layout metrics differ from ui/tokens.ts; run npm run build.");
  await writeFile(path, JSON.stringify(layout, null, 2) + "\n");
}
