import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const base = process.env.OPENCODE_PREVIEW_TMP ?? "/tmp/opencode";
mkdirSync(base, { recursive: true });
const home = mkdtempSync(join(base, "herdr-status-review-"));
const mod = join(home, "mods", "status-review");
cpSync(join(root, "mods", "spaces-status"), mod, { recursive: true });

// Bundle the existing UI helpers/assets inside this mod, never import another
// installed mod's code. Only the isolated copy has its asset prefix rewritten.
function rewrite(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) rewrite(path);
    else if (entry.name.endsWith(".js"))
      writeFileSync(path, readFileSync(path, "utf8").replaceAll("mods/spaces-status/", "mods/status-review/"));
  }
}
rewrite(mod);
for (const name of ["main.js", "status.js", "tree.js", "fixtures.js", "mod.json",
  "status-working.svg", "status-blocked.svg", "status-done.svg", "status-idle.svg"])
  cpSync(join(root, "preview", "status-review", name), join(mod, name));
mkdirSync(join(home, "layouts"), { recursive: true });
writeFileSync(join(home, "layouts", "status-review.json"), JSON.stringify({
  id: "status-review", type: "block", theme: "ink",
  font: "Liberation Mono", font_size: 14, ui_font: "Liberation Sans",
  content: { mod: "status-review", props: { railWidth: 44, wideWidth: 299, selected: "atlas" } },
}, null, 2) + "\n");
writeFileSync(join(home, "shared.json"), JSON.stringify({ layout: "status-review", "frame.welcomed": "skipped" }) + "\n");
writeFileSync(join(home, "settings.json"), JSON.stringify({
  zoom: 1, sounds: { enabled: false }, telemetry: false,
}) + "\n");
writeFileSync(join(home, "window.json"), JSON.stringify({ state: "windowed", bounds: [80, 60, 1240, 930] }) + "\n");

const env = { ...process.env, HERDR_APP_HOME: resolve(home), HERDR_TELEMETRY: "0" };
if (process.platform === "linux" && !process.argv.includes("--window")) {
  // GPUI's ZED_HEADLESS validates layout but does not render screenshot pixels.
  // A private virtual compositor exercises the normal native renderer offscreen.
  delete env.ZED_HEADLESS;
  delete env.DISPLAY;
  delete env.WAYLAND_DISPLAY;
  for (const [key, dir] of [
    ["XDG_CONFIG_HOME", "xdg-config"], ["XDG_CACHE_HOME", "xdg-cache"],
    ["XDG_DATA_HOME", "xdg-data"], ["XDG_STATE_HOME", "xdg-state"], ["XDG_RUNTIME_DIR", "runtime"],
  ]) {
    env[key] = join(home, dir);
    mkdirSync(env[key], { recursive: true, mode: 0o700 });
  }
  writeFileSync(join(env.XDG_CONFIG_HOME, "kwinrc"), "[Wayland]\nInputMethod=\n");
  // No service directories: this bus cannot activate desktop portals, wallets
  // or other services belonging to the person's real desktop session.
  writeFileSync(join(home, "review-bus.conf"), `<busconfig>
  <type>session</type><listen>unix:tmpdir=${env.XDG_RUNTIME_DIR}</listen><auth>EXTERNAL</auth>
  <policy context="default"><allow own="*"/><allow send_destination="*"/><allow receive_sender="*"/></policy>
</busconfig>\n`);
  env.LIBGL_ALWAYS_SOFTWARE = "1";
  env.KWIN_COMPOSE = "Q";
  const softwareVulkan = "/usr/share/vulkan/icd.d/lvp_icd.x86_64.json";
  if (existsSync(softwareVulkan)) env.VK_ICD_FILENAMES = softwareVulkan;
  writeFileSync(join(home, "run-herdr.sh"), "#!/bin/sh\nunset DISPLAY ZED_HEADLESS\nexec herdr-app\n", { mode: 0o700 });
}
console.log(`Preview home: ${home}`);
const check = spawnSync("herdr-app", ["check", mod], { env, stdio: "inherit" });
if (check.status !== 0) process.exit(check.status ?? 1);
if (!process.argv.includes("--prepare-only")) {
  const offscreen = process.platform === "linux" && !process.argv.includes("--window");
  const app = offscreen
    ? spawn("dbus-run-session", [`--config-file=${join(home, "review-bus.conf")}`, "--", "kwin_wayland", "--virtual", "--width", "1440", "--height", "1040",
      "--scale", "1", "--output-count", "1", "--no-lockscreen", "--no-global-shortcuts", "--no-kactivities",
      "--socket", "wayland-review", "--exit-with-session", join(home, "run-herdr.sh")], { env, stdio: "inherit" })
    : spawn("herdr-app", [], { env, stdio: "inherit" });
  app.on("error", error => { console.error(error.message); process.exitCode = 1; });
  app.on("exit", code => { process.exitCode = code ?? 1; });
}
