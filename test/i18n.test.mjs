import { test } from 'node:test';
import assert from 'node:assert/strict';

// i18n.js reads the page language on import; give it a minimal page that asks for English.
globalThis.document = { documentElement: { dataset: { uiLang: 'en' } } };
const { tr, tables, lang } = await import('../ui/i18n.js');

test('picks the language the page asks for', () => assert.equal(lang, 'en'));

test('translates exact text and keeps surrounding whitespace', () => {
  assert.equal(tr('Annuleren'), 'Cancel');
  assert.equal(tr('  Mijn app TikToks \n'), '  My app TikToks \n');
  assert.equal(tr('iets onbekends'), 'iets onbekends');
});

test('fills placeholders, translating what they hold', () => {
  assert.equal(tr('Renderen: v1-intro'), 'Rendering: v1-intro');
  assert.equal(tr('Kopie van Nieuwe video'), 'Copy of New video');
});

test('translates joined pieces one by one', () => assert.equal(tr('Annuleren · Sluiten'), 'Cancel · Close'));

test('every translation keeps the placeholders of its key', () => {
  for (const [name, table] of Object.entries(tables)) {
    for (const [k, v] of Object.entries(table)) {
      const holes = s => (s.match(/\{\d+\}/g) || []).sort().join();
      assert.equal(holes(v), holes(k), `${name}: "${k}"`);
    }
  }
});
