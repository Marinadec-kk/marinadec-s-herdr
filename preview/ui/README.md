# UI review

The production chrome, appearance editor, menus and view controllers, rendered with a synthetic host. No terminal/core commands, real filesystem reads or live preference writes can leave the fixture. Only theme/settings/window reads use the isolated app.

```sh
node scripts/preview-status.mjs --ui
node scripts/preview-status.mjs --ui --zoom=1.25 --scale=1.25
node scripts/preview-status.mjs --ui --page=appearance --zoom=1.5 --theme=paper
node scripts/preview-status.mjs --ui --page=sidebar
node scripts/preview-status.mjs --ui --page=sidebar --sidebar-width=44 --zoom=1.25 --scale=1.25
```

Uses the same private virtual compositor and app home as [status review](../status-review/README.md); no desktop window opens by default. The printed home selects the instance for `herdr-app status`, `shot`, and `do window.close`.

Pages: `sidebar`, `chrome`, `appearance`, `machine`, `menu`, `picker`, `rename`, `confirm-close`, `machine-add`, `worktree`, `files`, `changes`. The default dark theme is the bundled `opencode-tui`; use `--theme=paper` for light mode. View pages use empty synthetic I/O; they are not end-to-end Git or SSH tests.

`sidebar` uses the **actual production entrypoint**, brand and footer with local/remote machines, nested worktrees, sessions and null/all four statuses. It compares 44/76/159/299/340 px widths; `--sidebar-width=N` selects one width, including 160/339 boundary cases. Initialization suppresses sidebar jobs, and the fixture host also blocks every real command/core/file operation. It does not render live terminals or validate native tab-pane internals.

The chrome page includes all icon sizes, each status, long Cyrillic names/paths, 220–680 px pane headers and 220–900 px status bars. Two headers force hover and one forces keyboard-revealed controls for reproducible screenshots; action behavior is covered by the mocked handler tests. Verify at zoom 1, 1.25, 1.5 and 2, and with fractional compositor scale.
