# Marinadec's Herdr

A Herdr pixel workspace with an inline agent board: each agent tab becomes a row under its space, with harness, live status and sub-agent count. The accepted Critters foundation now extends across the primary window chrome; terminal content and fonts stay unchanged.

## What you see

**The window.** A 299 px sidebar on the left (min 44, max 480), a 1 px `border` divider, and the work area on a `canvas` background. The layout pins `{ "light": "paper", "dark": "ink" }`, uses 14×12 terminal padding, hides the system title bar and puts macOS traffic lights at `[12, 16]`.

**Pixel typography and controls.** All owned UI uses bundled Tiny5; tests inspect its actual cmap for every Russian letter including Ё/ё. Pixelify Sans was investigated but rejected for incomplete Cyrillic. Chrome controls use original bitmap glyphs from `pixel-ui.ts`; program/harness logos retain their own artwork. Rounded cards/buttons were replaced by sharp frames. Global settings are not edited.

**The sidebar.** Three copies of `spaces-status`: 46 px `props.chrome: "brand"`, the ordinary Spaces list with weight 1/min 90, and 69 px `props.chrome: "footer"`. The list background is `chrome`.

**Machine cards.** With a known remote, every machine gets a square panel: `machineColor + "0d"` fill, 2 px `machineColor + "55"` border, 8 px between cards, and 4 px horizontal/bottom padding. Saved defaults allocate unused palette slots; manual choices override them. With only this computer there are no machine cards/headers.

**Machine headers.** 58 px high, 4 px vertical margin, 8 px horizontal padding, square `machineColor + "18"` fill. The 50×44 static scene holds a 32 px chosen avatar, tiny stars and ground. Names are 18 px uppercase with full-name tooltips; the 13 px subtitle says `Local/Remote · N spaces`. Settings, add, connection indicator and fold keep their original actions. Login guidance and Copy survive folding; rebuilt machines show Connect. Offline scenes fade to half opacity.

**Space groups and rows.** One square frame wraps each space and all its sessions: 1 px tinted border, 3 px colored left edge, faint tint, and 8 px bottom gap. Active borders are stronger; worktree groups indent 12 px. Rows remain 30 px (28 for worktrees), with 8 px horizontal padding/9 px gap. Avatars are square 22×22 tiles with a 20 px selected glyph; auto letters use Tiny5. Names are 16 px, with the same unusual-only Git tail and aggregate/fold controls.

**Session rows.** 26 px high, 12 px left/8 px right padding, 8 px gap, no rounding. The session section has a tinted top separator and 2 px gaps. A small square leads the harness icons, 16 px label, `+N` descendants and status. Active/settled/hover semantics are unchanged.

**Statuses.** `pixelStatus` is shared by sidebar/tabs/pane headers: rotating pixel pair for working, square `!` for blocked, filled square for done, outlined square for idle. Meanings, colors and sources have not changed; machine rollup remains a later task.

**The rail.** When the sidebar is narrower than 160 px, there are no cards or colored machine strips. Cells are 32 px wide; machine headers keep their 26 px height. With known remotes, a machine icon (with a connection badge) heads each group; otherwise only space cells are shown. Space cells show their number and a status dot. Names, tails and sessions are hidden; machine headers and any displayed new-space row stay clickable.

**The work area.** A 42 px pixel tab bar; active-tab panes keep 8 px padding/gap but use radius 0, 1 px border/2 px accent focus and 32 px always-visible pixel headers. The bottom pixel status bar is 28 px. A hidden 368 px Files/Changes stack remains stock internally, as do picker/settings and core-owned dialogs; no claim of reskinning those surfaces.

## How it behaves

**Space rows.** Click selects the space. Right-click opens this mod's space-only context menu: Rename & appearance, cached-checkout worktree actions and Close space. When checkout information is not ready, Other space actions opens the shipped menu with the same explicit target id. Worktree dialogs and close confirmation remain Herdr's. Drag a row onto another to reorder it inside its machine through `space.move`; the dragged row is dimmed, and the row under the pointer gets the hover background.

**Appearance editing.** The 720×760 pixel dialog combines name/color/avatar, a 32-character SS14 plush gallery, four original critters, letters and all 2276 Material names in five styles (up to 60/page). Machines omit the rename field. Preview and Save/Cancel/Reset stay outside the scroll region. `Default avatar` explains its machine/space fallback and leaves color alone. Style buttons have descriptions and home samples; switching style also changes the selected Material glyph when available.

Save rereads the latest preferences, merges only the clicked entity, and closes the dialog. An edited space name runs `space.rename` with that space's id; an unchanged name is not converted from automatic to explicit. Invalid colors or a missing space keep the editor open with an error. Cancel writes nothing. Reset appearance clears the draft color/avatar, not its name; Save then removes that profile's overrides and releases a pinned space color so automatic assignment can resume. Renaming and appearance persistence are separate host operations, not an atomic cross-core transaction.

**Sessions.** The mod reads `agents()` and `terminals()` once per render. A tab is included when at least one agent in it is not a sub-agent. Its status is the tab's own status, else the most urgent among its agents (`blocked > done > working > idle`). Sub-agents are terminals with a `parent`; they are counted recursively over live terminals and shown only as `+N`, never as rows. A click runs `space.select` and then `tab.select`.

**Labels.** A named tab uses its name. An unnamed tab uses a terminal title that says more than the program's name (but not a bare path or an `@` handle), else the program's name ("Claude Code", "OpenCode"). Two rows with the same label get `· <tab number>`.

**Folding.** Every space with sessions starts expanded. The chevron at the far right (10 px glyph in a 14 px hit box) toggles that space. Folded state is kept in `localStorage` under `spaces.sessions.folded`; a missing entry means expanded. While expanded, the space row hides its harness icons and status so the session rows carry them; while folded, the space row brings back the aggregate harnesses and the most urgent status. A space with no agents has no chevron.

**Agent order.** On every render the mod calls `setAgentOrder` with the agents of the session rows, in row order, so `agent.next` and `agent.prev` walk the same list. Folded spaces are included in that order.

**Worktrees.** Git info comes from the first live terminal's folder. A linked worktree whose repo matches a displayed checkout moves under it; its whole group indents 12 px, with a 28 px header and tree fallback avatar. Worktrees that are not spaces are not listed automatically.

**Git tails.** For each place, the mod runs `git rev-parse --show-toplevel`, `--git-common-dir`, `symbolic-ref -q HEAD` and `rev-list --left-right --count HEAD...@{upstream}`. It hides the branch when it repeats the space name or is `master`/`main`, hides the repo when it repeats the space name or the row is a worktree, and shows ahead/behind only when nonzero. Local repos are refreshed through `watchFolder`; remote ones on a timer. A place outside git simply has no tail.

**Machines.** With a known remote, spaces are grouped in cards by `machine`, local first, then remote names sorted. Each card has a stable colored frame/fill and an 8 px gap from the preceding card. Known machines include offline ones and pending reconnections, not just connected machines. A folded machine hides its spaces, loading and empty rows, but retains login guidance. A rebuilt machine has only its header and Connect action. The machine fold state lives in `localStorage` under `machines.folded`; clicking the header toggles it. Reordering stays inside a machine.

**Colors.** A new automatic space gets the least-used color from ten slots: the six legacy names (`ansi6`, `ansi3`, `ansi4`, `ansi5`, `ansi2`, `ansi1`) and four hex colors (`#2aa8c9`, `#7f9f4a`, `#a0785a`, `#b06ab3`). Explicit space colors are pinned and reserve their colors before automatic duplicates are repaired; two explicit choices may intentionally match. The final map is shared under `space.colors`, understood by the shipped spaces/picker mods. Empty snapshots do not wipe the map.

Machine defaults are stored, not hash-based. On first assignment, local comes first and new remote keys are sorted. Existing valid colors/mascots are reserved before new machines receive free slots, so reordering/restarting or temporarily losing a machine does not change its identity. Duplicate defaults are repaired while free slots exist. Beyond ten saved colors/four mascots slots are reused; manual choices may intentionally repeat. Resolve colors with the single `appearance-model.resolveColor`: hex directly, otherwise MARK/theme, then ansi6.

**Icons.** Default uses a letter, home for `~`, or tree for worktrees; machines use their allocated critter. Explicit choices survive space renaming. One typed `renderAvatar` draws letters, original SVGs, Material codepoints or SS14 PNGs. For a sprite sheet, an overflow-clipped viewport shows the first 32×32 frame at the requested scale; images are not modified or animated. Mascots/scenery never imply status.

**Saved preferences.** Shared `spaces-status.appearance` stays schema v1: `{version:1, machines, spaces, defaults}`. Avatar variants are `letter`, `pixel`, `material` (family/name), and `plush` (catalog-validated id); older choices remain valid. Machines use `local`/`remote:<name>`, spaces use ids. Absent remotes do not lose preferences/defaults. Drafts are overlay-local; unchanged snapshots do not publish again.

## Built from

**Installation.** Use the gallery-style agent flow with the repository URL `https://github.com/Marinadec-kk/marinadec-s-herdr`. Read the target Herdr home's `AGENTS.md`, this recipe and the files, then copy `layouts/main-status.json` and the complete `mods/spaces-status/` folder into that home (`HERDR_APP_HOME`, otherwise `~/.config/herdr-app`). Include the compiled JavaScript, fonts and icons. Resolve name collisions using Herdr's rules, run `herdr-app check` on the installed mod, then select the layout. The checkout is only an installation/update source; the installed copies work independently. `keys.json` is an optional Yazi shortcut to merge separately, keeping the person's other bindings. The README covers manual installation, updates and migration from older symlink installs.

**Layout** — `layouts/main-status.json`, cloned from Herdr's `main` 0.1.15:

```
root (row, canvas, divider 1 border, titlebar none, traffic_lights [12,16],
      theme {light paper, dark ink}, terminal_padding [14,12])
├─ sidebar (column, 299 px, min 44, max 480, chrome, resizable false)
│  ├─ brand (block, 46 px, spaces-status props.chrome=brand, window_drag)
│  ├─ spaces (block, weight 1, min 90, mod spaces-status)
│  └─ sidebar-footer (block, 69 px, spaces-status props.chrome=footer)
└─ work (column, resizable false)
   ├─ tabs (block, 42 px, spaces-status props.chrome=tabs, window_drag)
   ├─ work-body (row, padding 8, gap 8)
   │  ├─ main (tab active, pane: header spaces-status props.chrome=pane 32 top always,
   │  │        background, border 1 border, focus 2 accent, radius 0, gap 8, lone)
   │  └─ panel (column, 368 px, min 280, max 900, hidden)
   │     └─ panel-body (stack, files | changes, active files)
   └─ status (block, 28 px, spaces-status props.chrome=status)
```

**Mod** — `mods/spaces-status/`, cloned from Herdr's `spaces` 0.1.15, `place: none` (the layout places it). `main.ts` is one `View` class, in TypeScript; `main.js`, what Herdr loads, is its `tsc` output:

- `init` seeds state, starts a 15 s `refreshMachines` timer and a 250 ms `checkNew` timer, and reads `machines.folded` / `spaces.sessions.folded` from `localStorage`.
- `render` assigns/repairs space colors through `shared("space.colors")` / `setShared`, then draws machine groups. `narrow()` reads the live sidebar width from `layout()`.
- `appearance-model.ts` contains shared types, validation, one palette/resolver, collision-free default allocation and pinned-space color assignment. `appearance-avatar.ts` is the one avatar renderer. `appearance-editor.ts` implements the editor and space-only context menu as typed controllers.
- Chrome/menu/editor copies return before sidebar initialization; only the actual sidebar starts machine/Git pollers and publishes agent order.
- `pixel-chrome.ts` preserves stock tab wheel/drag, active-tab scrolling, per-space panel memory, pane targets and platform window buttons. `pixel-menu.ts` owns tab/new menus, including cached agent discovery and keyboard navigation. `pixel-ui.ts` shares original bitmap controls/status marks.
- `sessions()` groups agents by tab, filters sub-agents, labels rows and counts live descendants from `terminals().parent`.
- `row()` / `sessionRow()` / `compact()` draw the row forms; `gitTail()` preserves Git tail semantics and `pixelStatus()` shares the status renderer.
- `HOME_GLYPH` / `TREE_GLYPH` give `~` and worktree rows their two fixed icons; every other row takes the first letter; `icon()` draws a program's icon from `programs.json` data.
- `refreshGit()` and `due()` decide when to ask git; local repos are watched with `watchFolder`, remote ones polled.
- The mod calls `run("space.select" | "tab.select" | "space.move" | "space.new" | "app.settings")` and opens the shipped `menu` overlay for right-clicks.
- Data comes from `spaces()`, `agents()`, `terminals()`, `machines()`, `panes()`, `layout()`, `theme()`, `settings()`, `shared()` and `setAgentOrder()`.
- Every live-data read copies the whole list: sidebar `render()` takes one spaces/panes/machines/agents/terminals/settings snapshot and passes it through grouped/ordered/rows. Mouse handlers still reread on their events. No duplicate spaces/colors read or per-ordering machine read remains in the render path.

**Assets.** Two tintable home/tree Material SVGs, four original 12×12 critter SVGs, five local Material fonts and Tiny5 (OFL 1.1). `sync-plushies.mjs` imports 32 unchanged ground sprites from pinned SS14 commit `0d1b13963500df557e5f092c0094b9da83b30ac9`, with original metadata, source hashes and per-asset credits/licenses. Assets retain CC BY-SA 3.0/4.0 or CC0, **not MIT**; the non-commercial vulp set is excluded. Runtime never downloads art/fonts.

Google's five Material icon fonts live in `fonts/` with their Apache license and SHA-256 source manifest. `material-catalog.ts/js` is generated by the development-only `scripts/sync-material-icons.mjs` from Google's pinned `material-design-icons` commit `10ecc14790612ca8fd164e3f4ffe9c16fc50d5b7`; Google Fonts metadata supplies search tags/categories. No network/file reads are needed to browse the bundled catalog at runtime.

**Build.** `main.js` is compiled from `main.ts` with `npm run build` (`package.json` holds only TypeScript as a dev dependency; `main.js` is committed so an install works without one). The `tsconfig.json` repeats the settings Herdr writes into every mod's `jsconfig.json` — `strict` with `strictNullChecks` off (a View assigns its state in `init`, which TypeScript cannot see as definite assignment), ES2022, no DOM lib — and `types/gpui-kit.d.ts` is the declaration file Herdr writes beside every mod, snapshotted from 0.1.15: it declares `gpui-kit`, `gpui-base` and `herdr` whole.

The same build compiles the appearance/catalog helpers beside their sources; commit their generated JS too. `npm run check` also runs `tsconfig.appearance.json` with strict null checks enabled for the new modules. `npm run test` uses Node's built-ins and host mocks to cover persistence/reset/collisions, font integrity and the actual compiled UI handlers, without a running Herdr or external services.

**Dependencies.** Stock Files/Changes, picker/settings/worktree and core dialogs remain in use. A few stock SVG assets remain referenced; shipped modules are never overwritten. The sidebar still runs only ref-reading Git and hc machine discovery/explicit reconnection, not fetch/push/pull.

## Watch out

- **main.js is generated.** Edit `main.ts` and run `npm run build`; never edit `main.js` by hand.
- **The app writes into the mod folder.** On install Herdr drops its own `gpui-kit.d.ts` and `jsconfig.json` beside the mod; `.gitignore` keeps them out of the repository, and the tsconfig includes only `types/`, so the declarations are never doubled.
- **The type snapshot is pinned** to Herdr 0.1.15, like the rest of the mod. A newer Herdr rewrites `gpui-kit.d.ts` (with `herdr` inside) into every mod folder it sees: copy it over `types/gpui-kit.d.ts` when the mod moves up.
- **Version.** API and declaration baseline: Herdr 0.1.15. Current validation target: Herdr 0.1.16 with hc 0.1.21; runtime compatibility on 0.1.15 is not revalidated by a check on 0.1.16. A future Herdr that renames a shipped mod or a field will need a matching edit.
- **Git observation is ref-only.** No `git status`, uncommitted counters, worktree scans or background fetch. Ahead/behind describe the locally known upstream ref, not necessarily the remote server's latest state.
- **Default pools are finite.** There are ten automatic colors and four pixel mascots; repeats are possible past capacity, or when chosen explicitly. Defaults no longer collide just because two names hash alike.
- **Accepted direction.** Critters is the chosen foundation; the user requested a cohesive pixel interface instead of further visual trials. Preserve saved preferences and current functionality; do not restore Compact Pixel/Traveler over it.
- **Updates use copies.** Update both the mod folder and the layout from the repository; `git pull` alone only updates the checkout. When migrating an older symlink installation, remove the link itself and copy the mod into its place. Keep saved appearance and fold state.
- **Font discovery.** New fonts load at app start/on look change. Change theme once and back, or restart Herdr, if newly added font glyphs are missing.
- **The agents block is intentionally absent.** Sessions live inline. Adding an `agents` block back would draw a second list and compete for `setAgentOrder`.
- **State overrides the file.** On a machine that already used `main-status`, `layouts/.state/main-status.json` can override the sidebar width and theme. A fresh install uses the file's 299 px and ink/paper.
- **Colors are local.** `shared("space.colors")` is keyed by space id and lives in that machine's shared state. The same repo on two machines can have different colors; nothing about colors is synced by this repo.
- **Fold state is local.** `spaces.sessions.folded` lives in the mod copy's `localStorage`, so another machine starts with every space expanded.
- **Auto is not a guessed project icon.** User-selected avatars remain until explicitly reset; automatic letters track names, while house/tree follow their structural rules. Shipped picker/tab icons are not replaced by this sidebar's avatar setting.
- **Worktrees need spaces.** The nesting only places existing worktree spaces; it never creates a space per `git worktree`.
- **Sidebar width.** The rail starts below 160 px, read from the live layout, so dragging the divider switches forms without a setting.
- **The panel is hidden.** Files and Changes are in the layout but `hidden: true`; open them from the tab bar as usual. Their remembered width/active child can differ per machine through layout clicks.
- **Theme is pinned.** Change the root `theme` to follow your own look, or use the theme picker, which overrides the layout on that machine.

## Done when

- `npm run check` passes (the TypeScript compiles clean).
- `npm run test` passes, including pinned-color, Save/Cancel/Reset and collision regressions.
- `npm run build` reproduces `main.js` from `main.ts`.
- `herdr-app check mods/spaces-status` passes.
- A fresh copy-based installation passes `herdr-app check` from its installed location, includes the bundled fonts/icons and needs no repository checkout at runtime.
- `herdr-app status` shows `"layout": "main-status"` and `"errors": []`.
- Inspecting the app shows a row under every space that has an agent, harness icons and statuses on those rows, and the chevron at the far right. Any local verification screenshot stays outside the repository; never commit real session data.
- With only this computer there is no machine header or card; a known remote enables machine cards with stable colored frames and fills.
- Folding a machine preserves login guidance; rebuilt, loading and empty machines follow the rules above.
- Clicking a session row switches to its space and tab.
- Folding a space hides its session rows and brings the aggregate harnesses/status back on the space row.
- A worktree space appears under its checkout with the tree avatar, and its sessions are indented one level deeper.
- Dragging the sidebar under 160 px switches to the rail with numbered space cells, status dots, no cards and 26 px machine headers.
- Card colors, edges and text are readable in both ink and paper.
- Space Rename & appearance edits name/color/avatar together; machine settings edits its color/avatar. Both survive reopen and space renaming; Cancel changes nothing.
- Full Material search/categories/styles/pagination work from local assets; a manual color is never auto-rebalanced away.
