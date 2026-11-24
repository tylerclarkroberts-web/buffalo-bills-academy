export const DEPARTMENTS = [
  { id: 'appearance', label: 'Appearance', categories: ['hats', 'face', 'clothes', 'skins', 'extras'] },
  { id: 'items', label: 'Items', categories: ['gags', 'spectacles', 'tobacco'] },
  { id: 'room', label: 'My House', categories: ['oddities', 'furnishings', 'unique', 'seasonal'] },
  { id: 'mining', label: 'Mining Gear', categories: ['mine'] },
  { id: 'bugs', label: 'Bug Gear', categories: ['food', 'toys', 'bugstyle', 'bugcare', 'gear', 'gymgear'] },
];

// Use the server's visible categories so hatch and seasonal availability still apply.
export const categoriesFor = (department, tabs) => tabs.filter((tab) => department.categories.includes(tab.id));
