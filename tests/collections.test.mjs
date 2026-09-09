import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, memo } from 'react';
import { act, create } from 'react-test-renderer';
import { readCatalog } from '../.cache/test/catalog.js';
import { LibraryStore, DEFAULT_SETTINGS } from '../.cache/test/store.js';
import { Replacement } from '../.cache/test/Replacement.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
function fixture() {
  const apps = new Map([1, 2, 3, 4].map(id => [id, { appid: id, app_type: 1,
    display_name: `Game ${id}`, local_per_client_data: { installed: id === 4 } }]));
  const group = (id, name, ids) => ({ id, displayName: name, allApps: ids.map(id => apps.get(id)) });
  const groups = new Map([
    ['z', group('z', 'Zeta', [3, 1])], ['a', group('a', 'Alpha', [2, 1])],
    ['system', group('system', 'Installed', [4])],
  ]);
  const host = { appStore: { m_mapApps: apps, GetAppOverviewByAppID: id => apps.get(id) },
    collectionStore: { m_mapCollectionsFromStorage: groups, BIsSystemCollectionId: id => id === 'system',
      BIsVisible: app => app.visible_in_game_list !== false,
      get userCollections() { throw Error('Do not access injected shelves'); } } };
  return { apps, groups, host };
}
const settings = { ...DEFAULT_SETTINGS, sort: 'collections' };

test('both alphabetical modes respect separate sorting names and native Steam comparison without renaming cards', () => {
  const f = fixture();
  f.apps.get(1).sort_as = 'Zebra';
  f.apps.get(2).sort_as = 'Aardvark';
  f.apps.get(3).sort_as = 'Middle';
  f.apps.get(4).sort_as = 'Last';
  for (const app of f.apps.values()) app.local_per_client_data.installed = true;
  const names = [...f.apps.values()].map(app => app.display_name);
  const check = () => {
    assert.deepEqual(readCatalog(f.host, DEFAULT_SETTINGS).ids, [2, 4, 3, 1]);
    assert.deepEqual(readCatalog(f.host, settings).ids, [2, 1, 3, 1]);
    assert.deepEqual([...f.apps.values()].map(app => app.display_name), names);
  };
  check(); // sort_as fallback when the native comparator is unavailable.
  let calls = 0;
  f.host.appStore.CompareSortAs = function(a, b) {
    assert.equal(this, f.host.appStore);
    calls++;
    return a.sort_as.localeCompare(b.sort_as);
  };
  check();
  assert(calls > 0);
  f.apps.get(1).sort_as = '000';
  assert.equal(readCatalog(f.host, DEFAULT_SETTINGS).ids[0], 1);
  assert.equal(readCatalog(f.host, settings).ids[0], 1);
});

test('collections sort groups and games, keep duplicates and include uninstalled members only', () => {
  const f = fixture();
  const result = readCatalog(f.host, settings);
  assert.equal(result.state, 'ready');
  assert.deepEqual(result.ids, [1, 2, 1, 3]);
  assert.deepEqual(result.collectionNames, ['Alpha', 'Alpha', 'Zeta', 'Zeta']);
  assert.equal(result.unknown, 0);
  assert.deepEqual(readCatalog(f.host, DEFAULT_SETTINGS).ids, [4]);
  f.apps.get(1).visible_in_game_list = false;
  f.apps.get(2).app_type = 1073741824;
  assert.deepEqual(readCatalog(f.host, settings).ids, [3]);
  assert.deepEqual(readCatalog(f.host, { ...settings, includeShortcuts: true }).ids, [2, 3]);
  f.groups.get('z').allApps = [];
  assert.deepEqual(readCatalog(f.host, settings).ids, []);
});

test('collection API readiness and failures never publish partial or installed fallback lists', () => {
  const f = fixture();
  const map = f.host.collectionStore.m_mapCollectionsFromStorage;
  delete f.host.collectionStore.m_mapCollectionsFromStorage;
  assert.equal(readCatalog(f.host, settings).state, 'loading');
  f.host.collectionStore.collectionsFromStorage = map;
  assert.equal(readCatalog(f.host, settings).state, 'ready');
  Object.defineProperty(f.groups.get('z'), 'allApps', { get() { throw Error('unavailable'); } });
  const result = readCatalog(f.host, settings);
  assert.equal(result.state, 'unsupported');
  assert.deepEqual(result.ids, []);
  assert.deepEqual(result.collectionNames, []);
});

test('duplicate cards have unique native keys and correct collection titles without resizing cards', async () => {
  const f = fixture();
  const calls = [];
  function Grid(props) {
    return h('grid', props, Array.from({ length: props.nNumItems }, (_, index) =>
      h('cell', { key: props.fnGetId(index), itemKey: props.fnGetId(index) },
        props.fnItemRenderer(index, props.fnGetColumnWidth(index), 290, index * 200))));
  }
  const Basic = memo(({ games, onItemFocus }) => games.length ? h(Grid, {
    nNumItems: games.length + 1,
    fnGetId: index => index === games.length ? 'GoToLibrary' : String(games[index]),
    fnGetColumnWidth: index => index === 0 ? 560 : 175,
    fnItemRenderer: (index, width, height, left) => index === games.length ? h('library', { width }) :
      h('card', { appid: games[index], width, height, left, onItemFocus }),
  }) : null);
  function Carousel(props) { return h(Basic, { ...props, overscan: props.games.length }); }
  const tree = h('section', {}, h('h2', { key: 'title' }, 'Recent Games'),
    h(Carousel, { key: 'carousel', games: [4], onItemFocus: (...args) => calls.push(args) }));
  const store = new LibraryStore(() => f.host);
  store.configure({ sort: 'collections' });
  let renderer;
  try {
    await act(async () => { renderer = create(h(Replacement, { tree, store })); });
    const cards = () => renderer.root.findAllByType('card');
    const title = () => renderer.root.findByType('h2').props.children;
    assert.equal(title(), 'Alpha');
    const keys = renderer.root.findAllByType('cell').map(c => c.props.itemKey);
    assert.equal(new Set(keys).size, 5);
    assert.equal(keys.at(-1), 'GoToLibrary');
    for (const index of [2, 0, 3, 1, 2]) {
      await act(async () => cards()[index].props.onItemFocus(cards()[index].props.appid, true));
      assert.equal(title(), index < 2 ? 'Alpha' : 'Zeta');
      assert.deepEqual(cards().map(c => c.props.width), [560, 175, 175, 175]);
      assert.deepEqual(calls.at(-1), [cards()[index].props.appid, true]);
    }
    await act(async () => store.configure({ customTitle: 'My games' }));
    assert.equal(title(), 'My games');
    await act(async () => store.configure({ customTitle: '  ' }));
    assert.equal(title(), 'Zeta');
    f.groups.get('z').displayName = 'Zulu';
    await act(async () => store.refresh());
    assert.equal(title(), 'Zulu');
    await act(async () => store.configure({ sort: 'alphabetical' }));
    assert.equal(title(), 'Recent Games');
    assert.deepEqual(cards().map(c => c.props.appid), [4]);
    await act(async () => store.configure({ enabled: false }));
    assert.equal(title(), 'Recent Games');
  } finally { await act(async () => { store.dispose(); renderer?.unmount(); }); }
});
