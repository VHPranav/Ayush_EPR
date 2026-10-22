// First-run account setup. Nothing is seeded in schema.sql, so a fresh production database has no
// well-known passwords: the first Super Administrator comes from ADMIN_USERNAME / ADMIN_PASSWORD.
const DEV_ACCOUNTS = [
  ['reception', 'Reception User', 'RECEPTION'],
  ['doctor', 'Doctor User', 'DOCTOR'],
  ['pharmacist', 'Pharmacy User', 'PHARMACIST'],
  ['admin', 'AYUSH Administrator', 'SUPER_ADMIN'],
];

async function createUser(pool, username, displayName, password, role, hash) {
  const u = await pool.query(
    'INSERT INTO users(username,display_name,password_hash) VALUES($1,$2,$3) ON CONFLICT(username) DO NOTHING RETURNING user_id',
    [username, displayName, hash(password)]
  );
  if (!u.rows[0]) return;
  await pool.query('INSERT INTO user_roles(user_id,role_id) SELECT $1, role_id FROM roles WHERE name=$2', [u.rows[0].user_id, role]);
}

export async function bootstrapAccounts(pool, { isProd, hash, minPassword }) {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM users');
  if (rows[0].n > 0) return;

  const { ADMIN_USERNAME: name, ADMIN_PASSWORD: password } = process.env;
  if (name && password) {
    if (password.length < minPassword) throw new Error(`ADMIN_PASSWORD must be at least ${minPassword} characters`);
    await createUser(pool, name.toLowerCase(), 'Administrator', password, 'SUPER_ADMIN', hash);
    console.log(`✓ Created first Super Administrator "${name.toLowerCase()}". Remove ADMIN_PASSWORD from .env once you have signed in.`);
    return;
  }
  if (isProd) {
    throw new Error('No users exist. Set ADMIN_USERNAME and ADMIN_PASSWORD (12+ characters) in .env for the first start.');
  }
  for (const [username, display, role] of DEV_ACCOUNTS) await createUser(pool, username, display, 'ayush-dev-only', role, hash);
  console.log('! Created development accounts (reception, doctor, pharmacist, admin / password "ayush-dev-only"). Never use outside development.');
}
