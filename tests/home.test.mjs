import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useRef, useEffect, useState, memo } from 'react';
import { act, create } from 'react-test-renderer';
// Use the actual Decky patcher in isolation: importing the whole UI library
// would require the Steam webpack runtime on this development machine.
import { afterPatch } from '../node_modules/@decky/ui/dist/utils/patcher.js';
import { installHomePatch } from '../.cache/test/homePatch.js';
import { LibraryStore } from '../.cache/test/store.js';
import { replaceGames, ReplacementBoundary } from '../.cache/test/Replacement.js';
import { windowCarousel, CAROUSEL_OVERSCAN } from '../.cache/test/carousel.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// Decky's real unpatcher logs entire patch objects at debug level.
console.debug = () => {};

test('immutable replacement changes both data consumers and no styling, heading or other shelves', () => {
  const originalFocus = () => {};
  const ref = { current: null };
  const nativeGames = [900, 800];
  const background = h('background', { games: nativeGames, refOnItemFocus: ref, className: 'native-bg' });
  const carousel = h('carousel', {
    games: nativeGames, onItemFocus: originalFocus, autoFocus: true,
    showFeaturedItem: true, className: 'native-cards', style: { width: 123 },
  });
  const tree = h('div', { className: 'native-home' }, background, h('h2', {}, 'Recent Games'), carousel);
  const ids = Array.from({ length: 55 }, (_, i) => i + 1);
  const result = replaceGames(tree, ids, originalFocus);
  assert.notEqual(result, tree);
  assert.equal(result.type, tree.type);
  assert.equal(result.props.className, tree.props.className);
  assert.equal(result.props.children[1], tree.props.children[1]);
  assert.equal(result.props.children[0].props.games, ids);
  assert.deepEqual(result.props.children[2].props, { ...carousel.props, games: ids });
  assert.equal(background.props.games, nativeGames);
  assert.equal(carousel.props.games, nativeGames);
  const empty = replaceGames(tree, [], originalFocus);
  assert.equal(empty.props.children[0], null);
  assert.deepEqual(empty.props.children[2].props.games, []);
});

function fixture() {
  const raw = [900, 800];
  const apps = new Map();
  const host = { appStore: {
    m_bIsInitialized: true, m_mapApps: apps, GetAppOverviewByAppID: (id) => apps.get(id),
  } };
  const install = (id) => apps.set(id, {
    appid: id, app_type: 1, display_name: `Game ${id}`, local_per_client_data: { installed: true },
  });
  install(1); install(2); install(3);
  const store = new LibraryStore(() => host);
  store.refresh();
  let registered;
  const router = {
    addPatch(path, fn) { assert.equal(path, '/library/home'); registered = fn; return fn; },
    removePatch(path, fn) { assert.equal(path, '/library/home'); assert.equal(fn, registered); registered = null; },
  };
  function Background({ games, refOnItemFocus }) {
    const [selected, setSelected] = useState(games[0]);
    useEffect(() => { refOnItemFocus.current = setSelected; }, [refOnItemFocus, games]);
    return h('background', { selected });
  }
  const BasicCarousel = memo(function BasicCarousel(props) {
    // Matches Steam's native empty-array behavior in the researched source.
    return props.games.length ? h('carousel', props) : null;
  });
  function Carousel(props) {
    // Native Home supplies this on output, ignoring overscan on its input.
    return h(BasicCarousel, { ...props, overscan: props.games.length });
  }
  const Recents = memo(function Recents({ autoFocus, showBackground }) {
    const ref = useRef(undefined);
    const [selected, setSelected] = useState(undefined);
    const onItemFocus = (id) => { setSelected(id); ref.current?.(id); };
    return h('section', { className: 'stock-recents', selected },
      showBackground && h(Background, { key: 'background', games: raw, refOnItemFocus: ref }),
      h('h2', { key: 'title' }, 'Recent Games'),
      h(Carousel, { key: 'cards', games: raw, autoFocus, onItemFocus, showFeaturedItem: true }));
  });
  const Home = memo(function Home() {
    return h('home', {}, h(Recents, { autoFocus: true, showBackground: true }),
      h('news', { games: raw }, 'News'));
  });
  const originalRecents = Recents.type;
  const originalHome = Home.type;
  let patchCount = 0;
  const uninstall = installHomePatch(router, (...args) => { patchCount++; return afterPatch(...args); }, store);
  return {
    apps, install, store, Recents, Home, originalRecents, originalHome, uninstall,
    // Decky's real router creates a fresh transparent function per route pass.
    route: () => registered({ children: h((props) => h(Home, props)) }).children,
    routePresent: () => !!registered,
    patchCount: () => patchCount,
  };
}

test('actual Decky patch chain and React lifecycle: full catalog, focus, updates, toggle and complete cleanup', async () => {
  const f = fixture();
  let renderer;
  await act(async () => { renderer = create(f.route()); });
  const cards = () => renderer.root.findByType('carousel');
  const background = () => renderer.root.findByType('background');
  assert.deepEqual(cards().props.games, [1, 2, 3]);
  assert.equal(background().props.selected, 1, 'initial hero must be an installed game');
  assert.deepEqual(renderer.root.findByType('news').props.games, [900, 800]);
  await act(async () => cards().props.onItemFocus(2));
  assert.equal(background().props.selected, 2);
  await act(async () => { f.install(4); f.store.refresh(); });
  assert.deepEqual(cards().props.games, [1, 2, 3, 4]);
  assert.equal(background().props.selected, 2, 'installation must not reset a valid selected game');
  await act(async () => { f.apps.delete(2); f.store.refresh(); });
  assert.deepEqual(cards().props.games, [1, 3, 4]);
  assert.equal(background().props.selected, 1, 'deleted focus is replaced');
  const wrappedRecents = f.Recents.type;
  for (let index = 0; index < 5; index++) {
    await act(async () => renderer.update(f.route()));
  }
  assert.equal(f.Recents.type, wrappedRecents, 'route renders must not accumulate native patches');
  assert.equal(f.patchCount(), 2, 'only shared Home and RecentGames objects retain patches');
  await act(async () => f.store.configure({ enabled: false }));
  assert.deepEqual(cards().props.games, [900, 800]);
  assert.equal(background().props.selected, 900);
  await act(async () => f.store.configure({ enabled: true }));
  assert.deepEqual(cards().props.games, [1, 3, 4]);
  assert.equal(background().props.selected, 1);
  await act(async () => { f.apps.clear(); f.store.refresh(); });
  assert.equal(renderer.root.findAllByType('carousel').length, 0);
  assert.equal(renderer.root.findAllByType('background').length, 0);
  await act(async () => { f.install(10); f.store.refresh(); });
  assert.deepEqual(cards().props.games, [10]);
  assert.equal(background().props.selected, 10);
  // An unrelated plugin can install a later patch. Decky's own unpatcher
  // must remove ours while preserving this later patch.
  let foreignCalls = 0;
  const foreign = afterPatch(f.Recents, 'type', (_args, result) => { foreignCalls++; return result; });
  await act(async () => { f.store.dispose(); f.uninstall(); f.uninstall(); });
  assert.equal(f.routePresent(), false);
  assert.equal(f.Home.type, f.originalHome);
  assert.equal(f.Recents.type, foreign.patchedFunction);
  assert.equal(foreign.original, f.originalRecents);
  assert.deepEqual(cards().props.games, [900, 800], 'already mounted adapters must also restore native data');
  foreign.unpatch();
  assert.equal(f.Recents.type, f.originalRecents);
  await act(async () => renderer.unmount());
});

test('limit toggles live; focus, background, sorting, native restore and full catalog stay consistent', async () => {
  const f = fixture();
  for (let id = 4; id <= 105; id++) f.install(id);
  f.store.refresh();
  let renderer;
  try {
    await act(async () => { renderer = create(f.route()); });
    const cards = () => renderer.root.findByType('carousel');
    const background = () => renderer.root.findByType('background');
    const firstTwenty = Array.from({ length: 20 }, (_, i) => i + 1);
    assert.deepEqual(cards().props.games, firstTwenty);
    assert.equal(f.store.getSnapshot().ids.length, 105);
    assert.equal(cards().props.overscan, CAROUSEL_OVERSCAN);
    await act(async () => cards().props.onItemFocus(12));
    await act(async () => f.store.configure({ unlimitedCarousel: true }));
    assert.equal(cards().props.games.length, 105);
    assert.equal(cards().props.overscan, CAROUSEL_OVERSCAN, 'unlimited mode must still bound off-screen rendering');
    assert.equal(background().props.selected, 12, 'expanding the list must not remount the native background');
    await act(async () => cards().props.onItemFocus(64));
    assert.equal(background().props.selected, 64);
    await act(async () => f.store.configure({ unlimitedCarousel: false }));
    assert.deepEqual(cards().props.games, firstTwenty);
    assert.equal(background().props.selected, 1, 'out-of-range focus must no longer supply the hero');
    f.apps.get(64).rt_last_time_locally_played = 100;
    await act(async () => f.store.configure({ sort: 'last-played' }));
    assert.deepEqual(cards().props.games, [64, ...firstTwenty.slice(0, 19)], 'sort before applying the limit');
    await act(async () => f.store.configure({ enabled: false }));
    assert.deepEqual(cards().props.games, [900, 800]);
    assert.equal(cards().props.overscan, 2, 'native settings must return when the plugin is disabled');
    await act(async () => f.store.configure({ enabled: true }));
    assert.equal(cards().props.games.length, 20);
    assert.equal(cards().props.overscan, CAROUSEL_OVERSCAN);
  } finally {
    await act(async () => { f.store.dispose(); f.uninstall(); renderer?.unmount(); });
  }
});

test('bounded native overscan mounts nearby cards while distant games and the library entry remain reachable', async () => {
  const ids = Array.from({ length: 1000 }, (_, i) => i + 1);
  let start = 0;
  const focused = [];
  const onItemFocus = (id) => focused.push(id);
  function Basic({ games, overscan, onItemFocus }) {
    // Steam's native grid range contract, including its trailing Library tile:
    // research/steam-shared.js:339432 and 399333. This is a host simulation,
    // not a measurement of GPU performance or Steam's navigation manager.
    const count = games.length + 1;
    const from = Math.max(0, start - overscan);
    const to = Math.min(count - 1, start + 4 + overscan);
    return h('grid', {}, Array.from({ length: to - from + 1 }, (_, offset) => {
      const index = from + offset;
      return index === games.length ? h('library-link', { key: 'library' })
        : h('game', { key: games[index], appid: games[index], onFocus: () => onItemFocus(games[index]) });
    }));
  }
  function Native(props) { return h(Basic, { ...props, overscan: props.games.length }); }
  const original = h(Native, { games: ids, onItemFocus });
  const bounded = windowCarousel(original);
  let renderer;
  try {
    await act(async () => { renderer = create(bounded); });
    assert(renderer.root.findAllByType('game').length <= 17);
    assert.equal(renderer.root.findAllByType('game')[0].props.appid, 1);
    start = 995;
    await act(async () => renderer.update(windowCarousel(h(Native, { games: ids, onItemFocus }))));
    assert(renderer.root.findAllByType('game').length <= 17);
    const lastGame = renderer.root.findAllByType('game').find((game) => game.props.appid === 1000);
    assert(lastGame, 'the tail of the full catalog must remain reachable');
    await act(async () => lastGame.props.onFocus());
    assert.deepEqual(focused, [1000]);
    assert.equal(renderer.root.findAllByType('library-link').length, 1);
    assert.equal(original.type, Native, 'no mutation of shared native types');
    assert.equal(windowCarousel(original).type, bounded.type, 'the owned adapter must have stable identity');
  } finally { await act(async () => renderer?.unmount()); }
});

test('changed Steam route shape falls back without throwing or modifying the input element', async () => {
  let route;
  const store = new LibraryStore(() => ({}));
  const uninstall = installHomePatch({
    addPatch(_path, fn) { route = fn; return fn; }, removePatch() {},
  }, afterPatch, store);
  const original = { children: h('changed-steam-route', { id: 'native' }) };
  assert.equal(route(original), original);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(store.getSnapshot().patchState, 'unsupported');
  store.dispose(); uninstall();
});

test('render failure in a future native carousel restores the original native subtree', async () => {
  const f = fixture();
  function IncompatibleCarousel({ games }) {
    if (games[0] !== 900) throw Error('Changed Steam contract');
    return h('fallback-carousel', { games });
  }
  const tree = h(IncompatibleCarousel, { games: [900], onItemFocus: () => {} });
  const savedError = console.error;
  let renderer;
  try {
    // Expected React error-boundary diagnostic; assert the actual fallback below.
    console.error = () => {};
    await act(async () => { renderer = create(h(ReplacementBoundary, { tree, store: f.store })); });
    assert.deepEqual(renderer.root.findByType('fallback-carousel').props.games, [900]);
  } finally {
    console.error = savedError;
    await act(async () => { f.store.dispose(); f.uninstall(); renderer?.unmount(); });
  }
});
