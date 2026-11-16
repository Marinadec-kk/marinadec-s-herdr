import { test } from "node:test";
import assert from "node:assert/strict";
import { agentTree } from "../mods/spaces-status/data/agent-tree.js";
import { parseGitStatus } from "../mods/spaces-status/data/git-status.js";
import { gitLine, normalizePath, pathKey, joinPath, pathWithin } from "../mods/spaces-status/data/paths.js";

test("Git status preserves unusual names, bounds rows, and treats every unmerged pair as conflict", () => {
  const conflicts = ["DD", "AU", "UD", "UA", "DU", "AA", "UU"];
  const names = [" leading ", "tab\tname", "line\nname", "back\\slash", "Юникод"];
  const text = [...conflicts.map(xy => `${xy} ${xy}`), ...names.map(name => `?? ${name}`), " D removed", " M changed"].join("\0") + "\0";
  const { files, limited } = parseGitStatus(text, 100);
  assert.equal(limited, false);
  assert.deepEqual(files.slice(0, conflicts.length).map(f => f.status), conflicts.map(() => "U"));
  assert.deepEqual(files.slice(conflicts.length, -2).map(f => [f.path, f.status, f.fresh]), names.map(n => [n, "A", true]));
  assert.deepEqual(files.slice(-2).map(f => f.status), ["D", "M"]);
  assert.deepEqual(parseGitStatus(text, files.length), { files, limited: false });
  assert.deepEqual(parseGitStatus(text, 3), { files: files.slice(0, 3), limited: true });
});

test("path identities preserve roots, POSIX backslashes, whitespace and remote boundaries", () => {
  assert.equal(normalizePath("///"), "/");
  assert.equal(normalizePath("C:\\"), "C:/");
  assert.equal(normalizePath("\\\\host\\share\\dir\\"), "//host/share/dir");
  assert.equal(normalizePath("/repo/back\\slash/"), "/repo/back\\slash");
  assert.equal(gitLine(" /repo \n\n"), " /repo \n");
  assert.equal(joinPath("/", "name"), "/name");
  assert.equal(joinPath("C:\\", "name"), "C:/name");
  assert.equal(pathWithin("/folder", "/"), true);
  assert.equal(pathWithin("/folder-other", "/folder"), false);
  assert.equal(pathWithin("C:\\repo\\src", "C:/repo/"), true);
  assert.equal(pathKey("pi", "C:\\repo\\"), pathKey("pi", "C:/repo"));
  assert.notEqual(pathKey(null, "/repo"), pathKey("pi", "/repo"));
  assert.notEqual(pathKey(null, ""), pathKey(null, "/"));
});

test("agent counts deduplicate overlapping roots, terminate cycles and exclude finished branches", () => {
  const tree = agentTree([
    { address: "root", parent: "b", state: "live" },
    { address: "a", parent: "root", state: "live" },
    { address: "a", parent: "root", state: "live" },
    { address: "b", parent: "a", state: "live" },
    { address: "end", parent: "root", state: "exited" },
    { address: "orphan", parent: "end", state: "live" },
    { address: "pi/a", parent: "pi/root", state: "live" },
  ]);
  assert.equal(tree.countDescendants(["root", "root"]), 2);
  assert.equal(tree.countDescendants(["root", "a"]), 1);
  assert.equal(tree.countDescendants(["root", "pi/root"]), 3);
  assert.equal(tree.countDescendants(["end"]), 1);
  assert.equal(tree.countDescendants([]), 0);
  const deep = agentTree(Array.from({ length: 20000 }, (_, i) => ({ address: String(i + 1), parent: String(i), state: "live" })));
  assert.equal(deep.countDescendants(["0"]), 20000);
});
