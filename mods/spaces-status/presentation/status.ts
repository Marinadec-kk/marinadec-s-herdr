import type { AgentInfo, Status } from "herdr";
export const STATUS_RANK: Record<Status, number> = { blocked: 4, done: 3, working: 2, idle: 1 };
const WORDS: Record<Status, string> = { blocked: "Needs you", done: "Done", working: "Working", idle: "Idle" };
export const statusWord = (status: Status | null): string => status ? WORDS[status] : "";
export function statusTip(status: Status | null, agents: readonly AgentInfo[]): string {
  const word = statusWord(status);
  const names = [...new Set(agents.filter(a => a.status === status).map(a => a.program?.name).filter(Boolean))];
  return word && names.length ? `${word} · ${names.join(", ")}` : word;
}
export function statusCounts(agents: readonly AgentInfo[]): { total: number; blocked: number } {
  return { total: agents.length, blocked: agents.filter(a => a.status === "blocked").length };
}
