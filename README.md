# Marinadec's Herdr

A Herdr layout built around the Spaces sidebar: every tab running an agent becomes a row under its space, with the harness, live status and sub-agent count. Spaces without agents stay ordinary rows; worktrees stay nested under their checkout.

![Marinadec's Herdr](preview.png)

## What it does

- **Inline sessions.** A tab gets a row only if it runs Claude, OpenCode, Pi or another agent. The row shows the harness icon, the tab's name, `+N` for sub-agents and the tab's own status.
- **One status per level.** Expanded, a space leaves status to its session rows. Fold it with the chevron at the right edge, and the space row summarizes its harnesses and most urgent status.
- **Worktrees nest.** A worktree space appears under the repo it belongs to, with a tree avatar; its sessions indent one level deeper.
- **Soft avatars.** 18×18 tiles with a 20% color wash and the glyph in the same color. Ten slots are assigned automatically, and duplicates are rebalanced on render.
- **Material glyphs.** A space gets a Material Rounded icon when its name or repo says what it is (`document`, `infra`, `service`, `analysis`, `web`, ...); unknown names keep their letter. `~` is a house, worktrees a tree.
- **Machines.** Spaces group by machine when more than one is connected; the local group is "This computer".
- **Compact rail.** Narrow the sidebar under 160 px and it becomes a rail of status dots; sessions are hidden.

## Requirements

- Herdr 0.1.15 or newer (the layout and mod were cloned from Herdr 0.1.15).
- The shipped mods `workspace-chrome`, `menu`, `tabs`, `pane`, `files`, `changes` and `workspace-status`. They ship with Herdr; nothing else to install.
- `git` in the space's folder if you want branch / ahead-behind tails. Without it the rows still work.

## Install

Clone and run the installer:

```sh
git clone https://github.com/Marinadec-kk/marinadec-s-herdr.git
cd marinadec-s-herdr
./install.sh
```

The script copies `layouts/main-status.json` and `mods/spaces-status/` into `${HERDR_APP_HOME:-$HOME/.config/herdr-app}` and switches to `main-status` if a Herdr window is running. Use `./install.sh --no-switch` to install without switching.

Manual install, with Herdr running:

```sh
home="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
mkdir -p "$home/layouts" "$home/mods/spaces-status"
cp layouts/main-status.json "$home/layouts/"
cp -R mods/spaces-status/. "$home/mods/spaces-status/"
herdr-app do layout.switch --name main-status
```

Herdr loads the files live. To go back to the shipped layout, `herdr-app do layout.switch --name main`; the files stay until you remove them.

## Use

- Click a space to switch; click a session row to open that tab.
- The chevron at the right edge folds a space's sessions. Fold state is per mod copy, kept in `localStorage` under `spaces.sessions.folded`.
- Drag a space row to reorder it inside its machine; right-click for the usual space menu (rename, worktrees, close).
- `agent.next` / `agent.prev` follow the session rows in list order: the mod calls `setAgentOrder` on render.

## Customize

- **Space colors:** `PROJECT_COLORS` and `MARK` at the top of `mods/spaces-status/main.js`. Colors are stored in shared `space.colors` as theme names or `#rrggbb`; Herdr's shipped `spaces` and `picker` mods understand the same values.
- **Icons:** `SPACE_ICONS` maps words to icon names. Drop another Material SVG into `mods/spaces-status/icons/` and add a rule; SVGs must use `fill="currentColor"` so the tile can tint them.
- **Sidebar width:** the layout starts at 299 px; drag the divider or edit the `sidebar` size in `layouts/main-status.json`. Below 160 px the rail takes over.
- **Theme:** the layout pins `{ "light": "paper", "dark": "ink" }`; change the root `theme` or use the theme picker.

## Files

```
layouts/main-status.json      the layout: sidebar, tabs, panes, status bar
layouts/main-status.png       its preview in Herdr's settings
mods/spaces-status/main.js    the Spaces sidebar mod
mods/spaces-status/mod.json   mod metadata (place: none)
mods/spaces-status/icons/     Material Rounded SVGs used by the avatars
install.sh                    copy the layout and mod into a Herdr home
RECIPE.md                     the build brief: what it is and how to recreate it
preview.png                   screenshot
```

## Update

```sh
git pull
./install.sh
```

The installer overwrites the two installed paths. Keep local edits in the repo, not in `~/.config/herdr-app`, or they will be replaced.

## Uninstall

```sh
herdr-app do layout.switch --name main
home="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
rm -rf "$home/mods/spaces-status"
rm -f "$home/layouts/main-status.json" "$home/layouts/.state/main-status.json"
```

`shared.json` may keep `space.colors` entries; they are harmless and are pruned when spaces disappear.

## Credits

Material Icons Round: Google, Apache License 2.0. See `THIRD_PARTY_NOTICES.md`.
Herdr, its layouts and shipped mods: the Herdr project.

## License

MIT for this layout and mod, except the icons noted above. See `LICENSE`.
