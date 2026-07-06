import { uuid } from './utils.js';

export function detectDuplicates(properties) {
  for (let i = 0; i < properties.length; i++) {
    for (let j = i + 1; j < properties.length; j++) {
      const a = properties[i];
      const b = properties[j];
      if (!a.title || !b.title) continue;
      const sameTitle = a.title.toLowerCase().trim() === b.title.toLowerCase().trim();
      const sameCity = a.city && b.city && a.city.toLowerCase() === b.city.toLowerCase();
      const priceClose = a.price && b.price && Math.abs(a.price - b.price) / Math.max(a.price, b.price) <= 0.01;
      if (sameTitle && sameCity && priceClose) {
        const groupId = a.duplicate_group_id ?? b.duplicate_group_id ?? uuid();
        a.duplicate_group_id = groupId;
        b.duplicate_group_id = groupId;
      }
    }
  }
}
