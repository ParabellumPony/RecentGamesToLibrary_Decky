import type { AppOverview, Catalog, Settings, SteamHost } from "./types.js";

export const GAME = 1;
export const DEMO = 8;
export const SHORTCUT = 1073741824;
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function localInstalled(app: AppOverview): boolean | undefined {
  // `installed`, `selected_per_client_data`, disk size and playtime can all
  // refer to another computer or to a game that has already been removed.
  const local = app.local_per_client_data ?? app.per_client_data?.find(
    (client) => client.clientid === "0" || client.clientid === 0,
  );
  return typeof local?.installed === "boolean" ? local.installed : undefined;
}

export function readCatalog(host: SteamHost, settings: Settings): Catalog {
  const empty = { ids: [], collectionNames: [], scanned: 0, unknown: 0 };
  const store = host.appStore;
  if (!store || store.m_bIsInitialized === false) return { ...empty, state: "loading" };
  if (typeof store.m_mapApps?.values !== "function" ||
      typeof store.GetAppOverviewByAppID !== "function") {
    return { ...empty, state: "unsupported" };
  }

  const games = new Map<number, AppOverview>();
  const collectionNames: string[] = [];
  const collectionIds: number[] = [];
  let scanned = 0;
  let unknown = 0;
  const compare = (a: AppOverview, b: AppOverview) =>
    (store.CompareSortAs ? store.CompareSortAs(a, b) :
      collator.compare(a.sort_as || a.display_name || "", b.sort_as || b.display_name || "")) || a.appid - b.appid;
  const visible = (app: AppOverview) => {
    scanned++;
    return app && Number.isInteger(app.appid) && app.appid > 0 && app.appid <= 0xffffffff &&
      (app.app_type === GAME || app.app_type === DEMO ||
        (settings.includeShortcuts && app.app_type === SHORTCUT)) &&
      app.visible_in_game_list !== false &&
      (!host.collectionStore?.BIsVisible || host.collectionStore.BIsVisible(app));
  };
  try {
    if (settings.sort === "collections") {
      const collections = host.collectionStore;
      // userCollections also injects installed/uncategorized shelves. Read only
      // stored user collections; allApps includes Steam's dynamic membership.
      const raw = collections?.m_mapCollectionsFromStorage ?? collections?.collectionsFromStorage;
      if (!raw) return { ...empty, state: "loading" };
      if (typeof raw.values !== "function" || typeof collections?.BIsSystemCollectionId !== "function") {
        return { ...empty, state: "unsupported" };
      }
      const groups = [...raw.values()].filter((group) => !collections.BIsSystemCollectionId!(group.id))
        .sort((a, b) => collator.compare(a.displayName, b.displayName) || a.id.localeCompare(b.id));
      for (const group of groups) {
        if (typeof group.displayName !== "string" || !Array.isArray(group.allApps)) {
          return { ...empty, state: "unsupported" };
        }
        for (const app of group.allApps.filter(visible).sort(compare)) {
          collectionIds.push(app.appid);
          collectionNames.push(group.displayName);
        }
      }
      return { state: "ready", ids: collectionIds, collectionNames, scanned, unknown };
    }
    for (const app of store.m_mapApps.values()) {
      if (!visible(app)) continue;
      const installed = localInstalled(app);
      if (installed === undefined) unknown++;
      if (installed === true) games.set(app.appid, app);
    }
  } catch {
    // Never publish a partially read library as a complete list.
    return { ...empty, scanned, unknown, state: "unsupported" };
  }

  const sorted = [...games.values()].sort((a, b) => {
    if (settings.sort === "last-played") {
      const time = (app: AppOverview) => Number.isFinite(app.rt_last_time_locally_played)
        ? app.rt_last_time_locally_played! : 0;
      const difference = time(b) - time(a);
      if (difference) return difference;
    }
    return compare(a, b);
  });
  return { state: "ready", ids: sorted.map((app) => app.appid), collectionNames, scanned, unknown };
}
