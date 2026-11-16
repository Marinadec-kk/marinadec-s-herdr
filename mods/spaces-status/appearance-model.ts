// Pure appearance rules: no host reads, timers, UI, or file access.
import type { Color } from "gpui-kit";
import { PLUSHIES } from "./plush-catalog.js";
import type { PlushId } from "./plush-catalog.js";

export type Theme = Record<string, Color>;
export const UI_FONT = "Liberation Sans";
export const UI_FONT_SIZE = 14;
export const APPEARANCE_KEY = "spaces-status.appearance";
export const MARK: Record<string, Color> = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };
export const PROJECT_COLORS = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1", "#2aa8c9", "#7f9f4a", "#a0785a", "#b06ab3"] as const;
export const PIXELS = ["robot", "cat", "frog", "ghost"] as const;
export const MATERIAL_FAMILIES = [
  { id: "filled", label: "Filled · solid", font: "Material Icons", description: "Solid shapes with filled interiors" },
  { id: "outlined", label: "Outlined · lines", font: "Material Icons Outlined", description: "Hollow shapes drawn with outlines" },
  { id: "round", label: "Round · soft", font: "Material Icons Round", description: "Filled shapes with rounded corners" },
  { id: "sharp", label: "Sharp · angular", font: "Material Icons Sharp", description: "Filled shapes with sharp corners" },
  { id: "two-tone", label: "Two tone · layers", font: "Material Icons Two Tone", description: "Two layers with different opacity" },
] as const;
export type PixelName = typeof PIXELS[number];
export type MaterialFamily = typeof MATERIAL_FAMILIES[number]["id"];
export type AvatarChoice =
  | { kind: "letter" }
  | { kind: "pixel"; name: PixelName }
  | { kind: "plush"; id: PlushId }
  | { kind: "material"; family: MaterialFamily; name: string };
export interface AppearanceProfile { color?: string; avatar?: AvatarChoice }
export interface MachineDefault { color: string; mascot: PixelName }
export interface AppearanceState {
  version: 1;
  machines: Record<string, AppearanceProfile>;
  spaces: Record<string, AppearanceProfile>;
  defaults: Record<string, MachineDefault>;
}
export type AppearanceTarget =
  | { kind: "space"; id: string; tree?: boolean }
  | { kind: "machine"; machine: string | null };
export const machineKey = (machine: string | null): string => machine === null ? "local" : `remote:${machine}`;
export const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function normalizeColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(text) || PROJECT_COLORS.some(c => c === text) ? text : undefined;
}

export function readAvatar(value: unknown): AvatarChoice | undefined {
  const a = record(value);
  if (a.kind === "letter") return { kind: "letter" };
  const plush = PLUSHIES.find(p => p.id === a.id);
  if (a.kind === "plush" && plush) return { kind: "plush", id: plush.id };
  const pixel = PIXELS.find(p => p === a.name), family = MATERIAL_FAMILIES.find(f => f.id === a.family);
  if (a.kind === "pixel" && pixel) return { kind: "pixel", name: pixel };
  if (a.kind === "material" && family
    && typeof a.name === "string" && /^[a-z0-9_]+$/.test(a.name)) {
    return { kind: "material", family: family.id, name: a.name };
  }
  return undefined;
}

export function readProfile(value: unknown): AppearanceProfile {
  const data = record(value), color = normalizeColor(data.color), avatar = readAvatar(data.avatar);
  return { ...(color ? { color } : {}), ...(avatar ? { avatar } : {}) };
}

export function readAppearance(value: unknown): AppearanceState {
  const data = record(value);
  if (data.version !== 1) return { version: 1, machines: {}, spaces: {}, defaults: {} };
  const profiles = (raw: unknown): Record<string, AppearanceProfile> => Object.fromEntries(
    Object.entries(record(raw)).map(([key, profile]) => [key, readProfile(profile)]),
  );
  const defaults: Record<string, MachineDefault> = {};
  for (const [key, raw] of Object.entries(record(data.defaults))) {
    const look = record(raw), color = normalizeColor(look.color), mascot = PIXELS.find(p => p === look.mascot);
    if (color && mascot) defaults[key] = { color, mascot };
  }
  return { version: 1, machines: profiles(data.machines), spaces: profiles(data.spaces), defaults };
}

export function profileFor(state: AppearanceState, target: AppearanceTarget): AppearanceProfile {
  return (target.kind === "space" ? state.spaces[target.id] : state.machines[machineKey(target.machine)]) ?? {};
}

export function withProfile(state: AppearanceState, target: AppearanceTarget, profile: AppearanceProfile): AppearanceState {
  const group = target.kind === "space" ? "spaces" : "machines";
  const key = target.kind === "space" ? target.id : machineKey(target.machine);
  const entries = { ...state[group] }, clean = readProfile(profile);
  if (clean.color || clean.avatar) entries[key] = clean;
  else delete entries[key];
  return { ...state, [group]: entries };
}

// Reserve existing identities before assigning new ones. Offline/temporarily
// absent machines retain their slots; no hash collision for the first four.
export function ensureMachineDefaults(state: AppearanceState, machines: readonly (string | null)[]): AppearanceState {
  const all = [...new Set([...Object.keys(state.defaults), ...machines.map(machineKey).sort()])];
  const keys = all.includes("local") ? ["local", ...all.filter(key => key !== "local")] : all;
  const allocated: Record<string, Partial<MachineDefault>> = {};
  for (const key of keys) allocated[key] = {};
  const assign = <K extends keyof MachineDefault>(field: K, pool: readonly MachineDefault[K][]) => {
    const uses = new Map<string, number>();
    const count = (value: string) => uses.get(value) ?? 0;
    const take = (key: string, value: MachineDefault[K]) => {
      allocated[key][field] = value;
      uses.set(value, count(value) + 1);
    };
    for (const key of keys) {
      const old = state.defaults[key]?.[field];
      if (old && !uses.has(old)) take(key, old);
    }
    for (const key of keys) {
      if (allocated[key][field]) continue;
      const free = pool.find(value => count(value) === 0);
      const old = state.defaults[key]?.[field];
      const value = free ?? old ?? pool.reduce((a, b) => count(a) <= count(b) ? a : b);
      take(key, value);
    }
  };
  assign("color", PROJECT_COLORS);
  assign("mascot", PIXELS);
  const defaults: Record<string, MachineDefault> = {};
  for (const key of keys) {
    const { color, mascot } = allocated[key];
    if (!color || !mascot) throw new Error(`Missing machine appearance: ${key}`);
    defaults[key] = { color, mascot };
  }
  return { ...state, defaults };
}

export function resolveColor(value: string | undefined, theme: Theme): Color {
  const color = normalizeColor(value);
  if (!color) return theme.ansi6;
  return color.startsWith("#") ? color as Color : MARK[color] ?? theme[color] ?? theme.ansi6;
}

export function assignSpaceColors(
  spaces: readonly { id: string; name: string }[],
  stored: unknown,
  profiles: Record<string, AppearanceProfile>,
): Record<string, string> {
  // Empty snapshots are not evidence that every space was deleted.
  if (!spaces.length) return Object.fromEntries(Object.entries(record(stored)).filter((entry): entry is [string, string] => !!normalizeColor(entry[1])));
  const source = record(stored), out: Record<string, string> = {}, uses = new Map<string, number>();
  const count = (color: string) => uses.get(color) ?? 0;
  for (const space of spaces) {
    const color = profiles[space.id]?.color ?? normalizeColor(source[space.id]);
    if (color) { out[space.id] = color; uses.set(color, count(color) + 1); }
  }
  for (const space of spaces) {
    if (out[space.id] || space.name === "~") continue;
    const color = PROJECT_COLORS.reduce<string>((a, b) => count(a) <= count(b) ? a : b, PROJECT_COLORS[0]);
    out[space.id] = color;
    uses.set(color, count(color) + 1);
  }
  const seen = new Set(spaces.flatMap(space => profiles[space.id]?.color ? [profiles[space.id].color] : []));
  for (const space of spaces) {
    const color = out[space.id];
    if (!color || profiles[space.id]?.color) continue;
    if (!seen.has(color)) { seen.add(color); continue; }
    const free = PROJECT_COLORS.find(c => count(c) === 0);
    if (!free) continue;
    uses.set(color, count(color) - 1);
    out[space.id] = free;
    uses.set(free, count(free) + 1);
    seen.add(free);
  }
  return out;
}
