# Marinadec's Herdr

A Herdr layout with the Spaces sidebar turned into an inline agent board: each tab that runs an agent becomes a row under its space with its harness, live status and sub-agent count. The work area is Herdr's usual tabs and pane cards, with the sidebar, statuses and avatars restyled.

## What you see

**The window.** A 299 px sidebar on the left (min 44, max 480), a 1 px `border` divider, and the work area on a `canvas` background. The layout pins `{ "light": "paper", "dark": "ink" }`, uses 14×12 terminal padding, hides the system title bar and puts macOS traffic lights at `[12, 16]`.

**The sidebar.** Three blocks: a 46 px `workspace-chrome` brand bar, the Spaces list with weight 1 and min 90, and a 69 px `workspace-chrome` footer. The list background is `chrome`.

**Machine headers.** 26 px high, 11 px dim text, 8 px horizontal padding. A monitor icon for this computer, a server icon for a remote one, then the machine name, a 6 px connection dot, a plus, and a fold chevron. Connected local machines are named "This computer". A machine needing a login gets a line with `hc machine login <name>` and a Copy button. A rebuilt machine gets a Connect action. With one machine, its header stays too: it is the anchor for the "New space there" row.

**Space rows.** 30 px high (28 px for worktree rows), 8 px horizontal padding, 8 px radius, 9 px gap. The avatar is an 18×18 tile, radius 5, background `color + "2e"` (about 18% alpha), a 1 px border `color + "33"`, and a 10.5 px bold letter in the avatar color (on light themes the letter is `foreground`). Only `~` and worktrees swap the letter for a 12 px Material glyph, a house and a tree. The name is 13 px `foreground`, truncated at 150 px. When there is something unusual to say, a 11.5 px `dim` tail follows: repo and branch, `↑N` in `ansi2`, `↓N` in `ansi1`. The right side holds the harness icons, the aggregate status, and the session chevron.

**Session rows.** One per tab that has an agent: 26 px high, 22 px left padding (38 px under a worktree), 8 px right padding, 8 px gap, 8 px radius. It shows 13 px harness icons, a 13 px label, a 10 px `+N` sub-agent count, and the tab's status. The active session row is `selected`; the label is `foreground` when its space and tab are active, `dim` when the tab is settled, `muted` otherwise. Hovering uses `hover`.

**Statuses.** The same shapes as Herdr's agents list: a 12 px spinning `spinner.svg` in `working`, a 14 px rounded `!` badge in `blocked`, a 7 px filled dot in `done`, a 7 px ring in `idle`. Tooltips name the status and the harness behind it, for example "Needs you · Claude Code".

**The rail.** When the sidebar is narrower than 160 px, the list draws 32 px cells: a machine icon (with a connection badge) per machine, and numbered space cells with a status dot. Names, tails and sessions are hidden; machine headers and the new-space row stay clickable.

**The work area.** A 42 px tab bar, then the active tab's panes with 8 px padding and gap. Each pane is a card: `background` fill, 1 px `border`, radius 10, an always-visible 30 px `pane` header on top, and the same border in `accent` while focused, even for a lone pane. A hidden 368 px Files/Changes stack sits on the right (min 280, max 900). The bottom is a 28 px `workspace-status` bar.

## How it behaves

**Space rows.** Click selects the space. Right-click opens the shipped `menu` overlay with `{ tab: "space", target: { id } }` (rename, worktrees, close). Drag a row onto another to reorder it inside its machine through `space.move`; the dragged row is dimmed, and the row under the pointer gets the hover background.

**Sessions.** The mod reads `agents()` and `terminals()` once per render. A tab is included when at least one agent in it is not a sub-agent. Its status is the tab's own status, else the most urgent among its agents (`blocked > done > working > idle`). Sub-agents are terminals with a `parent`; they are counted recursively over live terminals and shown only as `+N`, never as rows. A click runs `space.select` and then `tab.select`.

**Labels.** A named tab uses its name. An unnamed tab uses a terminal title that says more than the program's name (but not a bare path or an `@` handle), else the program's name ("Claude Code", "OpenCode"). Two rows with the same label get `· <tab number>`.

**Folding.** Every space with sessions starts expanded. The chevron at the far right (10 px glyph in a 14 px hit box) toggles that space. Folded state is kept in `localStorage` under `spaces.sessions.folded`; a missing entry means expanded. While expanded, the space row hides its harness icons and status so the session rows carry them; while folded, the space row brings back the aggregate harnesses and the most urgent status. A space with no agents has no chevron.

**Agent order.** On every render the mod calls `setAgentOrder` with the agents of the session rows, in row order, so `agent.next` and `agent.prev` walk the same list. Folded spaces are included in that order.

**Worktrees.** Git info comes from the first live terminal's folder. A linked worktree whose repo matches a displayed checkout is moved under the first space of that repo; a `tree` flag changes the row height to 28 and adds the tree avatar. Its sessions use the deeper 38 px indent. Worktrees that are not spaces are not listed automatically.

**Git tails.** For each place, the mod runs `git rev-parse --show-toplevel`, `--git-common-dir`, `symbolic-ref -q HEAD` and `rev-list --left-right --count HEAD...@{upstream}`. It hides the branch when it repeats the space name or is `master`/`main`, hides the repo when it repeats the space name or the row is a worktree, and shows ahead/behind only when nonzero. Local repos are refreshed through `watchFolder`; remote ones on a timer. A place outside git simply has no tail.

**Machines.** Spaces are grouped by `machine`, local first, then remote names sorted. A remote that is loading shows a "Loading…" row; a folded machine hides its spaces. The machine fold state lives in `localStorage` under `machines.folded`.

**Colors.** A new space gets the least-used color from ten slots: the six legacy names (`ansi6`, `ansi3`, `ansi4`, `ansi5`, `ansi2`, `ansi1`) and four hex colors (`#2aa8c9`, `#7f9f4a`, `#a0785a`, `#b06ab3`). If the old palette left duplicates, the first owner keeps its color and later spaces take free slots. The map is shared under `space.colors`; the shipped `spaces` and `picker` mods understand both names and `#rrggbb`. Colors for spaces that no longer exist are pruned on render.

**Icons.** Two fixed glyphs only: `~` is a house and worktrees use the tree. Every other space keeps the first letter of its name, uppercased. Matching a space's name, repo or folder against a word list was removed on purpose: it made a fresh install depend on what spaces happened to be called. The two SVGs are Material Rounded, 12 px, tinted by the avatar ink.

## Built from

**Layout** — `layouts/main-status.json`, cloned from Herdr's `main` 0.1.15:

```
root (row, canvas, divider 1 border, titlebar none, traffic_lights [12,16],
      theme {light paper, dark ink}, terminal_padding [14,12])
├─ sidebar (column, 299 px, min 44, max 480, chrome, resizable false)
│  ├─ brand (block, 46 px, mod workspace-chrome, window_drag)
│  ├─ sidebar-lists (column)
│  │  └─ spaces (block, weight 1, min 90, mod spaces-status)
│  └─ sidebar-footer (block, 69 px, mod workspace-chrome, props {footer: true})
└─ work (column, resizable false)
   ├─ tabs (block, 42 px, mod tabs, window_drag)
   ├─ work-body (row, padding 8, gap 8)
   │  ├─ main (block, tab: active, pane: {header pane 30 top always,
   │  │        background, border 1 border, focus accent, radius 10, gap 8, lone})
   │  └─ panel (column, 368 px, min 280, max 900, hidden)
   │     └─ panel-body (stack, files | changes, active files)
   └─ status (block, 28 px, mod workspace-status)
```

**Mod** — `mods/spaces-status/`, cloned from Herdr's `spaces` 0.1.15, `place: none` (the layout places it). `main.ts` is one `View` class, in TypeScript; `main.js`, what Herdr loads, is its `tsc` output:

- `init` seeds state, starts a 15 s `refreshMachines` timer and a 250 ms `checkNew` timer, and reads `machines.folded` / `spaces.sessions.folded` from `localStorage`.
- `render` assigns/repairs space colors through `shared("space.colors")` / `setShared`, then draws machine groups. `narrow()` reads the live sidebar width from `layout()`.
- `sessions()` groups agents by tab, filters sub-agents, labels rows and counts live descendants from `terminals().parent`.
- `row()` / `sessionRow()` / `compact()` draw the three row forms; `gitTail()` and `spaceStatus()` are shared helpers.
- `HOME_GLYPH` / `TREE_GLYPH` give `~` and worktree rows their two fixed icons; every other row takes the first letter; `icon()` draws a program's icon from `programs.json` data.
- `refreshGit()` and `due()` decide when to ask git; local repos are watched with `watchFolder`, remote ones polled.
- The mod calls `run("space.select" | "tab.select" | "space.move" | "space.new" | "app.settings")` and opens the shipped `menu` overlay for right-clicks.
- Data comes from `spaces()`, `agents()`, `terminals()`, `machines()`, `panes()`, `layout()`, `theme()`, `settings()`, `shared()` and `setAgentOrder()`.

**Assets.** `mods/spaces-status/icons/` holds two Material Icons Round SVGs: `home` and `account_tree`. Each has `fill="currentColor"` so `svg(...).text_color(ink)` tints it.

**Build.** `main.js` is compiled from `main.ts` with `npm run build` (`package.json` holds only TypeScript as a dev dependency; `main.js` is committed so an install works without one). The `tsconfig.json` repeats the settings Herdr writes into every mod's `jsconfig.json` — `strict` with `strictNullChecks` off (a View assigns its state in `init`, which TypeScript cannot see as definite assignment), ES2022, no DOM lib — and `types/gpui-kit.d.ts` is the declaration file Herdr writes beside every mod, snapshotted from 0.1.15: it declares `gpui-kit`, `gpui-base` and `herdr` whole.

**Dependencies.** Herdr's shipped `workspace-chrome` (brand, footer, monitor/server, chevrons, plus, spinner), `tabs`, `pane`, `files`, `changes`, `workspace-status` and `menu` mods. No programs beyond `git` for the optional tails. No network access.

## Watch out

- **main.js is generated.** Edit `main.ts` and run `npm run build`; never edit `main.js` by hand.
- **The app writes into the mod folder.** On install Herdr drops its own `gpui-kit.d.ts` and `jsconfig.json` beside the mod; `.gitignore` keeps them out of the repository, and the tsconfig includes only `types/`, so the declarations are never doubled.
- **The type snapshot is pinned** to Herdr 0.1.15, like the rest of the mod. A newer Herdr rewrites `gpui-kit.d.ts` (with `herdr` inside) into every mod folder it sees: copy it over `types/gpui-kit.d.ts` when the mod moves up.
- **Version.** Built against Herdr 0.1.15. The layout references shipped mod names and the mod reads the 0.1.15 data shapes (`spaces`, `agents`, `terminals`, `machines`). A future Herdr that renames a shipped mod or a field will need a matching edit.
- **The agents block is intentionally absent.** Sessions live inline. Adding an `agents` block back would draw a second list and compete for `setAgentOrder`.
- **State overrides the file.** On a machine that already used `main-status`, `layouts/.state/main-status.json` can override the sidebar width and theme. A fresh install uses the file's 299 px and ink/paper.
- **Colors are local.** `shared("space.colors")` is keyed by space id and lives in that machine's shared state. The same repo on two machines can have different colors; nothing about colors is synced by this repo.
- **Fold state is local.** `spaces.sessions.folded` lives in the mod copy's `localStorage`, so another machine starts with every space expanded.
- **Avatars are letters.** The tile never changes with a space's name or folder; only `~` and worktree rows differ. This keeps a fresh install predictable and avoids the surprise of a renamed or moved space keeping an inherited icon.
- **Worktrees need spaces.** The nesting only places existing worktree spaces; it never creates a space per `git worktree`.
- **Sidebar width.** The rail starts below 160 px, read from the live layout, so dragging the divider switches forms without a setting.
- **The panel is hidden.** Files and Changes are in the layout but `hidden: true`; open them from the tab bar as usual. Their remembered width/active child can differ per machine through layout clicks.
- **Theme is pinned.** Change the root `theme` to follow your own look, or use the theme picker, which overrides the layout on that machine.

## Done when

- `npm run check` passes (the TypeScript compiles clean).
- `npm run build` reproduces `main.js` from `main.ts`.
- `herdr-app check mods/spaces-status` passes.
- `herdr-app status` shows `"layout": "main-status"` and `"errors": []`.
- A screenshot shows a row under every space that has an agent, harness icons and statuses on those rows, and the chevron at the far right.
- Clicking a session row switches to its space and tab.
- Folding a space hides its session rows and brings the aggregate harnesses/status back on the space row.
- A worktree space appears under its checkout with the tree avatar, and its sessions are indented one level deeper.
- Dragging the sidebar under 160 px switches to the rail with numbered space cells and status dots.
