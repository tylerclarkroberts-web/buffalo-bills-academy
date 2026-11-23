import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, TABS } from '../server/catalog/index.js';
import { DEPARTMENTS, categoriesFor } from '../client/src/store/departments.js';

const department = id => DEPARTMENTS.find(d => d.id === id);

test('departments cover every store category once, with no unknown categories', () => {
  const categories = DEPARTMENTS.flatMap(d => d.categories);
  assert.equal(new Set(categories).size, categories.length, 'a category cannot appear in two departments');
  const shelves = TABS.filter(t => !t.hidden); // a hidden tab (mech parts) is sold somewhere else, never in the store
  assert.deepEqual([...categories].sort(), shelves.map(t => t.id).sort());
  for (const category of new Set(CATALOG.map(item => item.cat))) assert.ok(categories.includes(category) || !shelves.some(t => t.id === category), category);
});

test('departments respect server-hidden bug and seasonal categories', () => {
  const beforeHatch = TABS.filter(t => !t.bug && t.id !== 'seasonal');
  assert.deepEqual(categoriesFor(department('bugs'), beforeHatch), []);
  assert.deepEqual(categoriesFor(department('room'), beforeHatch).map(t => t.id), ['oddities', 'furnishings', 'unique']);
  const afterHatch = TABS.filter(t => t.id !== 'seasonal' && !t.hidden);
  assert.deepEqual(categoriesFor(department('bugs'), afterHatch), TABS.filter(t => t.bug && !t.hidden));
  assert.deepEqual(categoriesFor(department('room'), TABS).map(t => t.id), ['oddities', 'furnishings', 'unique', 'seasonal']);
  assert.deepEqual(categoriesFor(department('appearance'), []), []);
});

test('department categories preserve server order, labels and metadata', () => {
  const tabs = [
    { id: 'tobacco', label: 'Smoke Shop', adult: true },
    { id: 'hats', label: 'Hats' },
    { id: 'spectacles', label: 'Today’s spectacles' },
    { id: 'gags', label: 'Pocket nonsense' },
  ];
  const visible = categoriesFor(department('items'), tabs);
  assert.deepEqual(visible, [tabs[0], tabs[2], tabs[3]]);
  assert.equal(visible[0], tabs[0], 'server category objects are passed through intact');
});
