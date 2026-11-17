// Shared geometry for controls, frames and the three fixed hierarchy levels.
export const UI = {
    stroke: 2, iconTarget: 24, machineTarget: 28, icon: 14, machineIcon: 18,
    actionGap: 4, control: 32, secondary: 12, sourceLine: 18, programIcon: 14, inset: 8,
    menuInset: 5, menuMaxHeight: 480,
    status: 16, statusCompact: 10,
    railCell: 32, railBelow: 160, compactBelow: 240, gitFrom: 340, sidebar: 299,
};
export const HIERARCHY = {
    machine: { row: 44, avatar: 36, text: 16, target: UI.machineTarget, glyph: UI.machineIcon, railRow: 36, railAvatar: 28 },
    space: { row: UI.control, avatar: 20, text: 14, target: UI.iconTarget, glyph: UI.icon, railRow: UI.railCell, railAvatar: 18 },
    worktree: { row: 28, avatar: 16, text: 12, target: 20, glyph: 10, railRow: 28, railAvatar: 14 },
};
export const menuHeight = (rows) => Math.min(UI.menuMaxHeight, UI.stroke * 2 + UI.menuInset * 2 + rows * UI.control);
