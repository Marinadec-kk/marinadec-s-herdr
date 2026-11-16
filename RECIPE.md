# Marinadec's Herdr

A square-edged Herdr workspace with clear machine → space → agent-session hierarchy. Machines have character avatars and automatic colors from their accents; ordinary spaces get saved random Sharp icons and unused shades of their machine's color. Worktrees have a fixed Git-tree icon and inherit the parent space's color. Terminals use Liberation Mono 14; UI uses Liberation Sans 14.

## What you see

- **Window:** 299 px sidebar (44–480), 2 px divider, `canvas` background, ink/paper themes, hidden system titlebar, macOS traffic lights `[12,16]`. Brand and tabs are both 42 px high. Footer 69 px, bottom status 28 px.
- **Machine groups:** local first then remote names. A 2 px frame blends the machine color into `chrome` at 40%; fill at 3.5%. Groups have 12 px separation and 4 px inner padding. With only this computer, the expanded sidebar omits its card; the rail always shows machine membership.
- **Machine header:** 44 px, 36 px character, original-case 16 px semibold name, connection badge and offline explanation. A real blocked-agent `! N` count remains when folded. 28 px add/fold targets with 18 px glyphs. No settings gear; appearance opens on right-click. Offline characters fade to half opacity.
- **Spaces:** a group wraps the space and its agent sessions. Border 2 px on every side, bottom gap 4 px. Border tint 22% inactive/60% active; background 2.5%/8%. Ordinary rows are 32 px, with 8 px padding/gaps, a 20 px Sharp icon, 14 px name, and worktree/fold buttons with identical 24 px targets/14 px glyphs.
- **Worktree size tier:** 28 px rows, 16 px icons, 12 px names and 20 px action targets/10 px glyphs. Like the machine → space step, titles shrink by 2 px and actions by 4 px. Recorded source captions add 18 px to the row. Every worktree uses this tier, including worktree-from-worktree and a worktree whose parent is unavailable; depth only adds indentation (12 px per level, capped at six).
- **Action alignment:** all three levels use two centered 28 px slots with a 4 px gap. The machine header compensates for the space's 2 px frame. `+` and worktree buttons share one x-coordinate, fold buttons share the other; empty slots retain geometry.
- **Sessions:** 28 px rows, left/right padding 16/8, gap 8, 2 px marker, harness icon, 14 px name, 12 px sub-agent count, status centered in the shared 28 px end column. Active fill is 20% of the space color; no extra nested separator frames.
- **Rail:** below 160 px, tinted 2 px machine cards show 28 px characters, 18 px space icons and 14 px worktree icons. Every frame, identity rail and tree connector is 2 px thick. Parent spaces and their linked worktrees share tree connectors with terminating elbows sized to each row. Two connector lanes fit arbitrary ancestry in the 44 px rail; hover carries the full path and recorded origin. Machine/space/worktree rows are 36/32/28 px high; nested worktrees stay 28 px. Saved relationships survive unavailable Git. Sessions and Git tails are hidden.
- **Work area:** 8 px padding/gaps, square panes, 2 px inactive/focus borders (color changes with focus), 32 px pane header. Header actions reserve their width while hidden, avoiding path movement on hover. Tab labels allow up to 240 px. Dividers are 2 px.
- **Shared surfaces:** search, appearance, tab rename, close confirmations, worktrees, machine-add, terminal menus, notifications and Files/Changes use the same controls and templates. App-owned Settings, palette, Welcome, What's new and internal dialog entrypoints retain Herdr's presentation.
- **Controls:** square 2 px frames, 24 px icon targets (28 on machine headers, 20 on worktree rows), 32 px buttons/menu rows, 14 px program logos, UI 14/secondary 12. Controls consume nested down/up/click gestures and support keyboard focus and Enter/Space. Menus skip disabled items and reveal keyboard selection.

## How it behaves

### Colors and identities

Machines choose among least-used characters randomly once, then save the identity. Their color always follows the selected character's accent: an offline PNG first-frame extractor favors chromatic pixels and lifts very dark accents for frames. No machine color picker or HEX input. Legacy stored colors stay readable but are not color overrides. Ordinary space icons are chosen randomly from unused Material Sharp names within the machine, with least-used reuse after exhaustion. No names, paths or repository content infer ordinary icons.

Each ordinary space receives an unused slot in a **12-tone OKLCH palette** derived from its machine. Slots persist through restart, rename and reorder. Exhausted pools reuse a least-used slot. Changing the machine's character updates the family. Separate light/dark lightness ranges and chroma gamut mapping keep the colors readable. Space text stays the normal theme foreground. Agent status colors remain independent of identity colors.

Colors are fully automatic: no color/shade controls or palette strips. Concrete hex values are published in shared `space.colors` for compatibility. The owned search reads identities/colors without allocating, pruning or writing either preference key.

**Worktrees:** Git's linked-checkout information identifies them. Every detected worktree uses fixed Material Sharp `account_tree` and inherits its displayed parent checkout space's exact color, consuming no independent slot. The icon cannot be changed. If Git is temporarily unavailable, saved relationship information is retained. If its parent has not been seen as a space, the machine's first shade is a fallback until the relationship can be resolved.

New branches created here record their exact source space, checkout path, branch and commit. Creation pins that commit; a changing source branch cannot silently change the recorded origin. This history drives recursive nesting and a `From <space> · <branch> @ <commit>` caption. Reopened source checkouts resolve by machine/path, not name. Missing sources fall back to the nearest visible ancestor. Existing worktrees and checkouts of already-existing branches retain repository grouping when provenance is unknown; Git does not provide a reliable worktree ancestry record.

### Appearance dialogs

Right-click a machine for its character. Right-click any space/worktree, including in the rail, for the same context menu; Rename & appearance opens name/icon editing. Menus have an explicit row-derived height, so native scroll containers cannot collapse them.

- Machine dialog: up to 560×580, searchable 32-character gallery and automatic accent preview.
- Ordinary space dialog: up to 640×640, name, inherited-color note, searchable Material Sharp gallery, collapsible categories, 48 results/page. No style variants.
- Worktree dialog: up to 640×320, name and fixed-icon/inherited-color explanation, with no icon selector.
- Sizes are capped to the viewport on opening. Preview and Save/Cancel stay outside the scroll region.
- Character labels are friendly names. No game name, technical asset ID or licensing boilerplate appears in ordinary labels/tooltips. Credits and licenses remain in the packaged files.
- Avatar **Default** restores the saved random choice without rerolling; name stays unchanged. **Cancel** makes no changes. There is one default action, not duplicate Auto/Reset buttons.
- Down from search focuses the gallery; arrows navigate and Enter selects. Buttons support keyboard activation. Ctrl/Cmd+Enter saves; Escape closes.
- Save rereads the latest shared state, merges only the target profile, and renames only the explicitly clicked space when its name changed. Missing spaces keep the dialog open with an error. Rename and preference writes are separate host operations.

### Navigation and statuses

Click a space selects it; click a session selects its space and tab. Space chevrons fold sessions, keeping local state under `spaces.sessions.folded`. Expanded spaces leave harness/status display to their sessions; folded spaces show the aggregate. A session exists for a tab with a top-level agent. Descendant agents count recursively as `+N`, never as separate rows. Priority: blocked > done > working > idle. Duplicate labels receive the tab number.

Machine headers fold groups using `machines.folded`. Login guidance and Copy remain available while folded. A rebuilt machine shows explicit Connect, preserving the existing hc reconnection flow. Dragging spaces stays within a machine. Worktree nesting preserves checkout relationships. Agent navigation order follows session order, including folded spaces.

Git metadata comes from the first live terminal's folder: `rev-parse`, `symbolic-ref`, and upstream `rev-list` counts. Git tails show only unusual repo/branch/ahead/behind info, at sidebar widths >=340 px. Local refs use `watchFolder`; remote refs use gentle polling. No status scan, fetch, push or pull is added.

Pixel status marks retain their semantics: native rotating pair for working, `!` for blocked, filled square for done, outlined square for idle. Characters are identity, not status.

Tabs retain wheel/drag, active-tab scrolling, menus, new-agent launch, and per-space Files/Changes memory. Pane actions use explicit pane IDs. Window controls retain platform-specific behavior.

Machine `+` creates a space in that machine's home, without a folder picker. A space's Git button opens New worktree immediately for its ID and machine; the controller resolves that space's live folder, including remotely. New/Open/Remove share one overlay route and dimensions. Removal retains dirty/submodule checks and requires renewed consent if risk changes after opening.

Explicit tab names always win; otherwise sidebar, tabs and search use the same agent-title policy. New-agent launch passes argv without assigning the program name as a manual tab name. Search includes titles, program names, folders and machines, with attention-first groups, quiet folding and Ctrl+D close. Terminal menus use the clicked pane/terminal and omit pane actions for composition terminals. Toasts retain action and login-command Copy behavior.

## Built from

Installation follows the target Herdr home's `AGENTS.md`: read the files, copy `layouts/main-status.json` and the complete `mods/spaces-status/` folder (including compiled JS, fonts and icons), merge `keys.main-status.json` with the person's keys, check the installed mod, then select the layout. The repository is only an installation/update source. `keys.json` is a separate optional Yazi shortcut. The layout-scoped Ctrl+Shift+K/F2/Shift+F2 routes are consumed only by the sidebar copy.

```
root (row, canvas, divider 1, ink/paper, titlebar none,
      font Liberation Mono 14, ui_font Liberation Sans, terminal_padding [14,12])
├─ sidebar (299 px, min 44, max 480)
│  ├─ brand (42 px, spaces-status chrome=brand)
│  ├─ spaces (weight 1, min 90, spaces-status)
│  └─ footer (69 px, spaces-status chrome=footer)
└─ work
   ├─ tabs (42 px, spaces-status chrome=tabs)
   ├─ work-body (padding/gap 8)
   │  ├─ main (active tab, square panes, 2 px borders, 32 px chrome=pane header)
   │  └─ panel (hidden, 368 px, Files/Changes stack)
   └─ status (28 px, spaces-status chrome=status)
```

- `main.ts`: sidebar, Git metadata, worktree relationships, grouping, session aggregation and navigation. One live-data snapshot per render. Machine discovery every 15 s; new/ref checks every 250 ms with existing throttling. Only the actual sidebar starts those tasks.
- `appearance-model.ts`: validated schema v2, role-restricted profiles, persistent random identities, free tone slots and parent-color resolution.
- `appearance-colors.ts`: 12 OKLCH tones, gamut mapping and surface blending.
- `appearance-avatar.ts`: one PNG-frame/Sharp-font renderer; `avatar-labels.ts`: friendly names.
- `appearance-editor.ts`: specialized editors and space context menu.
- `pixel-chrome.ts`, `pixel-menu.ts`, `pixel-ui.ts`: title/footer/status bars, tabs, pane controls, menus and bitmap/status glyphs.
- `ui/`: controls, Menu, Dialog/Panel, EntityRow and geometry. `tokens.ts` owns the 2 px `UI.stroke`; `hierarchy.ts` owns aligned action slots and tree connectors. `scripts/sync-ui-layout.mjs` applies that same stroke to layout JSON at build time. `presentation/`: labels, status words/counts, read-only identity projections and cycle-safe ancestry ordering. `overlays.ts`: frame-free opening, viewport caps, explicit targets and shared sizes.
- `views/`: dedicated picker, rename/close, worktree, machine-add, terminal-menu, toast, Files and Changes controllers. The dispatcher forwards render context and cleanup; Files releases its native editor. Git/SSH/read limits and local/remote behavior are adapted from Herdr 0.1.16 with Apache attribution.
- `character-accents.ts`: generated by the offline `scripts/character-accents.mjs` extractor; source assets and licenses are unchanged.
- Shared appearance: `{version:2, machines, spaces, defaults, spaceDefaults}`. Machine defaults have color/character; space defaults have machine, tone, icon and optional worktree/parent. Migration accepts v1, preserves compatible manual avatar choices and machine colors, converts legacy Material styles to Sharp, removes space-color overrides, and replaces incompatible avatars. Worktree defaults override any saved avatar.
- `spaces-status.worktree-lineage` keeps creation history by machine/checkout path, independently of transient space IDs. `worktree-lineage.ts` validates it and resolves source identities. Existing-branch checkout does not claim an origin.
- Original asset catalogs, hashes, fonts and attribution remain bundled. Liberation 2.1.5 and Tiny5 use OFL; Material Icons use Apache 2.0. The 32 unchanged SS14 sprites retain per-asset CC BY-SA 3.0/4.0 or CC0; see `icons/plushies/CREDITS.md`. Non-commercial assets are excluded.

## Watch out

- Edit TypeScript and rebuild; compiled JS is committed. Herdr-generated `.d.ts`/`jsconfig.json` are ignored; the pinned declaration snapshot lives in `types/`.
- API baseline: Herdr 0.1.15, current validation target 0.1.16 with hc 0.1.21.
- Do not reroll identities on every render. Persist allocations; retain temporarily absent/offline defaults.
- Worktree discovery is asynchronous. Keep saved relationships during temporary Git failures; stop consuming a normal shade slot once identified.
- Saved layout clicks can override width/theme. Fonts load on app start/look changes.
- Appearance/fold state is local to the app home. A preview home is independent of the live installation, but both can display the same core terminals.
- Dialogs use a viewport cap on opening; their body scrolls and footer stays visible.
- Checks initialize the mod and may call `hc machine ls` for real. Stock modules are not overwritten.

## Done when

- Build, type checks and behavioral tests pass; generated JavaScript matches TypeScript.
- Installed `herdr-app check` passes; live status has no errors.
- Machine/space editors show only their allowed avatar category; worktrees have no icon control.
- Character-derived base colors and 12 distinct tones work in light/dark mode; free tones are used before duplicates.
- Worktrees inherit parent color, including after parent recoloring, without using a slot.
- Random choices and manual overrides survive rename/reorder/restart and offline periods.
- Inspect sidebar, editors, narrow rail, long names, focus borders and pane actions in a separate preview home.
- Keep real-session screenshots outside the repository; merge the preview branch only after user approval.
