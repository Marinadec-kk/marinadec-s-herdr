export type GitMark = "A" | "D" | "M" | "U";
export interface GitFile { path: string; status: GitMark; fresh: boolean }
export interface GitStatus { files: GitFile[]; limited: boolean }

// Expects porcelain v1 -z --no-renames. Paths are verbatim, including tabs/newlines.
export function parseGitStatus(text: string, limit: number): GitStatus {
  const files: GitFile[] = [];
  for (const entry of text.split("\0")) {
    if (entry.length < 4 || entry[2] !== " ") continue;
    if (files.length === limit) return { files, limited: true };
    const xy = entry.slice(0, 2), fresh = xy === "??";
    const conflict = xy.includes("U") || xy === "AA" || xy === "DD";
    files.push({ path: entry.slice(3), fresh, status: conflict ? "U" : xy.includes("D") ? "D" : fresh || xy.includes("A") ? "A" : "M" });
  }
  return { files, limited: false };
}
