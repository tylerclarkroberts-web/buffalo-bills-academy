export const DEPARTMENTS = [
  { id: 'appearance', label: 'Appearance', categories: ['hats', 'face', 'clothes', 'skins', 'extras'] },
  { id: 'items', label: 'Items', categories: ['gags', 'tobacco'] },
  { id: 'room', label: 'My Room', categories: ['oddities', 'unique', 'seasonal'] },
  { id: 'bugs', label: 'Bug Gear', categories: ['food', 'toys', 'bugstyle', 'bugcare', 'gear'] },
];

// Use the server's visible categories so hatch and seasonal availability still apply.
export const categoriesFor = (department, tabs) => tabs.filter((tab) => department.categories.includes(tab.id));
