import test from 'node:test';
import assert from 'node:assert/strict';
import { readCatalog, localInstalled, SHORTCUT } from '../.cache/test/catalog.js';
import { DEFAULT_SETTINGS, LibraryStore, parseSettings } from '../.cache/test/store.js';
import { carouselGames } from '../.cache/test/carousel.js';

const app = (appid, extra = {}) => ({
  appid, app_type: 1, display_name: `Game ${appid}`, visible_in_game_list: true,
  local_per_client_data: { clientid: '0', installed: true }, ...extra,
});
function host(apps) {
  const m_mapApps = new Map(apps.map((app) => [app.appid, app]));
  return { appStore: {
    m_bIsInitialized: true, m_mapApps,
    GetAppOverviewByAppID: (id) => m_mapApps.get(id),
  } };
}

test('remote installation, purchase, play history and disk size never count as local installation', () => {
  for (const local of [undefined, { clientid: '0', installed: false }]) {
    const candidate = app(1, {
      local_per_client_data: local,
      installed: true, size_on_disk: '100000000', rt_last_time_locally_played: 100,
      most_available_per_client_data: { installed: true },
      selected_per_client_data: { installed: true },
      per_client_data: [{ clientid: '123456', installed: true }],
    });
    assert.notEqual(localInstalled(candidate), true);
    assert.deepEqual(readCatalog(host([candidate]), DEFAULT_SETTINGS).ids, []);
  }
});

test('raw per-client fallback identifies client 0, regardless of array order', () => {
  assert.equal(localInstalled(app(1, { local_per_client_data: undefined, per_client_data: [
    { clientid: '321', installed: false }, { clientid: '0', installed: true },
  ] })), true);
  assert.equal(localInstalled(app(2, { local_per_client_data: { installed: false }, per_client_data: [
    { clientid: '0', installed: true },
  ] })), false, 'explicit local false is authoritative');
  assert.equal(localInstalled(app(3, { local_per_client_data: { installed: 'true' } })), undefined);
});

test('includes all installed games and demos, including unplayed/shared games, excludes other app types', () => {
  const apps = [app(3, { owner_account_id: 456 }), app(1), app(2, { app_type: 8 }),
    ...[2, 4, 32, 64, 128, 256, 512, 8192, SHORTCUT].map((type, i) => app(100 + i, { app_type: type }))];
  assert.deepEqual(readCatalog(host(apps), DEFAULT_SETTINGS).ids, [1, 2, 3]);
  const result = readCatalog(host(apps), { ...DEFAULT_SETTINGS, includeShortcuts: true });
  assert.deepEqual(result.ids, [1, 2, 3, 108]);
});

test('full catalog keeps all games and numeric alphabetical order independently of carousel limit', () => {
  const apps = Array.from({ length: 105 }, (_, i) => app(105 - i));
  const result = readCatalog(host(apps), DEFAULT_SETTINGS);
  assert.equal(result.ids.length, 105);
  assert.deepEqual(result.ids, [...apps].reverse().map((app) => app.appid));
});

test('carousel defaults to the first 20 sorted games; unlimited returns the full catalog without copying', () => {
  const ids = readCatalog(host(Array.from({ length: 105 }, (_, i) => app(105 - i))), DEFAULT_SETTINGS).ids;
  assert.equal(DEFAULT_SETTINGS.unlimitedCarousel, false);
  assert.deepEqual(carouselGames(ids, DEFAULT_SETTINGS.unlimitedCarousel), ids.slice(0, 20));
  assert.equal(carouselGames(ids, true), ids);
  assert.equal(ids.length, 105, 'limiting the carousel must not truncate the catalog');
  for (const size of [0, 1, 19, 20]) {
    const small = ids.slice(0, size);
    assert.equal(carouselGames(small, false), small);
  }
});

test('older settings gain a disabled unlimited toggle while preserving all existing choices', () => {
  const previous = { enabled: false, sort: 'last-played', includeShortcuts: true };
  assert.deepEqual(parseSettings(JSON.stringify(previous)), { ...DEFAULT_SETTINGS, ...previous });
  for (const invalid of ['true', 1, null, {}, []]) {
    assert.equal(parseSettings(JSON.stringify({ unlimitedCarousel: invalid })).unlimitedCarousel, false);
  }
  let saved = JSON.stringify(previous);
  const storage = { getItem: () => saved, setItem: (_key, value) => { saved = value; } };
  const first = new LibraryStore(() => host([]), storage);
  first.configure({ unlimitedCarousel: true });
  first.dispose();
  const second = new LibraryStore(() => host([]), storage);
  assert.deepEqual(second.getSnapshot().settings, { ...DEFAULT_SETTINGS, ...previous, unlimitedCarousel: true });
  second.dispose();
});

test('preserves native visibility rules and rejects sentinel/invalid IDs', () => {
  const input = host([app(0), app(-1), app(1.5), app(0x100000000), app(1),
    app(2, { visible_in_game_list: false }), app(3)]);
  input.collectionStore = { BIsVisible: (app) => app.appid !== 3 };
  assert.deepEqual(readCatalog(input, DEFAULT_SETTINGS).ids, [1]);
});

test('last-played sorting uses only local playtime and retains never-played titles', () => {
  const input = host([app(1, { rt_last_time_played: 999999 }), app(2),
    app(3, { rt_last_time_locally_played: 50 }), app(4, { rt_last_time_locally_played: 100 })]);
  assert.deepEqual(readCatalog(input, { ...DEFAULT_SETTINGS, sort: 'last-played' }).ids, [4, 3, 1, 2]);
});

test('distinguishes cold boot, an empty library and unsupported APIs; never publishes a partial result', () => {
  assert.equal(readCatalog({}, DEFAULT_SETTINGS).state, 'loading');
  assert.equal(readCatalog({ appStore: { m_bIsInitialized: false } }, DEFAULT_SETTINGS).state, 'loading');
  assert.equal(readCatalog(host([]), DEFAULT_SETTINGS).state, 'ready');
  assert.equal(readCatalog({ appStore: {} }, DEFAULT_SETTINGS).state, 'unsupported');
  const input = host([app(1), app(2)]);
  Object.defineProperty(input.appStore.m_mapApps.get(2), 'local_per_client_data', {
    get() { throw Error('Steam is rebuilding this getter'); },
  });
  const result = readCatalog(input, DEFAULT_SETTINGS);
  assert.equal(result.state, 'unsupported');
  assert.deepEqual(result.ids, []);
});

test('settings validation and unavailable storage fall back to working session settings', () => {
  assert.deepEqual(parseSettings('broken json'), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings('{"enabled":"false","sort":"random","includeShortcuts":1}'), DEFAULT_SETTINGS);
  const store = new LibraryStore(() => host([]), {
    getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); },
  });
  store.configure({ enabled: false });
  assert.equal(store.getSnapshot().settings.enabled, false);
  store.dispose();
});

test('polling recovers cold boot, install/uninstall/SD removal and account switch; unload stops it', (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  let current = {};
  const store = new LibraryStore(() => current);
  store.start();
  assert.equal(store.getSnapshot().state, 'loading');
  current = host([app(1), app(2)]);
  t.mock.timers.tick(2000);
  assert.deepEqual(store.getSnapshot().ids, [1, 2]);
  const previous = store.getSnapshot();
  t.mock.timers.tick(2000);
  assert.equal(store.getSnapshot(), previous, 'unchanged polls must not trigger React');
  current.appStore.m_mapApps.get(2).local_per_client_data.installed = false;
  t.mock.timers.tick(2000);
  assert.deepEqual(store.getSnapshot().ids, [1]);
  current = host([app(10)]);
  t.mock.timers.tick(2000);
  assert.deepEqual(store.getSnapshot().ids, [10]);
  current = host([]);
  t.mock.timers.tick(2000);
  assert.deepEqual(store.getSnapshot().ids, []);
  store.report('active');
  store.dispose();
  current = host([app(20)]);
  t.mock.timers.tick(10000);
  assert.equal(store.getSnapshot().settings.enabled, false);
  assert.deepEqual(store.getSnapshot().ids, []);
  assert.equal(store.getSnapshot().patchState, 'waiting', 'queued reports must also stop');
});
