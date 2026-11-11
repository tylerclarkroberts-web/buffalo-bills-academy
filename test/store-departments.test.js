import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, TABS } from '../server/catalog/index.js';
import { DEPARTMENTS, categoriesFor } from '../client/src/store/departments.js';

const department = id => DEPARTMENTS.find(d => d.id === id);

test('departments cover every store category once, with no unknown categories', () => {
  const categories = DEPARTMENTS.flatMap(d => d.categories);
  assert.equal(new Set(categories).size, categories.length, 'a category cannot appear in two departments');
  assert.deepEqual([...categories].sort(), TABS.map(t => t.id).sort());
  for (const category of new Set(CATALOG.map(item => item.cat))) assert.ok(categories.includes(category), category);
});

test('departments respect server-hidden bug and seasonal categories', () => {
  const beforeHatch = TABS.filter(t => !t.bug && t.id !== 'seasonal');
  assert.deepEqual(categoriesFor(department('bugs'), beforeHatch), []);
  assert.deepEqual(categoriesFor(department('room'), beforeHatch).map(t => t.id), ['oddities', 'unique']);
  const afterHatch = TABS.filter(t => t.id !== 'seasonal');
  assert.deepEqual(categoriesFor(department('bugs'), afterHatch), TABS.filter(t => t.bug));
  assert.deepEqual(categoriesFor(department('room'), TABS).map(t => t.id), ['oddities', 'unique', 'seasonal']);
  assert.deepEqual(categoriesFor(department('appearance'), []), []);
});

test('department categories preserve server order, labels and metadata', () => {
  const tabs = [
    { id: 'tobacco', label: 'Smoke Shop', adult: true },
    { id: 'hats', label: 'Hats' },
    { id: 'gags', label: 'Pocket nonsense' },
  ];
  const visible = categoriesFor(department('items'), tabs);
  assert.deepEqual(visible, [tabs[0], tabs[2]]);
  assert.equal(visible[0], tabs[0], 'server category objects are passed through intact');
});
