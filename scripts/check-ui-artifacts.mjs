import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Compare shipping JS with an in-memory compiler emit. Validation never fixes
// stale files: edit TS, run build, then commit the matching artifacts together.
const configPath = fileURLToPath(new URL("../mods/spaces-status/tsconfig.json", import.meta.url));
const config = ts.readConfigFile(configPath, ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, fileURLToPath(new URL("../mods/spaces-status/", import.meta.url)));
const host = ts.createCompilerHost(parsed.options);
const emitted = new Map();
host.writeFile = (path, text) => emitted.set(path, text);
const program = ts.createProgram(parsed.fileNames, parsed.options, host);
const result = program.emit();
const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program), ...result.diagnostics];
if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCanonicalFileName: name => name, getCurrentDirectory: () => process.cwd(), getNewLine: () => "\n",
}));
for (const [path, text] of emitted) {
  if (!existsSync(path) || readFileSync(path, "utf8") !== text) throw new Error(`Stale runtime artifact; run npm run build: ${path}`);
}
