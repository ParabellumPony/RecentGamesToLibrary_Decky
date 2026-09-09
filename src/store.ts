import { readCatalog } from "./catalog.js";
import type { PluginError, Settings, Snapshot, SteamHost } from "./types.js";

export const SETTINGS_KEY = "RecentGamesToLibrary:settings:v1";
export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  sort: "alphabetical",
  includeShortcuts: false,
  unlimitedCarousel: false,
  customTitle: "",
};

export function parseSettings(raw: string | null): Settings {
  try {
    const value = JSON.parse(raw ?? "null");
    return {
      enabled: typeof value?.enabled === "boolean" ? value.enabled : true,
      sort: (value?.sort === "last-played" || value?.sort === "collections") ? value.sort : "alphabetical",
      includeShortcuts: value?.includeShortcuts === true,
      unlimitedCarousel: value?.unlimitedCarousel === true,
      customTitle: typeof value?.customTitle === "string" ? value.customTitle.replace(/[\r\n\t]/g, " ").slice(0, 120) : "",
    };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

export class LibraryStore {
  private snapshot: Snapshot;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private pendingReport: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;

  constructor(
    private readonly host: () => SteamHost,
    private readonly storage?: Pick<Storage, "getItem" | "setItem">,
  ) {
    let settings = { ...DEFAULT_SETTINGS };
    try { settings = parseSettings(storage?.getItem(SETTINGS_KEY) ?? null); } catch { /* storage disabled */ }
    this.snapshot = {
      settings, state: "loading", ids: [], collectionNames: [], scanned: 0, unknown: 0,
      patchState: "waiting", error: null,
    };
  }

  getSnapshot = (): Snapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private publish(next: Snapshot): void {
    if (JSON.stringify(next) === JSON.stringify(this.snapshot)) return;
    if (next.ids.length === this.snapshot.ids.length &&
        next.ids.every((id, index) => id === this.snapshot.ids[index])) {
      next.ids = this.snapshot.ids;
    }
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }

  start(): void {
    if (this.disposed || this.timer !== undefined) return;
    this.refresh();
    // A small read-only poll avoids taking over Steam's single native
    // RegisterForAppOverviewChanges callback. It also retries cold boot,
    // account changes, resume, SD removal and API readiness without leaks.
    this.timer = setInterval(this.refresh, 2000);
  }

  refresh = (): void => {
    if (this.disposed) return;
    this.publish({ ...this.snapshot, ...readCatalog(this.host(), this.snapshot.settings) });
  };

  configure(change: Partial<Settings>): void {
    if (this.disposed) return;
    const settings = parseSettings(JSON.stringify({ ...this.snapshot.settings, ...change }));
    try { this.storage?.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* session settings still work */ }
    const catalogChanged = settings.sort !== this.snapshot.settings.sort ||
      settings.includeShortcuts !== this.snapshot.settings.includeShortcuts ||
      settings.enabled !== this.snapshot.settings.enabled;
    // Typing a title must not sort the whole library
    // on every keystroke. The normal poll still updates installation changes.
    this.publish({ ...this.snapshot, settings,
      ...(catalogChanged ? readCatalog(this.host(), settings) : {}),
    });
  }

  report(patchState: Snapshot["patchState"], error: PluginError | null = null): void {
    // Patch callbacks run during native React rendering. Notify our panel
    // on the next task, never by setState during someone else's render.
    if (this.disposed || (patchState === this.snapshot.patchState &&
        JSON.stringify(error) === JSON.stringify(this.snapshot.error))) return;
    if (this.pendingReport !== undefined) clearTimeout(this.pendingReport);
    this.pendingReport = setTimeout(() => {
      this.pendingReport = undefined;
      if (!this.disposed) this.publish({ ...this.snapshot, patchState, error });
    }, 0);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    clearInterval(this.timer);
    clearTimeout(this.pendingReport);
    // Already mounted adapters must restore their original tree too.
    this.publish({ ...this.snapshot, settings: { ...this.snapshot.settings, enabled: false } });
    this.listeners.clear();
  }
}
