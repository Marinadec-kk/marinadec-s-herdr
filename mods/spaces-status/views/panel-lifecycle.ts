import type { AsyncContext, Context } from "gpui-kit";
import { watchFolder } from "herdr";
import { panelLocation } from "./panel-location.js";
import type { Location } from "./panel-location.js";

// A new context gets a new identity, even when navigating A -> B -> A.
export class PanelLifecycle {
  private location: Location | undefined;
  private active: object | undefined;
  private again = false;
  private disposed = false;
  private timer: ReturnType<AsyncContext["timer"]["every"]>;
  private watcher: { root: string; context: Location; pending?: Promise<string[]> & { cancel?: () => void } } | undefined;
  constructor(cx: AsyncContext, private refresh: (cx: Context) => void) {
    this.timer = cx.timer.every(10000, cx => { if (!this.disposed) this.refresh(cx); });
  }
  get loading(): boolean { return Boolean(this.active); }
  sync(): Location {
    const next = panelLocation();
    if (this.location?.key !== next.key) {
      this.stopWatch(); this.active = undefined; this.again = false; this.location = next;
    }
    return this.location!;
  }
  current(context: Location): boolean {
    return !this.disposed && this.location === context && panelLocation().key === context.key;
  }
  begin(context: Location): object | undefined {
    if (!this.current(context)) return;
    if (this.active) { this.again = true; return; }
    return this.active = {};
  }
  finish(request: object, cx: Context): void {
    if (this.active !== request || this.disposed) return;
    this.active = undefined;
    if (this.again) { this.again = false; this.refresh(cx); }
    cx.notify();
  }
  watch(root: string, context: Location, cx: Context): void {
    if (context.on || !this.current(context) || this.watcher?.root === root && this.watcher.context === context) return;
    this.stopWatch();
    const watcher = this.watcher = { root, context } as NonNullable<PanelLifecycle["watcher"]>;
    cx.spawn(async cx => {
      try {
        while (this.watcher === watcher && this.current(context)) {
          watcher.pending = watchFolder(root);
          await watcher.pending;
          if (this.watcher === watcher && this.current(context)) this.refresh(cx);
        }
      } catch { /* Polling remains available if watching fails. */ }
      finally { if (this.watcher === watcher) this.stopWatch(); }
    });
  }
  private stopWatch(): void {
    const watcher = this.watcher; this.watcher = undefined;
    watcher?.pending?.cancel?.();
  }
  close(): void {
    this.disposed = true; this.active = undefined; this.again = false;
    this.timer?.cancel(); this.stopWatch();
  }
}

// File/diff selection can also go A -> B -> A inside a single panel context.
export class LatestRequest {
  private version = 0;
  next(): () => boolean { const version = ++this.version; return () => this.version === version; }
  cancel(): void { this.version++; }
}
