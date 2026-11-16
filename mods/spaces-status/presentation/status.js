export const STATUS_RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
const WORDS = { blocked: "Needs you", done: "Done", working: "Working", idle: "Idle" };
export const statusWord = (status) => status ? WORDS[status] : "";
export function statusTip(status, agents) {
    const word = statusWord(status);
    const names = [...new Set(agents.filter(a => a.status === status).map(a => a.program?.name).filter(Boolean))];
    return word && names.length ? `${word} · ${names.join(", ")}` : word;
}
export function statusCounts(agents) {
    return { total: agents.length, blocked: agents.filter(a => a.status === "blocked").length };
}
