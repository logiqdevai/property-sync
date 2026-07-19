import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(here, 'example-requests', 'estate-web-locations.json');
const OUT = join(
  here,
  '..',
  '..',
  'api',
  'src',
  'integrations',
  'estateweb',
  'constants',
  'estateweb-locations.data.json',
);

const tree = JSON.parse(readFileSync(SOURCE, 'utf8'));

const flat = [];

function walk(nodes, prefix) {
  for (const node of nodes) {
    const path = prefix ? `${prefix} » ${node.name}` : node.name;
    flat.push({
      id: node.id,
      name: node.name,
      parent_id: node.parent_id ?? 0,
      level: node.level ?? 0,
      is_city: Boolean(node.is_city),
      path,
    });
    if (Array.isArray(node.children) && node.children.length > 0) {
      walk(node.children, path);
    }
  }
}

walk(Array.isArray(tree) ? tree : [], '');

writeFileSync(OUT, JSON.stringify(flat));

const bytes = Buffer.byteLength(JSON.stringify(flat));
console.log(`nodes: ${flat.length}`);
console.log(`levels: ${[...new Set(flat.map((n) => n.level))].sort().join(',')}`);
console.log(`bytes: ${bytes} (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
console.log(`sample:`, JSON.stringify(flat.slice(0, 2)));
