import { readFileSync } from "node:fs";
import ts from "typescript";

// Pure token modules have no host imports. Read canonical TS, never potentially
// stale checked-in JS; this also keeps --check non-writing.
export async function sourceTokens(name = "tokens") {
  const file = new URL(`../mods/spaces-status/ui/${name}.ts`, import.meta.url);
  const source = readFileSync(file, "utf8");
  const result = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputText).toString("base64")}`);
}
