// SSH discovery and connection flow adapted from Herdr 0.1.16 (Apache-2.0).
import { div } from "gpui-kit";
import { h_flex, v_flex, InputState, ScrollHandle } from "gpui-base";
import { hc, exec, home, readTextFile, theme, closeOverlay } from "herdr";
import { button, secondary, textInput } from "../ui/controls.js";
import { dialogFrame, dialogFocus, dialogError, scrollBody } from "../ui/surfaces.js";
import { pixelIcon, pixelStatus } from "../pixel-ui.js";
import { tint } from "../appearance-colors.js";
import { UI, SPACING } from "../ui/tokens.js";
import { loadMachines, machineError } from "../data/machines.js";
const shellArg = (target) => /^[a-z0-9_@%+=:,./-]+$/i.test(target) ? target : "'" + target.replace(/'/g, "'\\''") + "'";
async function includeFiles(value) {
    const paths = (value.match(/"[^"]*"|\S+/g) ?? []).map(p => p.replace(/^"|"$/g, ""))
        .map(p => p.startsWith("~/") ? `${home()}/${p.slice(2)}` : p.startsWith("/") || /^[a-z]:[\\/]/i.test(p) ? p : `${home()}/.ssh/${p}`);
    const files = [];
    for (const p of paths) {
        if (!/[*?[]/.test(p)) {
            files.push(p);
            continue;
        }
        const glob = /^[a-z]:/i.test(p) ? p.replace(/\\/g, "/") : p;
        const r = await exec("sh", ["-c", 'IFS=; for p in "$@"; do for f in $p; do [ -f "$f" ] && printf "%s\\n" "$f"; done; done', "sh", glob]).catch(() => null);
        files.push(...(r?.stdout ?? "").split("\n").filter(Boolean));
    }
    return files;
}
async function parseConfig(text, hosts = [], depth = 0) {
    let current = null;
    for (const raw of (text ?? "").split("\n")) {
        const match = raw.trim().match(/^([^\s#=]+)\s*=?\s*(.*)$/);
        if (!match)
            continue;
        const [key, value] = [match[1].toLowerCase(), match[2].trim()];
        if (key === "host" || key === "match") {
            const names = key === "host" ? value.split(/\s+/).filter(h => h && !/[*?!]/.test(h)
                && !hosts.some(x => x.alias === h || x.aliases.includes(h))) : [];
            current = names.length ? { alias: names[0], aliases: names.slice(1), hostname: null, user: null } : null;
            if (current)
                hosts.push(current);
        }
        else if (key === "include" && depth < 16) {
            for (const file of await includeFiles(value))
                await parseConfig(await readTextFile(file).catch(() => null), hosts, depth + 1);
        }
        else if (current && key === "hostname")
            current.hostname = value;
        else if (current && key === "user")
            current.user = value;
    }
    return hosts;
}
export class MachineAdd {
    constructor(overlay, cx) {
        this.overlay = overlay;
        this.hosts = null;
        this.added = [];
        this.state = {};
        this.pending = new Set();
        this.refreshing = false;
        this.input = InputState.new({ placeholder: "user@host" });
        this.typed = "";
        this.scroll = ScrollHandle.new();
        this.macs = {};
        this.opened = new Set();
        this.copied = "";
        this.error = "";
        this.handle = dialogFocus(cx, this.input);
        this.input.on("change", (_e, cx) => { this.typed = this.input.value(); cx.notify(); });
        this.input.on("submit", (_e, cx) => this.add(this.typed, cx));
        cx.spawn(async (cx) => {
            try {
                this.hosts = await parseConfig(await readTextFile(`${home()}/.ssh/config`).catch(() => null));
                await this.refresh();
            }
            catch (error) {
                this.error = String(error);
                this.hosts = [];
            }
            cx.notify();
        });
        cx.timer.every(3000, cx => {
            if ((!this.pending.size && !this.added.length) || this.refreshing)
                return;
            this.refreshing = true;
            cx.spawn(async (cx) => {
                try {
                    await this.refresh();
                }
                finally {
                    this.refreshing = false;
                    cx.notify();
                }
            });
        });
    }
    find(target) {
        return this.added.find(m => m.name === target || m.target === target || m.host === target);
    }
    async refresh() {
        this.added = await loadMachines().catch(() => []);
        for (const target of this.pending) {
            if (!this.find(target))
                continue;
            this.pending.delete(target);
            delete this.state[target];
            if (this.typed.trim() === target) {
                this.input.set_value("");
                this.typed = "";
            }
            await this.checkMac(target);
        }
    }
    async checkMac(target) {
        const machine = this.find(target);
        if (!machine)
            return;
        const result = await exec("sh", ["-c", 'uname; command -v herdr-core || echo "$HOME/.local/bin/herdr-core"'], { on: machine.name }).catch(() => null);
        const [os, core] = (result?.stdout ?? "").trim().split("\n");
        if (os === "Darwin")
            this.macs[target] = { name: machine.name, core: core || "~/.local/bin/herdr-core" };
    }
    add(raw, cx) {
        const target = raw.trim();
        if (!target || this.state[target] === "adding" || this.find(target))
            return;
        this.pending.delete(target);
        this.state[target] = "adding";
        cx.notify();
        cx.spawn(async (cx) => {
            const result = await hc(["machine", "add", target, "--json"]).catch(e => ({ code: 1, stderr: String(e), stdout: "" }));
            if (result.code === 0) {
                delete this.state[target];
                if (this.typed.trim() === target) {
                    this.input.set_value("");
                    this.typed = "";
                }
                await this.refresh();
                await this.checkMac(target);
            }
            else {
                const { message, kind } = machineError(result, "The machine did not answer.");
                if (["hc_missing", "incompatible", "login_needed", "auth_failed", "host_key"].includes(kind)
                    || /password|passphrase|host key|permission denied|login/i.test(message)) {
                    this.pending.add(target);
                    this.state[target] = `This connection needs an answer in a terminal (password, host key or core installation). Run: hc machine add ${shellArg(target)}`;
                }
                else
                    this.state[target] = message;
            }
            await this.refresh();
            cx.notify();
        });
    }
    copy(t, id, command) {
        return button(t, id, this.copied === command ? "Copied" : "Copy", cx => {
            cx.write_to_clipboard(command);
            this.copied = command;
            cx.notify();
        });
    }
    message(t, target) {
        return v_flex().gap(SPACING.row.gap).p(SPACING.row.inset).child(secondary(t, this.state[target]).text_color(t.blocked))
            .when(this.pending.has(target), el => el.child(this.copy(t, `ma-copy-${target}`, `hc machine add ${shellArg(target)}`)));
    }
    row(t, target, label, detail) {
        const machine = this.find(target), state = this.state[target], mac = this.macs[target];
        const card = () => v_flex().p(SPACING.dialog.gap).gap(SPACING.row.gap).border(UI.stroke).border_color(tint(t.blocked, t.popover, .4)).bg(tint(t.blocked, t.popover, .06));
        const command = `sudo loginctl enable-linger -- ${shellArg(machine?.logout_linger_user ?? "<user>")}`;
        return v_flex().flex_none().gap(SPACING.row.gap)
            .child(h_flex().h(44).px(SPACING.row.inset).gap(SPACING.row.gap).items_center().child(pixelIcon("server", t.muted))
            .child(v_flex().flex_1().min_w(0).child(div().truncate().child(label)).child(secondary(t, detail).truncate()))
            .child(machine ? secondary(t, "Added").text_color(t.ansi2) : state === "adding"
            ? h_flex().gap(SPACING.row.gap).items_center().child(pixelStatus(t, "working")).child(secondary(t, "Connecting…"))
            : button(t, `ma-add-${target}`, "Add", cx => this.add(target, cx))))
            .when(Boolean(state && state !== "adding"), el => el.child(this.message(t, target)))
            .when(Boolean(mac), el => el.child(card()
            .child(div().font_semibold().child(`${mac.name} is a Mac: allow its folders once`))
            .child(secondary(t, "macOS asks on the Mac’s screen before reading Desktop, Documents or Downloads. To allow these folders, add herdr-core in Full Disk Access:"))
            .child(secondary(t, mac.core))
            .child(button(t, `ma-mac-${target}`, `Open settings on ${mac.name}`, cx => {
            cx.spawn(async (cx) => {
                await exec("open", ["x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"], { on: mac.name }).catch(() => null);
                this.opened.add(target);
                cx.notify();
            });
        }))
            .when(this.opened.has(target), el => el.child(secondary(t, "Opened on the Mac’s screen.")))))
            .when(machine?.keeps_running_after_logout === false, el => el.child(card()
            .child(div().font_semibold().child(`Agents on ${machine.name} stop when you disconnect`))
            .child(secondary(t, "The server ends programs after the last login closes. An administrator can enable lingering:"))
            .child(secondary(t, command)).child(this.copy(t, `ma-logout-copy-${machine.name}`, command))));
    }
    render() {
        const t = theme(), close = () => closeOverlay(this.overlay), target = this.typed.trim();
        return dialogFrame(t, "machine-add", "Add a machine", this.handle, close, "ma-close")
            .child(scrollBody("ma-hosts", this.scroll)
            .child(secondary(t, this.hosts === null ? "Reading ~/.ssh/config…" : this.hosts.length ? "SSH hosts" : "Your SSH config lists no hosts."))
            .children((this.hosts ?? []).filter(h => !this.find(h.alias)).map(h => this.row(t, h.alias, h.alias, [h.user, h.hostname].filter(Boolean).join("@") || h.aliases.join(", "))))
            .children(this.added.map(m => this.row(t, m.target, m.name, m.target)))
            .when(Boolean(this.error), el => el.child(dialogError(t, this.error))))
            .child(h_flex().flex_none().gap(SPACING.control.gap).child(textInput(t, this.input).flex_1().min_w(0))
            .child(button(t, "ma-add-typed", "Add", cx => this.add(target, cx), { selected: true, disabled: !target || this.state[target] === "adding" || Boolean(this.find(target)) })))
            .when(Boolean(target && this.state[target]), el => el.child(this.message(t, target)));
    }
}
