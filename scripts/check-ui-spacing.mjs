import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const spacing = /^(?:p[lrbtxy]?|m[lrbtxy]?|gap(?:_[xy])?)$/;
const shortcut = /^(?:p[lrbtxy]?|m[lrbtxy]?|gap(?:_[xy])?)_/;
function rawValue(node) {
  if (!node) return false;
  if (ts.isNumericLiteral(node)) return Number(node.text) !== 0;
  if (ts.isStringLiteral(node)) return node.text !== "0";
  // Conditions may contain structural depth limits; inspect the values, not
  // e.g. the `6` in depth < 6 ? SPACING.sidebar.indent : 0.
  if (ts.isConditionalExpression(node)) return rawValue(node.whenTrue) || rawValue(node.whenFalse);
  if (ts.isBinaryExpression(node)) return rawValue(node.left) || rawValue(node.right);
  if (ts.isParenthesizedExpression(node) || ts.isPrefixUnaryExpression(node)) return rawValue(node.expression ?? node.operand);
  if (ts.isCallExpression(node)) return node.arguments.some(rawValue);
  return false;
}
export function spacingIssues(text, path = "view.ts") {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true), issues = [];
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const name = node.expression.name.text;
      if (shortcut.test(name) || (spacing.test(name) && rawValue(node.arguments[0])))
        issues.push(`${path}:${source.getLineAndCharacterOfPosition(node.expression.name.getStart(source)).line + 1}: use a shared spacing role instead of ${node.getText(source)}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return issues;
}
export function checkSpacing(dir) {
  const issues = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) issues.push(...checkSpacing(path));
    else if (path.endsWith(".ts") && !path.endsWith(".d.ts") && entry.name !== "tokens.ts")
      issues.push(...spacingIssues(readFileSync(path, "utf8"), path));
  }
  return issues;
}
if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const issues = checkSpacing(fileURLToPath(new URL("../mods/spaces-status/", import.meta.url)));
  if (issues.length) throw new Error(issues.join("\n"));
}
