import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Pool, Client } = pg;

// Return DATE columns (dob, expiry, ...) as plain 'YYYY-MM-DD' strings instead of JS Dates, so the
// server's timezone can't shift the calendar day when they are serialised to JSON.
pg.types.setTypeParser(1082, v => v);

let embeddedPostgresInstance = null;
let activePool = null;

async function testConnection(connectionString, timeoutMs = 2000) {
  const client = new Client({ connectionString, connectionTimeoutMillis: timeoutMs });
  try {
    await client.connect();
    await client.query('SELECT 1');
    await client.end();
    return true;
  } catch (err) {
    try { await client.end(); } catch {}
    return false;
  }
}

async function runSchema(client) {
  const schemaPath = path.join(__dirname, '..', 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const sql = fs.readFileSync(schemaPath, 'utf8');
    await client.query(sql);
    console.log('✓ Database schema synchronized successfully.');
  }
}

export async function getDatabasePool() {
  if (activePool) return activePool;

  const defaultDbUrl = process.env.DATABASE_URL || 'postgresql://ayush:ayush_dev_password@127.0.0.1:5432/ayush_epr';
  console.log('Connecting to PostgreSQL database...');

  const isReachable = await testConnection(defaultDbUrl, 2000);

  if (isReachable) {
    console.log('✓ Connected to PostgreSQL on', defaultDbUrl.replace(/:[^:@]+@/, ':****@'));
    activePool = new Pool({ connectionString: defaultDbUrl });
    activePool.on('error', err => console.error('Idle database client error:', err.message));
    
    // Check if schema is initialized
    try {
      const check = await activePool.query("SELECT 1 FROM information_schema.tables WHERE table_name = 'users'");
      if (check.rows.length === 0) {
        console.log('Initializing schema in existing PostgreSQL database...');
        await runSchema(activePool);
      }
    } catch (err) {
      console.warn('Notice while checking existing database:', err.message);
    }
    return activePool;
  }

  // If not reachable, spin up EmbeddedPostgres
  console.log('No active PostgreSQL found on port 5432. Starting native embedded PostgreSQL...');
  
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const pgDir = process.env.PGDATA_DIR || path.join(__dirname, '..', 'db', '.pgdata');
  fs.mkdirSync(path.dirname(pgDir), { recursive: true });

  const port = Number(process.env.PGPORT || 5432);
  const user = process.env.POSTGRES_USER || 'ayush';
  const password = process.env.POSTGRES_PASSWORD || 'ayush_dev_password';
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to start the embedded development database in production: set DATABASE_URL to a PostgreSQL server.');

  embeddedPostgresInstance = new EmbeddedPostgres({
    port,
    databaseDir: pgDir,
    user,
    password,
    persistent: true
  });

  const isFirstRun = !fs.existsSync(path.join(pgDir, 'PG_VERSION'));
  if (isFirstRun) {
    console.log('Initializing embedded database data cluster...');
    await embeddedPostgresInstance.initialise();
  }

  console.log(`Starting embedded PostgreSQL on 127.0.0.1:${port}...`);
  await embeddedPostgresInstance.start();

  // Ensure ayush_epr database exists
  const rootClient = new Client({
    connectionString: `postgresql://${user}:${encodeURIComponent(password)}@127.0.0.1:${port}/postgres`
  });
  await rootClient.connect();
  const dbCheck = await rootClient.query("SELECT 1 FROM pg_database WHERE datname='ayush_epr'");
  if (dbCheck.rows.length === 0) {
    console.log('Creating database ayush_epr...');
    await rootClient.query('CREATE DATABASE ayush_epr');
  }
  await rootClient.end();

  const connString = `postgresql://${user}:${encodeURIComponent(password)}@127.0.0.1:${port}/ayush_epr`;
  activePool = new Pool({ connectionString: connString });
  activePool.on('error', err => console.error('Idle database client error:', err.message));

  const tableCheck = await activePool.query("SELECT 1 FROM information_schema.tables WHERE table_name = 'users'");
  if (tableCheck.rows.length === 0) {
    console.log('Deploying initial schema...');
    await runSchema(activePool);
  }

  console.log('✓ Embedded PostgreSQL is ready and active.');

  return activePool;
}

/** Close the pool and, when this process started it, the embedded PostgreSQL. */
export async function closeDatabase() {
  if (activePool) { try { await activePool.end(); } catch {} }
  if (embeddedPostgresInstance) {
    console.log('Stopping embedded PostgreSQL...');
    try { await embeddedPostgresInstance.stop(); } catch {}
  }
}
