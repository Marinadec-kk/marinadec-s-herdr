import { hc } from "herdr";
import type { ExecResult } from "herdr";
import { record } from "../appearance-model.js";

export interface MachineInfo {
  name: string; target: string; state?: string; why?: string; via?: boolean | string;
  session?: string; temporary?: boolean; host?: string;
  keeps_running_after_logout?: boolean; logout_linger_user?: string;
}
export function parseMachines(raw: unknown): MachineInfo[] {
  const list = record(raw).machines;
  if (!Array.isArray(list)) return [];
  return list.map(record).filter(m => typeof m.name === "string" && !m.temporary).map(m => ({
    name: m.name as string, target: typeof m.target === "string" ? m.target : m.name as string,
    ...Object.fromEntries(["state", "why", "session", "host", "logout_linger_user"].filter(k => typeof m[k] === "string").map(k => [k, m[k]])),
    ...(typeof m.via === "boolean" || typeof m.via === "string" ? { via: m.via } : {}),
    ...(typeof m.keeps_running_after_logout === "boolean" ? { keeps_running_after_logout: m.keeps_running_after_logout } : {}),
  }));
}
export function machineError(result: Pick<ExecResult, "stdout" | "stderr">, fallback = "Couldn't connect."): { message: string; kind: string } {
  for (const text of [result.stdout, result.stderr]) {
    try {
      const error = record(record(JSON.parse(text)).error);
      if (typeof error.message === "string") return { message: error.message, kind: typeof error.kind === "string" ? error.kind : "" };
    } catch {}
  }
  return { message: (result.stderr || result.stdout).trim() || fallback, kind: "" };
}
export async function loadMachines(): Promise<MachineInfo[]> {
  const result = await hc(["machine", "ls", "--json"]);
  if (result.code !== 0) throw new Error(machineError(result).message);
  return parseMachines(JSON.parse(result.stdout));
}
