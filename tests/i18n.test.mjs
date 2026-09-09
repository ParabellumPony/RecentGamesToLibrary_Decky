import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { act, create } from 'react-test-renderer';
import { localeFor, detectLocale, translations } from '../.cache/test/i18n.js';
import { useLocale } from '../.cache/test/useLocale.js';
import { parseSettings, DEFAULT_SETTINGS } from '../.cache/test/store.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test('Steam names, language tags and unsupported languages resolve consistently', () => {
  for (const value of ['russian', 'RUSSIAN', 'ru', 'ru-RU', ' ru_RU ', 'ru-UA']) assert.equal(localeFor(value), 'ru');
  for (const value of ['english', 'en', 'en-GB', 'german', 'de-DE', '', null, 3, {}]) assert.equal(localeFor(value), 'en');
});

test('native Steam language takes priority over the browser, including an English fallback for other Steam languages', async () => {
  const host = (language) => ({
    SteamClient: { Settings: { GetCurrentLanguage: async () => language } },
    navigator: { language: 'ru-RU' },
  });
  assert.equal(await detectLocale(host('english')), 'en');
  assert.equal(await detectLocale(host('german')), 'en');
  assert.equal(await detectLocale({ ...host('russian'), navigator: { language: 'en-US' } }), 'ru');
});

test('missing, rejected and uninitialized Steam language API uses the browser or English', async () => {
  assert.equal(await detectLocale({}), 'en');
  assert.equal(await detectLocale({ navigator: { language: 'ru-RU' } }), 'ru');
  for (const GetCurrentLanguage of [async () => { throw Error('not ready'); }, async () => '', () => undefined]) {
    assert.equal(await detectLocale({
      SteamClient: { Settings: { GetCurrentLanguage } }, navigator: { language: 'ru' },
    }), 'ru');
  }
});

test('translation catalogs cover the same controls, dynamic counts and every known error', () => {
  assert.deepEqual(Object.keys(translations.en).sort(), Object.keys(translations.ru).sort());
  assert.deepEqual(Object.keys(translations.en.errors).sort(), Object.keys(translations.ru.errors).sort());
  for (const dictionary of Object.values(translations)) {
    for (const value of Object.values(dictionary)) {
      if (typeof value === 'string') assert(value.trim().length);
    }
    for (const error of Object.values(dictionary.errors)) assert(error.trim().length);
    for (const count of [0, 1, 20, 105]) {
      assert(dictionary.shown(count, 105).includes(String(count)));
      assert(dictionary.shown(count, 105).includes('105'));
      assert(dictionary.unknown(count).includes(String(count)));
    }
  }
});

test('obsolete settings are discarded while title and carousel preferences persist', () => {
  const old = { ...DEFAULT_SETTINGS, customTitle: 'Library', language: 'ru', wideFocusedGame: true, customTitleEnabled: false };
  assert.deepEqual(parseSettings(JSON.stringify(old)), { ...DEFAULT_SETTINGS, customTitle: 'Library' });
  assert.equal(parseSettings(JSON.stringify({sort: 'collections'})).sort, 'collections');
});

test('automatic language detection updates the panel and ignores completion after unmount', async () => {
  let resolveLanguage;
  const host = { SteamClient: { Settings: { GetCurrentLanguage: () => new Promise(resolve => { resolveLanguage = resolve; }) } } };
  function Probe() { return h('locale', { value: useLocale(host) }); }
  let renderer;
  await act(async () => { renderer = create(h(Probe)); });
  assert.equal(renderer.root.findByType('locale').props.value, 'en');
  await act(async () => resolveLanguage('russian'));
  assert.equal(renderer.root.findByType('locale').props.value, 'ru');
  await act(async () => renderer.unmount());
  await act(async () => { renderer = create(h(Probe)); });
  await act(async () => renderer.unmount());
  await act(async () => resolveLanguage('english'));
  assert.equal(renderer.toJSON(), null);
});
