export function agentTree(terminals) {
    const children = new Map();
    const subagents = new Set();
    for (const terminal of terminals) {
        if (!terminal.parent)
            continue;
        subagents.add(terminal.address);
        if (terminal.state !== "live")
            continue;
        if (!children.has(terminal.parent))
            children.set(terminal.parent, new Set());
        children.get(terminal.parent).add(terminal.address);
    }
    return {
        subagents,
        countDescendants(roots) {
            const seen = new Set(roots), pending = [...seen], count = seen.size;
            // Iterative so deep trees and cycles cannot overflow the stack.
            while (pending.length)
                for (const child of children.get(pending.pop()) ?? []) {
                    if (seen.has(child))
                        continue;
                    seen.add(child);
                    pending.push(child);
                }
            return seen.size - count;
        },
    };
}
