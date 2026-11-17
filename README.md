# Marinadec's Herdr

A pixel-art workspace for the [Herdr](https://herdr.dev) desktop app. Every agent tab appears under its space with its harness, live status and sub-agent count. Machine colors follow their chosen characters; ordinary spaces use Sharp icons and automatic shades. Worktrees nest under their checkout and inherit its color.

- **Liberation typography.** Liberation Mono 14 for terminals and Liberation Sans with a 14 px base size for the interface. Both families are bundled, including regular, bold, italic and bold italic faces with Cyrillic support. Headings, hints and avatar glyphs keep their contextual sizes.
- **Pixel chrome.** Square controls, bitmap glyphs and sharp pane frames across the sidebar, tabs, pane headers, brand/footer and status bar. Fonts are configured by this layout and its mod.
- **Clear hierarchy.** Shared 2 px frames surround machines, spaces, controls and panes. Machines have 12 px separation; spaces have 4 px separation. Sessions sit inside their space; the active session gets the strongest fill.

- **Inline sessions.** A tab gets a row only if it runs Claude Code, OpenCode, Pi or another agent. The row shows the harness icon, the tab's name, `+N` for sub-agents and the tab's own status.
- **One status per level.** Expanded, a space leaves status to its session rows. Fold it with the chevron at the right edge, and the space row summarizes its harnesses and the most urgent status.
- **Worktrees nest.** New branches nest under the space/worktree they were created from, with a source branch/commit caption. Existing worktrees without recorded creation history group under their repository's main checkout. Worktrees form a smaller third size tier after machines and ordinary spaces; nested worktrees keep that same size. Every worktree has a fixed Git-tree icon and inherits its parent's color; it consumes no separate shade slot.
- **Separate identities.** Machines use one of 32 characters; ordinary spaces use Material Icons **Sharp only**. Initial icons are randomly selected from unused choices where possible, then saved by ID. Names and project contents do not choose an icon.
- **Machines.** Each group has a 36 px character, 16 px name, connection badge and a real blocked-agent count. Its base color comes from the character's first-frame accent; no manual color controls. Right-click edits the character; `+` creates a space in that machine's home.
- **Compact rail.** Below 160 px, 28 px machine characters head tinted cards. Spaces use 32 px rows and worktrees 28 px rows, with 2 px connecting tree lines ending at each last child. The active space has a contrasting 2 px left marker and stronger fill. Its status has a separate slot, clear of avatars and tree lines.
- **Consistent states.** A pulsing hourglass means working, `!` needs you, a check means done, and an outlined square means idle. Every state has fixed bounds. No agents means an empty slot, not a gray dot.
- **Current space at a glance.** The bottom status bar keeps `machine → space name` visible in both sidebar modes. Long labels truncate and show their full name on hover.
- **Navigation.** Click to switch, right-click for the space menu, drag to reorder. Branch/ahead/behind tails appear at sidebar widths of 340 px and above.

## Install

### Ask your agent (recommended)

Copy this line into your agent in Herdr:

```text
Read ~/.config/herdr-app/AGENTS.md, then add this layout: https://github.com/Marinadec-kk/marinadec-s-herdr
```

If you set `HERDR_APP_HOME`, use the `AGENTS.md` in that folder instead.

This follows the [Herdr gallery](https://herdr.dev/gallery/) installation flow. Your agent reads `RECIPE.md` and the files, copies the layout and its complete mod folder into Herdr's home, checks the mod, and switches to the new layout:

```text
~/.config/herdr-app/
├── layouts/main-status.json
└── mods/spaces-status/       JavaScript, fonts, icons and helper modules
```

Herdr loads these copies directly. The repository checkout is only a download/update source, so it can be removed after installation. Compiled JavaScript and assets are included; no npm install or build is needed. If a destination name is already taken, the agent follows Herdr's naming-conflict rules and adjusts the new copy's references.

### Manual install (macOS / Linux)

Clone the repository:

```sh
git clone https://github.com/Marinadec-kk/marinadec-s-herdr.git ~/Projects/marinadec-s-herdr
```

Copy and check the files. This block stops if either destination already exists; for an existing installation, use [Update](#update).

```sh
(
  set -eu
  repo="$HOME/Projects/marinadec-s-herdr"
  home="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"

  for target in "$home/mods/spaces-status" "$home/layouts/main-status.json"; do
    if [ -e "$target" ] || [ -L "$target" ]; then
      printf 'Already exists: %s. See Update or ask your agent to use another name.\n' "$target" >&2
      exit 1
    fi
  done

  mkdir -p "$home/mods" "$home/layouts"
  cp -R "$repo/mods/spaces-status" "$home/mods/"
  cp "$repo/layouts/main-status.json" "$home/layouts/main-status.json"
  herdr-app check "$home/mods/spaces-status"
)
```

The check should print `check passed`. With Herdr running, select the layout:

```sh
herdr-app do layout.switch --name main-status
```

You can also select it in Herdr's layout picker. `ctrl-shift-l` switches between layouts. The commands use `HERDR_APP_HOME` when set, otherwise `~/.config/herdr-app`.

### Custom keys

Merge `keys.main-status.json` into Herdr's `keys.json` to route `Ctrl+Shift+K`, F2 and Shift+F2 to this layout's search, tab rename and space appearance. These bindings are scoped to `layout:main-status`; preserve other sections and resolve any existing layout-specific bindings before replacing them. When installing under another name, rename both the section and the `spaces-status.*` actions.

`keys.json` in this repository holds an optional `alt-shift-f` binding: it opens [Yazi](https://github.com/sxyazi/yazi) in a right split. Ask your agent to add it, or merge the binding into the `global` section of Herdr's `keys.json` (`$HERDR_APP_HOME/keys.json` when set). Keep the other bindings; if this key is already assigned, choose another key or explicitly replace its action:

```json
{
  "global": {
    "alt-shift-f": {
      "command": "terminal.open",
      "args": { "argv": ["bash", "-ic", "exec yazi"], "place": "right" }
    }
  }
}
```

The binding needs `yazi` on `PATH` for the shell that Herdr starts. Change or drop it if you don't use Yazi.

### Your own layout

In a layout of your own, point the spaces block at this mod:

```json
{ "id": "spaces", "type": "block", "size": { "weight": 1 }, "min": 90, "content": { "mod": "spaces-status" } }
```

For pixel chrome too, use the supplied layout: it places this same mod with `props.chrome` set to `brand`, `footer`, `tabs`, `pane` or `status`. `props.view` selects the search, worktree, machine-add, rename/confirmation and Files/Changes controllers. These copies return before sidebar initialization and never start its pollers. Terminal menus and toasts use the layout's supported overrides. Settings, the app palette, Welcome and internally opened dialogs remain app-owned.

## Use

- Click a space to switch; click a session row to open that tab.
- The chevron at the right edge of a space folds its sessions. Fold state is per mod copy, kept in `localStorage` under `spaces.sessions.folded`.
- Drag a space row to reorder it inside its machine; right-click for the usual space menu (rename, worktrees, close).
- Click a machine header to fold its spaces. Login guidance and Copy stay visible when folded; a rebuilt machine shows Connect below its header.
- The sidebar `+` starts in the current machine's home in both modes, rather than inheriting the active project's folder. A machine header's `+` explicitly targets that machine.
- The Git-branch button beside a space opens **New worktree** directly for that space, including remote spaces, without selecting it. The dialog checks its live folder and explains when it is outside Git.
- Machine, space and worktree actions use 28, 24 and 20 px targets; titles use 16, 14 and 12 px. All three tiers occupy the same two centered action columns, so `+`/worktree and fold controls align. Worktrees do not shrink further with depth.
- A new branch starts at the clicked checkout's current commit, recorded with its source space, branch and path. The sidebar preserves this ancestry across restart and reopening a checkout. Checking out an existing branch does not invent a source relationship.
- **Space name and icon:** right-click → **Rename & appearance…**. Worktrees have a fixed icon and offer renaming only. The same context menu opens in expanded and compact modes.
- **Machine avatar:** right-click its header (also in the rail). Choosing a character previews its automatic accent; Save applies it to the machine and its spaces.
- Spaces get one of **12 inherited shades**, using unoccupied slots first; there are no manual color/shade controls or shade-strip previews.
- Spaces offer the full available **Material Sharp** catalog with search and categories. No style selector. Worktrees always use `account_tree`.
- Avatar **Default** returns to the saved random icon without rerolling; **Cancel** discards drafts. Preview and Save/Cancel stay outside scrolling. Down from search enters the gallery; arrows navigate, Enter selects, Ctrl/Cmd+Enter saves.
- Character labels use friendly names. Original IDs, sources, attribution and licenses remain bundled in `icons/plushies/`. Sprite sheets show their first frame, without animation.
- `agent.next` / `agent.prev` follow the session rows in list order: the mod calls `setAgentOrder` on render.
- Dragging the sidebar below 160 px switches to the compact rail.

## Customize

- **Colors:** `character-accents.ts` contains accents extracted offline from the displayed first frame of each character. `appearance-colors.ts` derives 12 OKLCH shades with light/dark variants and gamut mapping. Changing the character updates its family without reallocating icons or tone slots. `space.colors` remains published for compatibility; our search only reads identities/colors and never prunes or allocates them.
- **Sidebar width:** the layout starts at 299 px; drag the divider or edit the `sidebar` size in `layouts/main-status.json`. Below 160 px the rail takes over.
- **Frames and controls:** `ui/tokens.ts` owns `UI.stroke` (2 px), shared sizes and the three fixed `HIERARCHY` tiers; `ui/hierarchy.ts` owns hierarchy actions and tree connectors. Build synchronizes native layout border/divider widths from the same token.
- **Theme:** the layout pins `{ "light": "paper", "dark": "ink" }`; change the root `theme` or use the theme picker.
- **Fonts:** the layout sets `font: "Liberation Mono"`, `font_size: 14` and `ui_font: "Liberation Sans"`. The mod's `UI_FONT` and `UI_FONT_SIZE` in `appearance-model.ts` set its base UI typography to Liberation Sans 14; rebuild after changing them.
- **Saved appearance:** schema v2 in `spaces-status.appearance` stores profiles and defaults by space ID or machine identity (`local` / `remote:<name>`). Existing character choices and compatible Material names remain; old Material styles become Sharp. Legacy machine colors are readable but no longer determine the displayed color. Worktree icons are locked.
- **Allocation:** random characters are reserved across machines, random icons within each machine. Shade slots are allocated from unused slots first. Existing/offline identities retain their defaults; exhausted pools reuse least-used candidates. Renaming a connection changes its identity key.
- **Assets:** the source Material catalog/fonts remain bundled, but the UI uses Sharp exclusively. No runtime downloads. Our search uses the sidebar's saved avatars; stock search entrypoints inside the app palette retain their own presentation.

## Build

The mod is written in TypeScript; Herdr loads JavaScript. The compiled `.js` files are included, so installation needs no toolchain. Edit the `.ts` sources and rebuild:

```sh
npm install
npm run build
npm run check
npm run test
```

`npm run check` type-checks without writing. The `tsconfig.json` follows the settings Herdr writes into every mod's `jsconfig.json`: `strict` with `strictNullChecks` off, because a View assigns its state in `init` and TypeScript cannot see that as definite assignment. The declaration files in `mods/spaces-status/types/` are Herdr's own, snapshotted from 0.1.15; copy a newer one over from `~/.config/herdr-app/mods/<any mod>/gpui-kit.d.ts` when the mod moves to a newer Herdr.

Appearance, chrome, UI-kit, presentation and view-controller modules additionally pass `tsconfig.appearance.json` with `strictNullChecks: true`. Tests use Node's built-in runner and host mocks, without a test framework or a running Herdr. `npm run sync-icons` and `npm run sync-plushies` are development-only asset importers. After changing character assets, run `npm run character-accents` to regenerate their accents offline; ordinary build/install never accesses the network.

The API baseline remains Herdr 0.1.15; the current validation target is Herdr 0.1.16 with hc 0.1.21. A check on 0.1.16 does not replace a runtime compatibility test on 0.1.15.

## Files

```
layouts/main-status.json           the layout: sidebar, tabs, panes, status bar
mods/spaces-status/main.ts         the Spaces sidebar mod, in TypeScript
mods/spaces-status/main.js         what Herdr loads: main.ts compiled (committed)
mods/spaces-status/appearance-*.ts  validated settings, shared avatar renderer, editor
mods/spaces-status/appearance-*.js  compiled helper modules (committed)
mods/spaces-status/pixel-*.ts/js    typed chrome, menus and shared bitmap controls
mods/spaces-status/ui/             shared controls, rows, menus, surfaces and geometry
mods/spaces-status/presentation/   pure labels, status and read-only identity projections
mods/spaces-status/views/          picker, dialogs, worktrees, machines, files, changes, toasts
mods/spaces-status/overlays.ts/js   one place for owned overlay opening and explicit targets
mods/spaces-status/character-accents.ts/js  build-time character accent table
mods/spaces-status/worktree-lineage.ts/js   saved exact creation origins by machine/checkout
mods/spaces-status/material-catalog.* generated full Material Icons search index
mods/spaces-status/plush-catalog.*  validated SS14 sprite-sheet index
mods/spaces-status/fonts/           Liberation/Material fonts + Tiny5, licenses and hashes
mods/spaces-status/mod.json        mod metadata (place: none)
mods/spaces-status/tsconfig.json   the mod's TypeScript build
mods/spaces-status/tsconfig.appearance.json strict-null check for appearance code
mods/spaces-status/types/          Herdr's declarations, snapshotted from 0.1.15
mods/spaces-status/icons/          home/tree glyphs and four original pixel mascots
mods/spaces-status/icons/plushies/  32 original SS14 PNGs, metadata and CREDITS.md
tests/                            pure-model and mocked UI regression tests
scripts/sync-material-icons.mjs    development-only icon asset importer
scripts/sync-plushies.mjs          development-only SS14/Tiny5 importer
scripts/sync-ui-layout.mjs         derives native layout frame widths from UI.stroke
package.json                       npm run build: tsc, no runtime dependencies
keys.json                          the optional alt-shift-f / Yazi binding
keys.main-status.json              layout-scoped search and rename bindings to merge
RECIPE.md                          the build brief: what it is and how to recreate it
```

## Update

Ask your agent:

```text
Read ~/.config/herdr-app/AGENTS.md, then update my installed main-status layout from https://github.com/Marinadec-kk/marinadec-s-herdr. Use copies in Herdr's home and preserve my local customizations and saved appearance preferences.
```

Use your `HERDR_APP_HOME` path in the prompt when set. If installation chose different layout/mod names, give the agent those names.

For a manual installation using the original names and unmodified installed files, keep the checkout and run the following with Herdr open. It replaces the installed mod folder and layout with the latest repository versions:

```sh
(
  set -eu
  repo="$HOME/Projects/marinadec-s-herdr"
  home="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"

  git -C "$repo" pull --ff-only
  herdr-app check "$repo/mods/spaces-status"
  herdr-app do layout.switch --name main
  rm -rf "$home/mods/spaces-status"
  cp -R "$repo/mods/spaces-status" "$home/mods/"
  cp "$repo/layouts/main-status.json" "$home/layouts/main-status.json"
  herdr-app check "$home/mods/spaces-status"
  herdr-app do layout.switch --name main-status
)
```

If you removed the checkout after installation, clone it again first. A `git pull` alone updates only the checkout; both the mod and layout must be copied into Herdr's home.

**Migrating an older symlink installation:** the same update block replaces the `spaces-status` symlink with a real directory. Removing the link (without a trailing slash) leaves its source checkout intact.

Herdr watches the copied files for changes. Newly added fonts load on app start or the next look change; if glyphs are missing, switch themes once and back, or restart Herdr. Saved colors, avatars and fold state stay in Herdr's state files.

## Uninstall

With Herdr running, switch back to `main` and remove the installed copies:

```sh
(
  set -eu
  home="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
  herdr-app do layout.switch --name main
  rm -rf "$home/mods/spaces-status"
  rm -f "$home/layouts/main-status.json"
)
```

Use the names chosen at installation if they differ. If you added the optional Yazi shortcut, remove that binding from Herdr's `keys.json` too.

The checkout can be deleted separately. Herdr retains local preferences such as `space.colors`, `spaces-status.appearance`, fold state and layout clicks for a later reinstall.

## License

MIT for original code/art (`LICENSE`). Inherited Herdr layout/sidebar/chrome code retains Apache 2.0 (`LICENSE-APACHE`), as do Google's Material Icons. Liberation Fonts and Tiny5 are SIL OFL 1.1 (`mods/spaces-status/fonts/OFL-Liberation.txt` and `mods/spaces-status/fonts/OFL-Tiny5.txt`). SS14 plush sprites retain their individual **CC BY-SA 3.0/4.0 or CC0** licenses; they are **not** covered by this repository's MIT license. See `icons/plushies/CREDITS.md`, original metadata and pinned source hashes. The non-commercial vulp set is excluded.
