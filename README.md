# Marinadec's Herdr

A pixel-art workspace for the [Herdr](https://herdr.dev) desktop app. Every agent tab appears under its space with its harness, live status and sub-agent count. Worktrees nest under their checkout; machines and spaces have editable colors and avatars.

- **Pixel chrome.** Tiny5 typography (including the full Russian alphabet), square controls, bitmap glyphs and sharp pane frames across the sidebar, tabs, pane headers, brand/footer and status bar. Terminal fonts/content and global app settings are unchanged.
- **Clear space groups.** Each space and its sessions share one frame and a 3 px colored edge, with 8 px between groups. Worktrees indent as a group.

- **Inline sessions.** A tab gets a row only if it runs Claude Code, OpenCode, Pi or another agent. The row shows the harness icon, the tab's name, `+N` for sub-agents and the tab's own status.
- **One status per level.** Expanded, a space leaves status to its session rows. Fold it with the chevron at the right edge, and the space row summarizes its harnesses and the most urgent status.
- **Worktrees nest.** A worktree space appears under the repo it belongs to, with a tree avatar; its sessions indent one level deeper.
- **Editable avatars.** Each space starts with a letter tile (`~` gets a house, worktrees a tree). Rename it and choose its color/avatar in one dialog. Machines have the same choices: letter, four original critters, **32 SS14 plushies**, or the complete Material Icons catalog.
- **Machines.** When a remote machine is known, each machine gets a color-framed card; the local card is “THIS COMPUTER”. The current Critters visual trial tints the whole card and puts a small pixel scene beside a bold machine name, with a local/remote label and space count below it. Offline machines keep their card too. With only this computer, there is no machine header or card.
- **Compact rail.** Narrow the sidebar under 160 px and it becomes a rail of status dots; session rows are hidden.
- **Everything the spaces list already does.** Click to switch, right-click for the usual space menu, drag to reorder, branch and ahead/behind tails, per-machine groups.

## Install

Clone this repository and link the mod into Herdr's home:

```sh
git clone https://github.com/Marinadec-kk/marinadec-s-herdr.git ~/Projects/marinadec-s-herdr
ln -s ~/Projects/marinadec-s-herdr/mods/spaces-status ~/.config/herdr-app/mods/spaces-status
cp ~/Projects/marinadec-s-herdr/layouts/main-status.json ~/.config/herdr-app/layouts/
herdr-app do layout.switch --name main-status
```

If Herdr is not running yet, start it after copying the files; the layout is in the layout picker. `ctrl-shift-l` switches back to any other layout.

Check the install:

```sh
herdr-app check ~/.config/herdr-app/mods/spaces-status
```

It should print `check passed`.

Or ask your Herdr agent to add `herdr.dev/layouts/Marinadec-kk/marinadec-s-herdr`.

Herdr uses `HERDR_APP_HOME` instead of `~/.config/herdr-app` when set; use that path in the commands above.

### Custom keys

`keys.json` in this repository holds the `alt-shift-f` binding used with this layout: it opens [Yazi](https://github.com/sxyazi/yazi) in a right split. Merge the `global` section into `~/.config/herdr-app/keys.json`; without it the key stays unbound:

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

For pixel chrome too, use the supplied layout: it places this same mod with `props.chrome` set to `brand`, `footer`, `tabs`, `pane` or `status`. These copies return before sidebar initialization and never start its pollers. Files/Changes contents, the app picker, settings and core-owned dialogs remain stock; no shipped mod is overwritten.

## Use

- Click a space to switch; click a session row to open that tab.
- The chevron at the right edge of a space folds its sessions. Fold state is per mod copy, kept in `localStorage` under `spaces.sessions.folded`.
- Drag a space row to reorder it inside its machine; right-click for the usual space menu (rename, worktrees, close).
- Click a machine header to fold its spaces. Login guidance and its Copy button remain visible when folded; a rebuilt machine shows a Connect action in its header.
- **Space name, color and avatar:** right-click its row → **Rename & appearance…**. Worktree and close actions remain in that menu. Right-click a rail space to open its editor directly.
- **Machine color and avatar:** use the small settings button in its header, or right-click the header (also in the rail).
- Choose a preset color or enter `#rrggbb`; browse **2276 Material icon names** with search, categories and five styles. A preview is local to the dialog until **Save**. **Cancel** discards the draft; **Reset appearance** restores automatic color/avatar without changing the name.
- **Default avatar** changes only the avatar: the machine's assigned critter, or a space's letter/home/tree. It does **not** reset the color. Material style buttons show a sample and explanation; changing style also updates a selected Material icon when available.
- **SS14 plushies** are a separate gallery in the same editor. Hover for the sprite name/license; attribution and unchanged source metadata are bundled in `icons/plushies/`. Sprite sheets display only their first frame, without animation.
- `agent.next` / `agent.prev` follow the session rows in list order: the mod calls `setAgentOrder` on render.
- Dragging the sidebar below 160 px switches to the compact rail.

## Customize

- **Colors:** use the appearance editor; a manual choice is never rebalanced away. `PROJECT_COLORS` and `MARK` in `mods/spaces-status/appearance-model.ts` define the automatic palette; rebuild after editing it. Space colors are also published to Herdr's shared `space.colors`, so the shipped picker uses the same color.
- **Sidebar width:** the layout starts at 299 px; drag the divider or edit the `sidebar` size in `layouts/main-status.json`. Below 160 px the rail takes over.
- **Theme:** the layout pins `{ "light": "paper", "dark": "ink" }`; change the root `theme` or use the theme picker.
- **Saved appearance:** choices live locally in shared `spaces-status.appearance`, keyed by space id or machine identity (`local` / `remote:<name>`), not by row position or space name. Space renaming does not change its avatar. Renaming a machine connection itself changes its key.
- **Machine defaults (visual trial 2):** a saved allocator gives machines different colors/mascots while unused slots remain (ten colors, four mascots). Existing assignments survive reordering and restart. Explicit choices may intentionally repeat. Pixel mascots are static identity/decor, not status; the rail keeps its monitor/server icons.
- **Material Icons:** all five font families and a searchable index are bundled locally; no icon downloads occur while browsing or rendering. Some names are available only in particular styles. Custom avatars currently affect this sidebar, not the shipped tab bar or picker icons.

## Build

The mod is written in TypeScript; Herdr loads JavaScript. The compiled `.js` files are included, so installation needs no toolchain. Edit the `.ts` sources and rebuild:

```sh
npm install
npm run build
npm run check
npm run test
```

`npm run check` type-checks without writing. The `tsconfig.json` follows the settings Herdr writes into every mod's `jsconfig.json`: `strict` with `strictNullChecks` off, because a View assigns its state in `init` and TypeScript cannot see that as definite assignment. The declaration files in `mods/spaces-status/types/` are Herdr's own, snapshotted from 0.1.15; copy a newer one over from `~/.config/herdr-app/mods/<any mod>/gpui-kit.d.ts` when the mod moves to a newer Herdr.

Appearance and pixel-chrome modules additionally pass `tsconfig.appearance.json` with `strictNullChecks: true`. Tests use Node's built-in runner and host mocks (validated on Node 26.13.0), without a test framework or a running Herdr. `npm run sync-icons` and `npm run sync-plushies` are development-only asset importers; ordinary build/install never accesses the network.

The API baseline remains Herdr 0.1.15; the current validation target is Herdr 0.1.16 with hc 0.1.21. A check on 0.1.16 does not replace a runtime compatibility test on 0.1.15.

## Files

```
layouts/main-status.json           the layout: sidebar, tabs, panes, status bar
mods/spaces-status/main.ts         the Spaces sidebar mod, in TypeScript
mods/spaces-status/main.js         what Herdr loads: main.ts compiled (committed)
mods/spaces-status/appearance-*.ts  validated settings, shared avatar renderer, editor
mods/spaces-status/appearance-*.js  compiled helper modules (committed)
mods/spaces-status/pixel-*.ts/js    typed chrome, menus and shared bitmap controls
mods/spaces-status/material-catalog.* generated full Material Icons search index
mods/spaces-status/plush-catalog.*  validated SS14 sprite-sheet index
mods/spaces-status/fonts/           Material fonts + Tiny5, licenses and hashes
mods/spaces-status/mod.json        mod metadata (place: none)
mods/spaces-status/tsconfig.json   the mod's TypeScript build
mods/spaces-status/tsconfig.appearance.json strict-null check for appearance code
mods/spaces-status/types/          Herdr's declarations, snapshotted from 0.1.15
mods/spaces-status/icons/          home/tree glyphs and four original pixel mascots
mods/spaces-status/icons/plushies/  32 original SS14 PNGs, metadata and CREDITS.md
tests/                            pure-model and mocked UI regression tests
scripts/sync-material-icons.mjs    development-only icon asset importer
scripts/sync-plushies.mjs          development-only SS14/Tiny5 importer
package.json                       npm run build: tsc, no runtime dependencies
keys.json                          the optional alt-shift-f / Yazi binding
RECIPE.md                          the build brief: what it is and how to recreate it
```

## Update

```sh
cd ~/Projects/marinadec-s-herdr
git pull
```

Herdr doesn't notice changes inside a symlinked mod folder, so after a `git pull` restart Herdr (or make the link again) to load the new version. Newly added fonts load on restart or the next look change; if icon glyphs are missing, switch themes once and back. The layout is a copy: copy `layouts/main-status.json` again after a layout change.

## Uninstall

```sh
herdr-app do layout.switch --name main
home="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
rm -rf "$home/mods/spaces-status"
rm -f "$home/layouts/main-status.json"
```

`shared.json` may retain `space.colors` and `spaces-status.appearance` entries. They are local preferences; appearance records are intentionally not erased when a remote machine is temporarily absent.

## License

MIT for original code/art (`LICENSE`). Inherited Herdr layout/sidebar/chrome code retains Apache 2.0 (`LICENSE-APACHE`), as do Google's Material Icons. Tiny5 is SIL OFL 1.1 (`fonts/OFL-Tiny5.txt`). SS14 plush sprites retain their individual **CC BY-SA 3.0/4.0 or CC0** licenses; they are **not** covered by this repository's MIT license. See `icons/plushies/CREDITS.md`, original metadata and pinned source hashes. The non-commercial vulp set is excluded.
