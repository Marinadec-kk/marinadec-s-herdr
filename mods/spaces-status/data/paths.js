// Normalize separators only for Windows paths: "\" is a valid POSIX filename.
export function normalizePath(path) {
    const p = /^(?:[a-z]:[\\/]|\\\\)/i.test(path) ? path.replace(/\\/g, "/") : path;
    const trimmed = p.replace(/\/+$/, "");
    return !trimmed && p ? "/" : /^[a-z]:$/i.test(trimmed) && p.endsWith("/") ? trimmed + "/" : trimmed;
}
export const pathKey = (machine, path) => JSON.stringify([machine, normalizePath(path)]);
export const pathName = (path) => normalizePath(path).split("/").pop() || normalizePath(path);
export const joinPath = (parent, child) => normalizePath(parent).replace(/\/$/, "") + "/" + child;
export function pathWithin(path, parent) {
    const p = normalizePath(path), root = normalizePath(parent);
    return p === root || p.startsWith(joinPath(root, ""));
}
// Git appends one record newline; trim() would corrupt whitespace in filenames.
export const gitLine = (text) => text.replace(/\n$/, "");
