# Marinadec's Herdr

A layout for the [Herdr](https://herdr.dev) desktop app. Herdr's Spaces sidebar becomes an inline agent board: every tab running an agent shows up under its space with the harness, live status and sub-agent count. Worktrees nest under their checkout, and every space gets a soft colored tile.

- **Inline sessions.** A tab gets a row only if it runs Claude Code, OpenCode, Pi or another agent. The row shows the harness icon, the tab's name, `+N` for sub-agents and the tab's own status.
- **One status per level.** Expanded, a space leaves status to its session rows. Fold it with the chevron at the right edge, and the space row summarizes its harnesses and the most urgent status.
- **Worktrees nest.** A worktree space appears under the repo it belongs to, with a tree avatar; its sessions indent one level deeper.
- **Letter avatars.** Each space gets an 18×18 tile with a soft color wash and its first letter, in ten colors assigned automatically and rebalanced on render. Only `~` (a house) and worktrees (a tree) use a fixed Material icon, so nothing depends on what a space is called.
- **Machines.** Spaces group by machine when more than one is connected; the local group is “This computer”.
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

Nothing else in the layout is specific to this mod: the sidebar, tabs, pane cards and status bar are Herdr's own.

## Use

- Click a space to switch; click a session row to open that tab.
- The chevron at the right edge of a space folds its sessions. Fold state is per mod copy, kept in `localStorage` under `spaces.sessions.folded`.
- Drag a space row to reorder it inside its machine; right-click for the usual space menu (rename, worktrees, close).
- `agent.next` / `agent.prev` follow the session rows in list order: the mod calls `setAgentOrder` on render.
- Dragging the sidebar below 160 px switches to the compact rail.

## Customize

- **Space colors:** `PROJECT_COLORS` and `MARK` at the top of `mods/spaces-status/main.js`. Colors are stored in shared `space.colors` as theme names or `#rrggbb`; Herdr's shipped `spaces` and `picker` mods understand the same values.
- **Sidebar width:** the layout starts at 299 px; drag the divider or edit the `sidebar` size in `layouts/main-status.json`. Below 160 px the rail takes over.
- **Theme:** the layout pins `{ "light": "paper", "dark": "ink" }`; change the root `theme` or use the theme picker.
- **Fixed icons:** only `~` and worktrees use SVGs. If you want to change them, replace `mods/spaces-status/icons/home.svg` or `account_tree.svg`; they must use `fill="currentColor"` so the tile can tint them.

## Files

```
layouts/main-status.json      the layout: sidebar, tabs, panes, status bar
mods/spaces-status/main.js    the Spaces sidebar mod
mods/spaces-status/mod.json   mod metadata (place: none)
mods/spaces-status/icons/     home.svg and account_tree.svg
keys.json                     the optional alt-shift-f / Yazi binding
RECIPE.md                     the build brief: what it is and how to recreate it
```

## Update

```sh
cd ~/Projects/marinadec-s-herdr
git pull
```

Herdr doesn't notice changes inside a symlinked mod folder, so after a `git pull` restart Herdr (or make the link again) to load the new version. The layout is a copy: copy `layouts/main-status.json` again after a layout change.

## Uninstall

```sh
herdr-app do layout.switch --name main
home="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
rm -rf "$home/mods/spaces-status"
rm -f "$home/layouts/main-status.json"
```

`shared.json` may keep `space.colors` entries; they are harmless and are pruned when spaces disappear.

## License

MIT for the original parts of this repository (`LICENSE`). The layout is a copy of Herdr's `main` and the mod started as a copy of Herdr's `spaces`; that inherited code keeps Herdr's Apache License 2.0 (`LICENSE-APACHE`). The Material Icons Round SVGs also come under Apache 2.0.
