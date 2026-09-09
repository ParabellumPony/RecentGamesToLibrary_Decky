// The small, read-only part of Steam's private API used by this plugin.
// Evidence and exact source revisions: docs/RESEARCH.md.
export interface ClientData {
  clientid?: string | number;
  installed?: boolean;
}

export interface AppOverview {
  appid: number;
  app_type: number;
  display_name?: string;
  sort_as?: string;
  visible_in_game_list?: boolean;
  local_per_client_data?: ClientData;
  per_client_data?: ClientData[];
  rt_last_time_locally_played?: number;
}

export interface SteamCollection {
  id: string;
  displayName: string;
  allApps: readonly AppOverview[];
}

export interface SteamHost {
  SteamClient?: {
    Settings?: { GetCurrentLanguage?(): Promise<string> | string };
  };
  navigator?: { language?: string };
  appStore?: {
    m_bIsInitialized?: boolean;
    CompareSortAs?(a: AppOverview, b: AppOverview): number;
    m_mapApps?: { values(): IterableIterator<AppOverview> };
    GetAppOverviewByAppID?(id: number): AppOverview | null;
  };
  collectionStore?: {
    m_mapCollectionsFromStorage?: { values(): IterableIterator<SteamCollection> };
    collectionsFromStorage?: { values(): IterableIterator<SteamCollection> };
    BIsSystemCollectionId?(id: string): boolean;
    BIsVisible?(app: AppOverview): boolean;
  };
}

export interface Settings {
  enabled: boolean;
  sort: "alphabetical" | "last-played" | "collections";
  includeShortcuts: boolean;
  unlimitedCarousel: boolean;
  customTitle: string;
}

export interface PluginError {
  code: "homeStructure" | "routeType" | "recentsMissing" | "carouselMissing" | "nativeRender" | "unexpected";
  detail?: string;
}

export type CatalogState = "ready" | "loading" | "unsupported";
export interface Catalog {
  state: CatalogState;
  ids: readonly number[];
  collectionNames: readonly string[];
  scanned: number;
  unknown: number;
}

export interface Snapshot extends Catalog {
  settings: Settings;
  patchState: "waiting" | "active" | "unsupported";
  error: PluginError | null;
}

export interface PatchHandle { unpatch(): void }
export type AfterPatch = (
  object: object,
  property: string,
  handler: (args: unknown[], result: unknown) => unknown,
) => PatchHandle;
