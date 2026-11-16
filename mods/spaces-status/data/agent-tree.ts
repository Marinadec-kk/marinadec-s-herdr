export interface TerminalNode { address: string; parent?: string | null; state?: string }

export function agentTree(terminals: readonly TerminalNode[]) {
  const children = new Map<string, Set<string>>();
  const subagents = new Set<string>();
  for (const terminal of terminals) {
    if (!terminal.parent) continue;
    subagents.add(terminal.address);
    if (terminal.state !== "live") continue;
    if (!children.has(terminal.parent)) children.set(terminal.parent, new Set());
    children.get(terminal.parent)!.add(terminal.address);
  }
  return {
    subagents,
    countDescendants(roots: Iterable<string>): number {
      const seen = new Set(roots), pending = [...seen], count = seen.size;
      // Iterative so deep trees and cycles cannot overflow the stack.
      while (pending.length) for (const child of children.get(pending.pop()!) ?? []) {
        if (seen.has(child)) continue;
        seen.add(child); pending.push(child);
      }
      return seen.size - count;
    },
  };
}
