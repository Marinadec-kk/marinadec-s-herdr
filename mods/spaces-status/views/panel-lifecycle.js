import { watchFolder } from "herdr";
import { panelLocation } from "./panel-location.js";
// A new context gets a new identity, even when navigating A -> B -> A.
export class PanelLifecycle {
    constructor(cx, refresh) {
        this.refresh = refresh;
        this.again = false;
        this.disposed = false;
        this.timer = cx.timer.every(10000, cx => { if (!this.disposed)
            this.refresh(cx); });
    }
    get loading() { return Boolean(this.active); }
    sync() {
        const next = panelLocation();
        if (this.location?.key !== next.key) {
            this.stopWatch();
            this.active = undefined;
            this.again = false;
            this.location = next;
        }
        return this.location;
    }
    current(context) {
        return !this.disposed && this.location === context && panelLocation().key === context.key;
    }
    begin(context) {
        if (!this.current(context))
            return;
        if (this.active) {
            this.again = true;
            return;
        }
        return this.active = {};
    }
    finish(request, cx) {
        if (this.active !== request || this.disposed)
            return;
        this.active = undefined;
        if (this.again) {
            this.again = false;
            this.refresh(cx);
        }
        cx.notify();
    }
    watch(root, context, cx) {
        if (context.on || !this.current(context) || this.watcher?.root === root && this.watcher.context === context)
            return;
        this.stopWatch();
        const watcher = this.watcher = { root, context };
        cx.spawn(async (cx) => {
            try {
                while (this.watcher === watcher && this.current(context)) {
                    watcher.pending = watchFolder(root);
                    await watcher.pending;
                    if (this.watcher === watcher && this.current(context))
                        this.refresh(cx);
                }
            }
            catch { /* Polling remains available if watching fails. */ }
            finally {
                if (this.watcher === watcher)
                    this.stopWatch();
            }
        });
    }
    stopWatch() {
        const watcher = this.watcher;
        this.watcher = undefined;
        watcher?.pending?.cancel?.();
    }
    close() {
        this.disposed = true;
        this.active = undefined;
        this.again = false;
        this.timer?.cancel();
        this.stopWatch();
    }
}
// File/diff selection can also go A -> B -> A inside a single panel context.
export class LatestRequest {
    constructor() {
        this.version = 0;
    }
    next() { const version = ++this.version; return () => this.version === version; }
    cancel() { this.version++; }
}
