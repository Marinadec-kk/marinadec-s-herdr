# OpenCode terminal palette

`opencode-tui.json` adapts the **V2 terminal** `opencode` dark palette, not the desktop/web `oc-2` theme. Source pinned to [OpenCode commit 1f01f83797d1ab5f096ea6fcaf03c9368e72848c](https://github.com/anomalyco/opencode/blob/1f01f83797d1ab5f096ea6fcaf03c9368e72848c/packages/tui/src/theme/assets/v2/opencode.json). Upstream copyright and MIT permission are in `OpenCode-LICENSE.txt`.

Base/raised backgrounds, text, border, interactive accent and feedback colors retain their upstream values. Herdr selection/hover fills and its four agent-status roles are adaptations. Herdr's `input` is an input **border** in our controls, so it uses OpenCode's border color, not its form background.

OpenCode does not define ANSI-16 in this theme. The `ansi` array preserves Herdr **0.1.16 ink**, captured from the native isolated renderer, to avoid silently changing terminal/syntax colors. Explicit truecolor terminal output still belongs to each terminal application. Character-derived machine/space colors are not part of this theme.

Only this layout's dark theme is changed; light mode retains `paper`. This is a static adaptation, with no runtime reads of OpenCode settings or network synchronization.
