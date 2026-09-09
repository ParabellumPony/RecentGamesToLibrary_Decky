import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LibraryStore } from '../.cache/test/store.js';
import { replaceTitle } from '../.cache/test/title.js';

test('custom title changes only the native heading label, escapes markup and keeps the spacer', () => {
  const spacer = h('div', { key: 'spacer', className: 'spacer' });
  const label = h('div', { key: 'label', className: 'animated-label', style: { color: 'white' } }, 'Недавние игры');
  const heading = h('h2', { key: 'heading' }, label, spacer);
  const cards = h('div', { key: 'cards', games: [1], onItemFocus() {} });
  const unrelated = h('h2', { key: 'news' }, 'News');
  const tree = h('section', {}, unrelated, h('div', { key: 'inner' }, heading, cards));
  assert.equal(replaceTitle(tree, '   '), tree);
  const result = replaceTitle(tree, ' <b>Мои игры</b> ');
  assert.equal(result.props.children[0], unrelated);
  const changed = result.props.children[1].props.children[0];
  assert.equal(changed.props.children[1], spacer);
  assert.equal(changed.props.children[0].props.children, '<b>Мои игры</b>');
  assert.equal(changed.props.children[0].props.className, 'animated-label');
  assert.equal(changed.props.children[0].props.style.color, 'white');
  assert.equal(label.props.children, 'Недавние игры');
  assert(renderToStaticMarkup(changed).includes('&lt;b&gt;Мои игры&lt;/b&gt;'));
  assert.equal(replaceTitle(unrelated, 'Library'), unrelated);
});

test('editing presentation settings preserves the catalog without rescanning on each keystroke', () => {
  let reads = 0;
  const apps = new Map([[42, { appid: 42, app_type: 1, display_name: 'Game',
    local_per_client_data: { installed: true } }]]);
  const store = new LibraryStore(() => {
    reads++;
    return { appStore: { m_mapApps: apps, GetAppOverviewByAppID: (id) => apps.get(id) } };
  });
  store.refresh();
  const ids = store.getSnapshot().ids;
  for (const change of [{ customTitle: 'M' },
    { customTitle: 'My games' }, { unlimitedCarousel: true }]) store.configure(change);
  assert.equal(reads, 1);
  assert.equal(store.getSnapshot().ids, ids);
  store.configure({ sort: 'last-played' });
  assert.equal(reads, 2, 'catalog settings still refresh immediately');
  store.dispose();
});
