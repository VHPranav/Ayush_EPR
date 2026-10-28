// Read-only host/readiness probe. Exit nonzero for scheduler/monitor integration.
// Usage: node deploy/scripts/check-production.mjs https://epr.example.com [backup-directory]
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
const origin = process.argv[2];
const backups = process.argv[3] || 'backups';
let failed = false;
function check(ok, message) { console.log(`${ok ? 'PASS' : 'FAIL'} ${message}`); if (!ok) failed = true; }
try {
  const url = new URL(origin);
  check(url.protocol === 'https:', 'HTTPS origin configured');
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Supply a public HTTPS origin without credentials');
  const env = Object.fromEntries((await readFile('.env','utf8')).split(/\r?\n/).filter(l => l && !l.startsWith('#')).map(l => { const i=l.indexOf('='); return [l.slice(0,i),l.slice(i+1)]; }));
  check(!!env.PASSWORD_SALT && env.PASSWORD_SALT.length >= 32 && !env.PASSWORD_SALT.includes('CHANGE_ME'), 'Password salt configured');
  check(!!env.POSTGRES_PASSWORD && env.POSTGRES_PASSWORD.length >= 24 && !env.POSTGRES_PASSWORD.includes('CHANGE_ME'), 'Database password configured');
  check(!env.ADMIN_PASSWORD, 'Bootstrap administrator password removed after first sign-in');
  const response = await fetch(new URL('/api/health',url), { signal: AbortSignal.timeout(10000), redirect: 'error' });
  const health = await response.json();
  check(response.ok && health.ok === true && health.database === 'connected', 'Public API/database health');
  check(response.headers.get('cache-control')?.includes('no-store'), 'Patient API cache prevention');
  const page = await fetch(new URL('/login',url),{signal:AbortSignal.timeout(10000),redirect:'error'});
  check(page.ok, 'Login page available');
  check(page.headers.get('strict-transport-security')?.includes('max-age='), 'HTTPS transport policy');
  check(page.headers.get('x-content-type-options') === 'nosniff', 'Content sniffing disabled');
  const files = (await readdir(backups)).filter(f=>f.endsWith('.ayushbak'));
  const records = await Promise.all(files.map(async f=>stat(path.join(backups,f))));
  check(records.some(s=>s.size > 36 && Date.now()-s.mtimeMs < 26*3600e3), 'Encrypted local backup created within 26 hours');
  console.log('Manual gates remain: off-server copy, restore rehearsal, alert delivery, staff UAT, clinical/privacy approval.');
} catch (error) { check(false,error.message); }
process.exitCode = failed ? 1 : 0;
