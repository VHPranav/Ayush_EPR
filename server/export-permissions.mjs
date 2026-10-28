// Writes the role -> permissions table the static demo build uses, from the single source of truth
// (permissions.js), so the demo's menus match the real app. Run: npm --prefix server run export:permissions
import fs from 'node:fs';
import { ALL_ROLES, permissionsFor } from './permissions.js';

const out = Object.fromEntries(ALL_ROLES.map(r => [r, permissionsFor([r])]));
const target = new URL('../web/lib/demo/permissions.json', import.meta.url);
fs.writeFileSync(target, JSON.stringify(out, null, 2) + '\n');
console.log(`Wrote ${ALL_ROLES.length} roles to web/lib/demo/permissions.json`);
