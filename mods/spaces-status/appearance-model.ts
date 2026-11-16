// Appearance persistence and allocation. Random choices are made once and saved.
import type { Color } from "gpui-kit";
import { PLUSHIES } from "./plush-catalog.js";
import type { PlushId } from "./plush-catalog.js";
import { MATERIAL_ICONS } from "./material-catalog.js";
import { TONE_COUNT, tonePalette } from "./appearance-colors.js";
import { CHARACTER_ACCENTS } from "./character-accents.js";

export type Theme = Record<string, Color>;
export const UI_FONT = "Liberation Sans";
export const UI_FONT_SIZE = 14;
export const APPEARANCE_KEY = "spaces-status.appearance";
export const MARK: Record<string, Color> = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };
export const PROJECT_COLORS = [
  "ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1",
  "#2aa8c9", "#7f9f4a", "#a0785a", "#b06ab3",
  "#ef6f6c", "#e45b78", "#b85d88", "#b65f3b", "#d39b46", "#b8a34b",
  "#8baf5a", "#6ea986", "#42b7ad", "#64a8d1", "#5378c9", "#7776cf", "#a18bd3", "#8e98a8",
] as const;
export const COLOR_NAMES = [
  "Teal", "Orange", "Blue", "Violet", "Green", "Pink", "Cyan", "Olive", "Mocha", "Orchid",
  "Coral", "Rose", "Berry", "Copper", "Amber", "Gold", "Lime", "Sage", "Mint", "Sky",
  "Cobalt", "Periwinkle", "Lavender", "Slate",
] as const;
export const MATERIAL_FONT = "Material Icons Sharp";
export const SHARP_INDEX = 3;
const LEGACY_STYLES = ["filled", "outlined", "round", "sharp", "two-tone"];
export type PlushAvatar = { kind: "plush"; id: PlushId };
export type MaterialAvatar = { kind: "material"; family: "sharp"; name: string };
export type AvatarChoice = PlushAvatar | MaterialAvatar;
export const WORKTREE_AVATAR: MaterialAvatar = { kind: "material", family: "sharp", name: "account_tree" };
export interface AppearanceProfile { color?: string; avatar?: AvatarChoice }
// Legacy color fields remain readable for existing v1/v2 preferences.
// Current machine colors are always derived from the chosen character.
export interface MachineDefault { color: string; avatar?: PlushAvatar }
export interface SpaceDefault { machine: string; tone: number; avatar: MaterialAvatar; worktree?: boolean; parent?: string }
export interface AppearanceState {
  version: 2;
  machines: Record<string, AppearanceProfile>;
  spaces: Record<string, AppearanceProfile>;
  defaults: Record<string, MachineDefault>;
  spaceDefaults: Record<string, SpaceDefault>;
}
export type AppearanceTarget =
  | { kind: "space"; id: string; tree?: boolean }
  | { kind: "machine"; machine: string | null };
export interface SpaceIdentity { id: string; machine?: string | null; worktree?: boolean; parent?: string }
export const machineKey = (machine: string | null): string => machine === null ? "local" : `remote:${machine}`;
export const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const materialByName = new Map(MATERIAL_ICONS.map(icon => [icon.name, icon]));
const randomIcons = MATERIAL_ICONS.filter(icon => icon.codes[SHARP_INDEX] != null).map(icon => icon.name);
const tone = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value < TONE_COUNT ? value : undefined;

export function normalizeColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(text) || PROJECT_COLORS.some(c => c === text) ? text : undefined;
}

export function readAvatar(value: unknown): AvatarChoice | undefined {
  const a = record(value);
  const plush = PLUSHIES.find(p => p.id === a.id);
  if (a.kind === "plush" && plush) return { kind: "plush", id: plush.id };
  if (a.kind === "material" && typeof a.family === "string" && LEGACY_STYLES.includes(a.family) && typeof a.name === "string"
    && materialByName.get(a.name)?.codes[SHARP_INDEX] != null) {
    return { kind: "material", family: "sharp", name: a.name };
  }
  return undefined;
}

export function readProfile(value: unknown, kind: AppearanceTarget["kind"]): AppearanceProfile {
  const data = record(value), color = kind === "machine" ? normalizeColor(data.color) : undefined, chosen = readAvatar(data.avatar);
  const avatar = chosen?.kind === (kind === "machine" ? "plush" : "material") ? chosen : undefined;
  return { ...(color ? { color } : {}), ...(avatar ? { avatar } : {}) };
}

export function readAppearance(value: unknown): AppearanceState {
  const data = record(value);
  if (data.version !== 1 && data.version !== 2)
    return { version: 2, machines: {}, spaces: {}, defaults: {}, spaceDefaults: {} };
  const profiles = (raw: unknown, kind: AppearanceTarget["kind"]) => Object.fromEntries(
    Object.entries(record(raw)).map(([key, profile]) => [key, readProfile(profile, kind)]));
  const defaults: Record<string, MachineDefault> = {}, spaceDefaults: Record<string, SpaceDefault> = {};
  for (const [key, raw] of Object.entries(record(data.defaults))) {
    const look = record(raw), color = normalizeColor(look.color), avatar = readAvatar(look.avatar);
    if (color) defaults[key] = { color, ...(avatar?.kind === "plush" ? { avatar } : {}) };
  }
  for (const [key, raw] of Object.entries(record(data.spaceDefaults))) {
    const look = record(raw), shade = tone(look.tone), avatar = readAvatar(look.avatar);
    if (typeof look.machine === "string" && shade != null && avatar?.kind === "material")
      spaceDefaults[key] = { machine: look.machine, tone: shade, avatar,
        ...(look.worktree === true ? { worktree: true, ...(typeof look.parent === "string" ? { parent: look.parent } : {}) } : {}) };
  }
  return { version: 2, machines: profiles(data.machines, "machine"), spaces: profiles(data.spaces, "space"), defaults, spaceDefaults };
}

export function profileFor(state: AppearanceState, target: AppearanceTarget): AppearanceProfile {
  return (target.kind === "space" ? state.spaces[target.id] : state.machines[machineKey(target.machine)]) ?? {};
}

export function withProfile(state: AppearanceState, target: AppearanceTarget, profile: AppearanceProfile): AppearanceState {
  const group = target.kind === "space" ? "spaces" : "machines";
  const key = target.kind === "space" ? target.id : machineKey(target.machine);
  const entries = { ...state[group] };
  const locked = target.kind === "space" && (target.tree || state.spaceDefaults[key]?.worktree);
  const clean = locked ? {} : readProfile(profile, target.kind);
  if (Object.keys(clean).length) entries[key] = clean;
  else delete entries[key];
  return { ...state, [group]: entries };
}

// Uniformly select among the least-used candidates, including when a pool is full.
function allocate<T extends string | number>(pool: readonly T[], used: T[], random: () => number): T {
  const counts = new Map<T, number>();
  for (const value of used) counts.set(value, (counts.get(value) ?? 0) + 1);
  const min = Math.min(...pool.map(value => counts.get(value) ?? 0));
  const choices = pool.filter(value => (counts.get(value) ?? 0) === min);
  return choices[Math.min(choices.length - 1, Math.max(0, Math.floor(random() * choices.length)))];
}

export function ensureMachineDefaults(state: AppearanceState, machines: readonly (string | null)[], random = Math.random): AppearanceState {
  const defaults = { ...state.defaults };
  const keys = [...new Set([...Object.keys(defaults), ...Object.keys(state.machines), ...machines.map(machineKey)])].sort();
  const avatars = keys.flatMap(key => {
    const avatar = state.machines[key]?.avatar ?? defaults[key]?.avatar;
    return avatar?.kind === "plush" ? [avatar.id] : [];
  });
  for (const key of keys) {
    let avatar = defaults[key]?.avatar;
    if (!avatar) {
      const manual = state.machines[key]?.avatar;
      const id = manual?.kind === "plush" ? manual.id : allocate(PLUSHIES.map(p => p.id), avatars, random);
      avatar = { kind: "plush", id }; avatars.push(id);
    }
    defaults[key] = { color: defaults[key]?.color ?? CHARACTER_ACCENTS[avatar.id], avatar };
  }
  return { ...state, defaults };
}

export function ensureSpaceDefaults(state: AppearanceState, spaces: readonly SpaceIdentity[], random = Math.random): AppearanceState {
  const spaceDefaults = { ...state.spaceDefaults };
  // Resolve known worktrees first, so they never occupy independent color slots.
  for (const space of spaces) {
    const old = spaceDefaults[space.id];
    if (space.worktree ?? old?.worktree) {
      const parent = space.parent ?? old?.parent;
      spaceDefaults[space.id] = { machine: machineKey(space.machine ?? null), tone: 0,
        avatar: WORKTREE_AVATAR, worktree: true, ...(parent ? { parent } : {}) };
    }
  }
  const all = new Map(Object.entries(spaceDefaults).map(([id, value]) => [id, value.machine]));
  for (const space of spaces) all.set(space.id, machineKey(space.machine ?? null));
  for (const space of [...spaces].sort((a, b) => a.id.localeCompare(b.id))) {
    const machine = machineKey(space.machine ?? null), old = spaceDefaults[space.id];
    if (space.worktree ?? old?.worktree) continue;
    const siblings = [...all].filter(([id, key]) => id !== space.id && key === machine && !spaceDefaults[id]?.worktree).map(([id]) => id);
    const usedIcons = siblings.flatMap(id => {
      const avatar = state.spaces[id]?.avatar ?? spaceDefaults[id]?.avatar;
      return avatar?.kind === "material" ? [avatar.name] : [];
    });
    const usedTones = siblings.flatMap(id => {
      const shade = spaceDefaults[id]?.tone;
      return shade == null ? [] : [shade];
    });
    const pool = Array.from({ length: TONE_COUNT }, (_, i) => i);
    const free = pool.find(shade => !usedTones.includes(shade));
    if (old?.machine === machine && !old.worktree && (!usedTones.includes(old.tone) || free == null)) continue;
    const manual = state.spaces[space.id]?.avatar;
    const avatar = (old?.worktree ? undefined : old?.avatar) ?? (manual?.kind === "material" ? manual
      : { kind: "material" as const, family: "sharp" as const, name: allocate(randomIcons, usedIcons, random) });
    spaceDefaults[space.id] = { machine, avatar, tone: free ?? allocate(pool, usedTones, () => 0) };
  }
  return { ...state, spaceDefaults };
}

export function resolveColor(value: string | undefined, theme: Theme): Color {
  const color = normalizeColor(value);
  if (!color) return theme.ansi6;
  return color.startsWith("#") ? color as Color : MARK[color] ?? theme[color] ?? theme.ansi6;
}

export function machineColor(state: AppearanceState, machine: string | null, theme: Theme): Color {
  const avatar = machineAvatar(state, machine);
  return avatar ? CHARACTER_ACCENTS[avatar.id] : resolveColor(state.defaults[machineKey(machine)]?.color, theme);
}

export function machineAvatar(state: AppearanceState, machine: string | null): PlushAvatar | undefined {
  const key = machineKey(machine), avatar = state.machines[key]?.avatar;
  return avatar?.kind === "plush" ? avatar : state.defaults[key]?.avatar;
}

export function spaceAvatar(state: AppearanceState, id: string): MaterialAvatar | undefined {
  if (state.spaceDefaults[id]?.worktree) return WORKTREE_AVATAR;
  const avatar = state.spaces[id]?.avatar;
  return avatar?.kind === "material" ? avatar : state.spaceDefaults[id]?.avatar;
}

export function assignSpaceColors(spaces: readonly SpaceIdentity[], stored: unknown, state: AppearanceState, theme: Theme, dark: boolean): Record<string, string> {
  // Keep absent/offline identities. Stock pickers consume these concrete hex colors.
  const out = Object.fromEntries(Object.entries(record(stored)).filter((entry): entry is [string, string] => !!normalizeColor(entry[1])));
  const palettes = new Map<string, Color[]>();
  const identities = new Map(Object.entries(state.spaceDefaults).map(([id, value]) => [id,
    { id, machine: value.machine === "local" ? null : value.machine.slice(7) }]));
  for (const space of spaces) identities.set(space.id, { id: space.id, machine: space.machine ?? null });
  const visited = new Set<string>(), visiting = new Set<string>();
  const paint = (id: string): string => {
    if (visited.has(id)) return out[id];
    const identity = identities.get(id), saved = state.spaceDefaults[id];
    if (!identity) return out[id] ?? theme.ansi6;
    const machine = identity.machine, key = machineKey(machine);
    if (!palettes.has(key)) palettes.set(key, tonePalette(machineColor(state, machine, theme), dark));
    const fallback = palettes.get(key)![saved?.tone ?? 0];
    if (visiting.has(id)) return fallback;
    visiting.add(id);
    out[id] = saved?.worktree && saved.parent && (identities.has(saved.parent) || out[saved.parent])
      ? paint(saved.parent) : fallback;
    visiting.delete(id); visited.add(id);
    return out[id];
  };
  for (const id of identities.keys()) paint(id);
  return out;
}
