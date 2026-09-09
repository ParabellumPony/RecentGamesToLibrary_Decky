// Paste into Steam's SharedJSContext console. Read-only; no patching or file I/O.
(() => {
  const store = globalThis.appStore;
  const report = {
    appStorePresent: !!store,
    initialized: store?.m_bIsInitialized,
    lookupPresent: typeof store?.GetAppOverviewByAppID === 'function',
    appMapPresent: typeof store?.m_mapApps?.values === 'function',
    nativeVisibilityPresent: typeof globalThis.collectionStore?.BIsVisible === 'function',
    apps: 0, games: 0, localGames: 0, shortcuts: 0, unknownLocalState: 0,
  };
  if (report.appMapPresent) {
    for (const app of store.m_mapApps.values()) {
      report.apps++;
      if (app.app_type === 1073741824) report.shortcuts++;
      if (![1, 8].includes(app.app_type)) continue;
      report.games++;
      const local = app.local_per_client_data ?? app.per_client_data?.find((client) => String(client.clientid) === '0');
      if (local?.installed === true) report.localGames++;
      if (typeof local?.installed !== 'boolean') report.unknownLocalState++;
    }
  }
  return report;
})();
