# Marinadec's Herdr

A square-edged Herdr workspace with clear machine → space → agent-session hierarchy. Machines have character avatars and a base color; ordinary spaces get saved random Sharp icons and unused shades of their machine's color. Worktrees have a fixed Git-tree icon and inherit the parent space's color. Terminals use Liberation Mono 14; UI uses Liberation Sans 14.

## What you see

- **Window:** 299 px sidebar (44–480), 1 px divider, `canvas` background, ink/paper themes, hidden system titlebar, macOS traffic lights `[12,16]`. Brand and tabs are both 42 px high. Footer 69 px, bottom status 28 px.
- **Machine groups:** shown once a remote is known, local first then remote names. A 1 px frame blends the machine color into `chrome` at 40%; fill at 3.5%. Groups have 12 px separation and 4 px inner padding. With only this computer there is no machine header/card.
- **Machine header:** 52 px, 32 px character, original-case 16 px semibold name, 12 px connection/count line. A real blocked-agent `! N` count remains when folded. 24 px control targets. Below 240 px, settings/add buttons disappear; right-click and the global new-space action remain available. Offline characters fade to half opacity.
- **Spaces:** a group wraps the space and its agent sessions. Border 1 px, left edge 2 px, bottom gap 4 px. Border tint 22% inactive/60% active; background 2.5%/8%. Worktree groups indent 12 px. Rows are 32 px (30 for nested worktrees), with 8 px padding/gaps, a 20 px Sharp icon, flexible name and 24 px fold target.
- **Sessions:** 28 px rows, left/right padding 16/8, gap 8, slim marker, harness icon, 14 px name, 12 px sub-agent count, status. Machine/space fold controls and session statuses share a centered 24 px right column; the machine header compensates for the space's 1 px border. Active fill is 20% of the space color; no extra nested separator frames.
- **Rail:** below 160 px, 32 px cells show 24 px machine characters and 18 px space icons, with status/connection marks. Machine cells are 36 px high; space cells 32. Tooltips carry full names/indexes. Sessions and Git tails are hidden.
- **Work area:** 8 px padding/gaps, square panes, 1 px inactive/focus borders (color changes with focus), 32 px pane header. Header actions reserve their width while hidden, avoiding path movement on hover. Tab labels allow up to 240 px. Dividers are 1 px.
- **Stock surfaces:** Files/Changes in the hidden 368 px right stack, app picker, settings, confirmation/worktree dialogs remain Herdr's.

## How it behaves

### Colors and identities

Machines offer 24 named colors or a six-digit hex. New machine defaults choose among least-used colors and characters randomly; identities are saved. Ordinary space icons are chosen randomly from unused Material Sharp names within the machine, with least-used reuse after exhaustion. No names, paths or repository content infer ordinary icons.

Each ordinary space receives an unused slot in a **12-tone OKLCH palette** derived from its machine. Slots persist through restart, rename and reorder. Exhausted pools reuse a least-used slot. Changing the machine's base color updates the family. Separate light/dark lightness ranges and chroma gamut mapping keep the colors readable. Space text stays the normal theme foreground. Agent status colors remain independent of identity colors.

Space colors are fully automatic: no space color/shade controls, no color Auto button, no palette strip inside machine cards or previews. Concrete hex values are published in shared `space.colors` for the stock picker.

**Worktrees:** Git's linked-checkout information identifies them. Every detected worktree uses fixed Material Sharp `account_tree` and inherits its displayed parent checkout space's exact color, consuming no independent slot. The icon cannot be changed. If Git is temporarily unavailable, saved relationship information is retained. If its parent has not been seen as a space, the machine's first shade is a fallback until the relationship can be resolved.

### Appearance dialogs

Right-click a machine or use its settings button for color/character. Right-click a space → Rename & appearance for name/icon. Rail right-click opens the editor directly.

- Machine dialog: up to 560×580, 24 named swatches, hex input, searchable 32-character gallery.
- Ordinary space dialog: up to 640×640, name, inherited-color note, searchable Material Sharp gallery, collapsible categories, 48 results/page. No style variants.
- Worktree dialog: up to 640×320, name and fixed-icon/inherited-color explanation, with no icon selector.
- Sizes are capped to the viewport on opening. Preview and Save/Cancel stay outside the scroll region.
- Character labels are friendly names. No game name, technical asset ID or licensing boilerplate appears in ordinary labels/tooltips. Credits and licenses remain in the packaged files.
- Avatar **Auto** restores the saved random choice without rerolling. **Reset** restores saved defaults; name stays unchanged. **Cancel** makes no changes.
- Down from search focuses the gallery; arrows navigate and Enter selects. Buttons support keyboard activation. Ctrl/Cmd+Enter saves; Escape closes.
- Save rereads the latest shared state, merges only the target profile, and renames only the explicitly clicked space when its name changed. Missing spaces or invalid machine hex keep the dialog open with an error. Rename and preference writes are separate host operations.

### Navigation and statuses

Click a space selects it; click a session selects its space and tab. Space chevrons fold sessions, keeping local state under `spaces.sessions.folded`. Expanded spaces leave harness/status display to their sessions; folded spaces show the aggregate. A session exists for a tab with a top-level agent. Descendant agents count recursively as `+N`, never as separate rows. Priority: blocked > done > working > idle. Duplicate labels receive the tab number.

Machine headers fold groups using `machines.folded`. Login guidance and Copy remain available while folded. A rebuilt machine shows explicit Connect, preserving the existing hc reconnection flow. Dragging spaces stays within a machine. Worktree nesting preserves checkout relationships. Agent navigation order follows session order, including folded spaces.

Git metadata comes from the first live terminal's folder: `rev-parse`, `symbolic-ref`, and upstream `rev-list` counts. Git tails show only unusual repo/branch/ahead/behind info, at sidebar widths >=340 px. Local refs use `watchFolder`; remote refs use gentle polling. No status scan, fetch, push or pull is added.

Pixel status marks retain their semantics: native rotating pair for working, `!` for blocked, filled square for done, outlined square for idle. Characters are identity, not status.

Tabs retain wheel/drag, active-tab scrolling, menus, new-agent launch, and per-space Files/Changes memory. Pane actions use explicit pane IDs. Window controls retain platform-specific behavior.

## Built from

Installation follows the target Herdr home's `AGENTS.md`: read the files, copy `layouts/main-status.json` and the complete `mods/spaces-status/` folder (including compiled JS, fonts and icons), check the installed mod, then select the layout. The repository is only an installation/update source. `keys.json` is a separate optional Yazi shortcut.

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
   │  ├─ main (active tab, square panes, 1 px borders, 32 px chrome=pane header)
   │  └─ panel (hidden, 368 px, Files/Changes stack)
   └─ status (28 px, spaces-status chrome=status)
```

- `main.ts`: sidebar, Git metadata, worktree relationships, grouping, session aggregation and navigation. One live-data snapshot per render. Machine discovery every 15 s; new/ref checks every 250 ms with existing throttling. Only the actual sidebar starts those tasks.
- `appearance-model.ts`: validated schema v2, role-restricted profiles, persistent random identities, free tone slots and parent-color resolution.
- `appearance-colors.ts`: 12 OKLCH tones, gamut mapping and surface blending.
- `appearance-avatar.ts`: one PNG-frame/Sharp-font renderer; `avatar-labels.ts`: friendly names.
- `appearance-editor.ts`: specialized editors and space context menu.
- `pixel-chrome.ts`, `pixel-menu.ts`, `pixel-ui.ts`: title/footer/status bars, tabs, pane controls, menus and bitmap/status glyphs.
- Shared appearance: `{version:2, machines, spaces, defaults, spaceDefaults}`. Machine defaults have color/character; space defaults have machine, tone, icon and optional worktree/parent. Migration accepts v1, preserves compatible manual avatar choices and machine colors, converts legacy Material styles to Sharp, removes space-color overrides, and replaces incompatible avatars. Worktree defaults override any saved avatar.
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
- 24 base colors and 12 distinct tones work in light/dark mode; free tones are used before duplicates.
- Worktrees inherit parent color, including after parent recoloring, without using a slot.
- Random choices and manual overrides survive rename/reorder/restart and offline periods.
- Inspect sidebar, editors, narrow rail, long names, focus borders and pane actions in a separate preview home.
- Keep real-session screenshots outside the repository; merge the preview branch only after user approval.
