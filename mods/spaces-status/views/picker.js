import { div } from "gpui-kit";
import { h_flex, v_flex, InputState, ScrollHandle } from "gpui-base";
import { agents, spaces, panes, terminals, hc, theme, shared, settings, closeOverlay, run } from "herdr";
import { APPEARANCE_KEY, readAppearance, record } from "../appearance-model.js";
import { renderAvatar } from "../appearance-avatar.js";
import { identitySnapshot } from "../presentation/identity.js";
import { machineLabel, tabLabel, tabLead, spaceFolder } from "../presentation/labels.js";
import { STATUS_RANK, statusWord } from "../presentation/status.js";
import { dialog, dialogHeader } from "../ui/surfaces.js";
import { actionRow, textInput, shortcut } from "../ui/controls.js";
import { entityRow, rowEnd } from "../ui/rows.js";
import { pixelIcon, pixelStatus, programIcon } from "../pixel-ui.js";
import { closeTab } from "../overlays.js";
export class Picker {
    constructor(overlay, cx) {
        this.overlay = overlay;
        this.input = InputState.new({ placeholder: "Find a space, tab or agent…" });
        this.scroll = ScrollHandle.new();
        this.query = "";
        this.earlier = false;
        this.remotes = [];
        this.reveal = true;
        this.handle = cx.focus_handle();
        this.handle.focus();
        this.input.focus();
        this.input.on("change", (_e, cx) => {
            this.query = this.input.value().trim().toLowerCase();
            this.selected = undefined;
            this.reveal = true;
            cx.notify();
        });
        this.input.on("submit", (_e, cx) => this.choose(this.rows().find(r => r.id === this.selected), cx));
        cx.spawn(async (cx) => {
            try {
                const result = await hc(["machine", "ls", "--json"]);
                const list = record(JSON.parse(result.stdout)).machines;
                if (result.code === 0 && Array.isArray(list))
                    this.remotes = list.map(record)
                        .filter(m => m.state === "connected" && !m.temporary && typeof m.name === "string")
                        .map(m => m.name);
            }
            catch { /* Existing spaces still provide navigation when discovery is unavailable. */ }
            cx.notify();
        });
    }
    rows() {
        const all = agents(), ps = panes(), live = terminals().filter(t => t.state === "live");
        const descendants = (mine) => {
            const roots = new Set(mine.map(a => a.address)), seen = new Set(roots);
            const visit = (id) => {
                for (const child of live.filter(t => t.parent === id)) {
                    if (seen.has(child.address))
                        continue;
                    seen.add(child.address);
                    visit(child.address);
                }
            };
            roots.forEach(visit);
            return seen.size - roots.size;
        };
        const groups = spaces().map(space => {
            const tabs = space.tabs.map((tab) => {
                const mine = all.filter(a => a.tab === tab.id), lead = tabLead(tab.id, ps, mine);
                return { kind: "tab", id: `pk-${tab.id}`, space, tab, label: tabLabel(tab, lead), program: lead?.program, team: descendants(mine) };
            }).filter(row => !this.query || [space.name, row.label, row.tab.name, machineLabel(space.machine), spaceFolder(space, ps),
                ...all.filter(a => a.tab === row.tab.id).map(a => `${a.program?.name ?? ""} ${a.title}`)].join(" ").toLowerCase().includes(this.query));
            return { space, tabs };
        }).filter(g => g.tabs.length);
        const busy = groups.filter(g => g.space.status || g.space.active)
            .sort((a, b) => (b.space.status ? STATUS_RANK[b.space.status] : 0) - (a.space.status ? STATUS_RANK[a.space.status] : 0));
        const quiet = groups.filter(g => !g.space.status && !g.space.active), out = [];
        const add = (g) => {
            out.push({ kind: "head", id: `pk-head-${g.space.id}`, space: g.space }, ...g.tabs);
        };
        busy.forEach(add);
        if (quiet.length) {
            out.push({ kind: "earlier", id: "pk-earlier", count: quiet.length });
            if (this.earlier || this.query)
                quiet.forEach(add);
        }
        out.push({ kind: "new", id: "pk-new" }, { kind: "machine", id: "pk-space-local", machine: null }, ...this.remotes.map((machine) => ({ kind: "machine", id: `pk-space-${machine}`, machine })));
        return out;
    }
    choose(row, cx) {
        if (!row || row.kind === "head")
            return;
        if (row.kind === "earlier") {
            this.earlier = !this.earlier;
            this.selected = row.id;
            this.reveal = true;
            cx.notify();
            return;
        }
        closeOverlay(this.overlay);
        if (row.kind === "tab") {
            run("space.select", { id: row.space.id });
            run("tab.select", { id: row.tab.id });
        }
        else if (row.kind === "new")
            run("tab.new");
        else
            run("space.new", { machine: row.machine ?? "" });
    }
    render() {
        const t = theme(), rows = this.rows(), pickable = rows.filter(r => r.kind !== "head");
        const identities = identitySnapshot(readAppearance(shared(APPEARANCE_KEY)), spaces(), shared("space.colors"), t, settings().dark !== false);
        this.selected = pickable.find(r => r.id === this.selected)?.id
            ?? pickable.find(r => r.kind === "tab" && r.space.active && r.tab.active)?.id ?? pickable[0]?.id;
        const reveal = () => { const at = rows.findIndex(r => r.id === this.selected); if (at >= 0)
            this.scroll.scroll_to_item(at); };
        if (this.reveal) {
            reveal();
            this.reveal = false;
        }
        return dialog(t, "picker").track_focus(this.handle)
            .on_key_down((event, cx) => {
            const at = pickable.findIndex(r => r.id === this.selected), row = pickable[at];
            if (event.key === "escape")
                closeOverlay(this.overlay);
            else if (event.key === "down" || event.key === "up") {
                if (pickable.length)
                    this.selected = pickable[(at + (event.key === "down" ? 1 : pickable.length - 1)) % pickable.length].id;
                this.reveal = true;
            }
            else if (event.key === "d" && event.modifiers.control && row?.kind === "tab") {
                closeOverlay(this.overlay);
                closeTab(row.tab.id);
            }
            else
                return;
            cx.stop_propagation();
            cx.notify();
        })
            .child(dialogHeader(t, "Go to…", () => closeOverlay(this.overlay), "picker-close"))
            .child(textInput(t, this.input).id("picker-input"))
            .child(v_flex().id("pk-list").flex_1().min_h(0).overflow_y_scrollbar().track_scroll(this.scroll).on_size_change(reveal)
            .children(rows.map(row => {
            if (row.kind === "head") {
                const identity = identities.space(row.space.id), machine = identities.machine(row.space.machine);
                return entityRow(t, row.space.name, renderAvatar(identity.avatar, 20, identity.color, row.space.name), h_flex().gap(6).items_center().child(renderAvatar(machine.avatar, 18, machine.color, machineLabel(row.space.machine)))
                    .child(shortcut(t, machineLabel(row.space.machine)))).id(row.id).h(36).px(8).flex_none().font_semibold();
            }
            const label = row.kind === "tab" ? row.label : row.kind === "earlier" ? `${row.count} quiet spaces`
                : row.kind === "new" ? "New tab" : `New space on ${machineLabel(row.machine)}`;
            const el = actionRow(t, row.id, label, cx => this.choose(row, cx), { selected: row.id === this.selected });
            if (row.kind === "tab")
                return el
                    .child(programIcon(row.program, 14, t.muted) ?? pixelIcon("terminal", t.muted))
                    .child(div().flex_1().min_w(0).truncate().text_color(t.foreground)
                    .when(row.space.active && row.tab.active, el => el.font_semibold()).tooltip(label).child(label))
                    .when(row.team > 0, el => el.child(shortcut(t, `+${row.team}`)))
                    .when(row.tab.status === "blocked" || row.tab.status === "done", el => el.child(shortcut(t, statusWord(row.tab.status))))
                    .child(rowEnd().children(row.tab.status ? [pixelStatus(t, row.tab.status)] : []));
            return el.child(pixelIcon(row.kind === "earlier" ? this.earlier || this.query ? "down" : "right" : "plus", t.muted)).child(label);
        })))
            .child(shortcut(t, "↑↓ Choose · Enter Open · Ctrl+D Close tab"));
    }
}
