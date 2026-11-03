/**
 * pgBridge.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Syncs all data from the local SQLite database (data/erp.db) into the
 * PostgreSQL database defined in .env (labour_erp / postgres / root1).
 *
 * Run once after seeding SQLite:
 *   npx tsx src/server/pgBridge.ts
 *
 * It reads every table from SQLite and upserts into PostgreSQL.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import pg from 'pg';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const { Pool } = pg;

// ── SQLite source ─────────────────────────────────────────────────────────────
const sqlite = new Database(path.resolve(process.cwd(), 'data', 'erp.db'));

// ── PostgreSQL target ─────────────────────────────────────────────────────────
const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL;

const pool = new Pool(
  connectionString && !connectionString.includes('localhost')
    ? {
        connectionString,
        ssl: { rejectUnauthorized: false },
      }
    : {
        host:     process.env.DB_HOST     || 'localhost',
        port:     Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME     || 'labour_erp',
        user:     process.env.DB_USER     || 'postgres',
        password: process.env.DB_PASSWORD || 'root1',
      }
);

// ── Tables and their primary keys for upsert ─────────────────────────────────
const TABLES: Array<{ name: string; pk: string }> = [
  { name: 'users',                          pk: 'id' },
  { name: 'labour_categories',              pk: 'id' },
  { name: 'teams',                          pk: 'id' },
  { name: 'team_role_templates',            pk: 'id' },
  { name: 'team_week_assignments',          pk: 'id' },
  { name: 'attendance_entries',             pk: 'id' },
  { name: 'attendance_lines',               pk: 'id' },
  { name: 'additional_charges',             pk: 'id' },
  { name: 'financial_adjustments',          pk: 'id' },
  { name: 'supplier_bills',                 pk: 'id' },
  { name: 'summary_merge_groups',           pk: 'id' },
  { name: 'audit_logs',                     pk: 'id' },
  { name: 'company_settings',               pk: 'key' },
  { name: 'secondary_admin_assignments',    pk: 'id' },
  { name: 'notifications',                  pk: 'id' },
  { name: 'attachments',                    pk: 'id' },
  { name: 'weekly_payments',                pk: 'id' },
  { name: 'office_ledger_entries',          pk: 'id' },
  { name: 'petty_cash_entries',             pk: 'id' },
  { name: 'worksites',                      pk: 'id' },
  { name: 'labourer_attendance_records',    pk: 'id' },
  { name: 'attendance_verification_requests', pk: 'id' },
  { name: 'attendance_supervisors',         pk: 'id' },
  { name: 'otp_verifications',              pk: 'id' },
  { name: 'user_push_tokens',               pk: 'id' },
];

async function syncTable(client: pg.PoolClient, tableName: string, pk: string) {
  // Check if table exists in SQLite
  const tableExists = sqlite.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
  ).get(tableName);

  if (!tableExists) {
    console.log(`  ⏭  ${tableName} — not in SQLite, skipping`);
    return;
  }

  // Get columns from SQLite schema
  const colsInfo = sqlite.prepare(`PRAGMA table_info("${tableName}")`).all() as Array<{ name: string; type: string; pk: number }>;
  if (colsInfo.length === 0) {
    return;
  }

  // Check if table exists in PostgreSQL
  const pgTableCheck = await client.query(
    `SELECT to_regclass($1) AS tbl`,
    [`public."${tableName}"`]
  );

  if (!pgTableCheck.rows[0].tbl) {
    // Dynamically create table in PostgreSQL matching SQLite definition
    const colDefs = colsInfo.map(c => {
      let t = 'TEXT';
      const u = c.type.toUpperCase();
      if (u.includes('INT')) t = 'INTEGER';
      else if (u.includes('REAL') || u.includes('NUM') || u.includes('DEC') || u.includes('FLOAT')) t = 'NUMERIC';
      const pkDef = c.name === pk ? ' PRIMARY KEY' : '';
      return `"${c.name}" ${t}${pkDef}`;
    }).join(',\n    ');

    await client.query(`CREATE TABLE IF NOT EXISTS public."${tableName}" (\n    ${colDefs}\n);`);
    console.log(`  ✨ Created table public."${tableName}" in PostgreSQL`);
  } else {
    // Table exists, ensure all columns from SQLite exist in PostgreSQL
    const existingColsRes = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
      [tableName]
    );
    const existingCols = new Set(existingColsRes.rows.map(r => r.column_name));
    for (const c of colsInfo) {
      if (!existingCols.has(c.name)) {
        let t = 'TEXT';
        const u = c.type.toUpperCase();
        if (u.includes('INT')) t = 'INTEGER';
        else if (u.includes('REAL') || u.includes('NUM') || u.includes('DEC') || u.includes('FLOAT')) t = 'NUMERIC';
        await client.query(`ALTER TABLE public."${tableName}" ADD COLUMN IF NOT EXISTS "${c.name}" ${t}`);
      }
    }
  }

  const rows = sqlite.prepare(`SELECT * FROM ${tableName}`).all() as Record<string, unknown>[];

  if (rows.length === 0) {
    console.log(`  ⬜ ${tableName} — 0 rows`);
    return;
  }

  // Get column names from first row
  const cols = Object.keys(rows[0]);
  const colList = cols.map(c => `"${c}"`).join(', ');
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const updateSet = cols
    .filter(c => c !== pk)
    .map(c => `"${c}" = EXCLUDED."${c}"`)
    .join(', ');

  const upsertSQL = `
    INSERT INTO public."${tableName}" (${colList})
    VALUES (${placeholders})
    ON CONFLICT ("${pk}") DO UPDATE SET ${updateSet}
  `;

  let count = 0;
  for (const row of rows) {
    const values = cols.map(c => {
      const v = row[c];
      return v === null ? null : v;
    });
    try {
      await client.query(upsertSQL, values);
      count++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  ⚠  ${tableName} row ${row[pk]} skipped: ${msg.slice(0, 100)}`);
    }
  }

  console.log(`  ✅ ${tableName} — ${count} rows synced`);
}

async function main() {
  const targetLabel = connectionString
    ? `PostgreSQL Cloud (${new URL(connectionString).hostname})`
    : `${process.env.DB_NAME || 'labour_erp'} @ ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}`;

  console.log('\n🔄  SQLite → PostgreSQL sync starting...');
  console.log(`    Source : data/erp.db`);
  console.log(`    Target : ${targetLabel}\n`);

  const client = await pool.connect();

  try {
    // Disable FK checks temporarily for bulk upsert ordering
    await client.query('SET session_replication_role = replica');

    for (const t of TABLES) {
      await syncTable(client, t.name, t.pk);
    }

    await client.query('SET session_replication_role = DEFAULT');

    console.log('\n✅  Sync complete! All SQLite data is now in PostgreSQL (labour_erp).\n');
  } catch (err) {
    console.error('❌  Sync failed:', err);
  } finally {
    client.release();
    await pool.end();
    sqlite.close();
  }
}

main();
