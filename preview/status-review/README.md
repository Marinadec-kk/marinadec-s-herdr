# Status review

Native, interactive Herdr prototype with synthetic spaces and agents. It does not replace the installed layout, read live agents, run terminals, poll, write live preferences or access the network.

```sh
node scripts/preview-status.mjs
```

The launcher copies the existing UI helpers/fonts/art and this scene into a fresh `/tmp/opencode/herdr-status-review-*` app home and checks it. On Linux it starts a private KWin virtual Wayland display, with a private D-Bus session and private XDG config/cache/data/runtime folders. The regular native Herdr renderer runs there, not on the person's desktop. It uses software Vulkan when the system's lavapipe ICD is available. This requires `kwin_wayland` and `dbus-run-session`; it never falls back to opening a real desktop window automatically.

GPUI's `ZED_HEADLESS` can validate layout but does not draw screenshot pixels in the current build, so it is not used for visual review.

`--prepare-only` prepares and checks without launching. `--window` explicitly opens an interactive desktop window instead of the virtual display. Closing that window leaves the real app and terminals alone.

Use the printed app-home path to inspect/capture the offscreen scene:

```sh
HERDR_APP_HOME=/tmp/opencode/herdr-status-review-XXXXXX XDG_RUNTIME_DIR=/tmp/opencode/herdr-status-review-XXXXXX/runtime herdr-app status
HERDR_APP_HOME=/tmp/opencode/herdr-status-review-XXXXXX XDG_RUNTIME_DIR=/tmp/opencode/herdr-status-review-XXXXXX/runtime herdr-app shot /tmp/opencode/status-review.png
```

- Compare 44/76/159 px rails with 299/340 px expanded sidebars.
- Select synthetic spaces or sessions in either sidebar.
- Change an agent's state in the inspector; the space summary uses `blocked > done > working > idle`.
- Fold expanded session lists, inspect full ancestry/status tooltips, and switch ink/paper.
- The legend compares the installed indicators with this proposal.

Only the preview's local in-memory selection, status and folding change. Theme picks persist inside its temporary app home. Runtime props `railWidth`, `wideWidth`, `selected` and `folded` allow reproducible screenshot scenes. This is a review fixture, not a production implementation.
