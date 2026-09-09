import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import { afterPatch } from '../node_modules/@decky/ui/dist/utils/patcher.js';
import { act, create } from 'react-test-renderer';

const routes = new Map();
const settings = new Map();
const apps = new Map([[42, {
  appid: 42, app_type: 1, display_name: 'Installed test game',
  local_per_client_data: { installed: true },
}]]);
globalThis.SP_REACT = React;
globalThis.SP_JSX = jsx;
globalThis.DFL = { afterPatch, ...Object.fromEntries([
  'ButtonItem', 'DropdownItem', 'PanelSection', 'PanelSectionRow', 'TextField', 'ToggleField',
].map((name) => [name, (props) => React.createElement(name.toLowerCase(), props)])) };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.SteamClient = { Settings: { GetCurrentLanguage: async () => 'russian' } };
globalThis.appStore = {
  m_bIsInitialized: true, m_mapApps: apps,
  GetAppOverviewByAppID: (id) => apps.get(id),
};
globalThis.window = {
  localStorage: { getItem: (key) => settings.get(key), setItem: (key, value) => settings.set(key, value) },
  __DECKY_SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED_deckyLoaderAPIInit: {
    connect(version, name) {
      assert.equal(version, 2);
      assert.equal(name, 'Recent Games To Library');
      return {
        _version: 2,
        routerHook: {
          addPatch(path, callback) { routes.set(path, callback); return callback; },
          removePatch(path, callback) { assert.equal(routes.get(path), callback); routes.delete(path); },
        },
      };
    },
  },
};
const module = await import(pathToFileURL(resolve('dist/index.js')).href);
const plugin = module.default();
let renderer;
try {
  assert.equal(plugin.name, 'Recent Games To Library');
  assert(React.isValidElement(plugin.titleView));
  assert(React.isValidElement(plugin.icon));
  assert(React.isValidElement(plugin.content));
  assert.deepEqual([...routes.keys()], ['/library/home']);
  const store = plugin.content.props.store;
  assert.deepEqual(store.getSnapshot().ids, [42]);
  assert.equal(store.getSnapshot().settings.unlimitedCarousel, false);
  await act(async () => { renderer = create(plugin.content); });
  const toggles = () => renderer.root.findAllByType('togglefield');
  assert.equal(toggles().length, 3);
  for (const node of toggles()) assert.equal(node.props.description, undefined);
  assert.equal(renderer.root.findAllByType('dropdownitem').length, 1);
  const order = renderer.root.findByType('dropdownitem');
  assert.deepEqual(order.props.rgOptions.map(o => o.data), ['alphabetical', 'last-played', 'collections']);
  assert.equal(renderer.root.findAllByType('textfield').length, 1);
  await act(async () => renderer.root.findByType('textfield').props.onChange({ target: { value: 'My games' } }));
  assert.equal(store.getSnapshot().settings.customTitle, 'My games');
  const russianLabel = toggles()[0].props.label;
  await act(async () => renderer.unmount());
  globalThis.SteamClient.Settings.GetCurrentLanguage = async () => 'english';
  await act(async () => { renderer = create(plugin.content); });
  assert.equal(toggles()[0].props.label, 'Installed games on Home');
  assert.notEqual(russianLabel, toggles()[0].props.label);
  await act(async () => store.configure({ unlimitedCarousel: true }));
  assert.equal(store.getSnapshot().settings.unlimitedCarousel, true);
  await act(async () => store.configure({ enabled: false }));
  assert.equal(settings.size, 1);
  assert.equal(store.getSnapshot().settings.enabled, false);
} finally {
  await act(async () => { plugin.onDismount(); renderer?.unmount(); });
}
assert.equal(routes.size, 0);
console.log('Built ESM: Decky lifecycle, RU/EN panel, custom title, simplified controls and persisted settings pass (simulated host).');
