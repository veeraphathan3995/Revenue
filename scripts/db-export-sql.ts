import fs from 'fs';
import path from 'path';
import { createOrOpenDb, runMigrations } from '../lib/revenue/services/db';
import { seedFromExcel2571 } from '../lib/revenue/services/seed';

function sqlLiteral(val: any): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : 'NULL';
  if (val instanceof Date) return `'${val.toISOString()}'`;
  if (typeof val === 'object') {
    return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
  }
  return `'${String(val).replace(/'/g, "''")}'`;
}

async function exportSql() {
  const db = await createOrOpenDb('memory');
  const migrationFiles = await runMigrations(db);
  await seedFromExcel2571(db);

  const tablesToExport = [
    'profiles',
    'fiscal_years',
    'estimate_versions',
    'parameters',
    'month_distribution',
    'rounding_rules',
    'programs',
    'fee_schedules',
    'tuition_lines',
    'service_projects',
    'research_projects',
    'rental_items',
    'carryover',
    'other_income_lines',
    'allocation_dimensions',
    'allocation_items',
    'allocation_pcts',
    'historical_usage',
  ];

  const seedLines: string[] = [
    '-- =============================================================================',
    '-- supabase/seed.sql',
    '-- Auto-generated SQL Seed Data for Fiscal Year 2571 (CMU Political Science)',
    '-- =============================================================================',
    '',
    'BEGIN;',
    '',
  ];

  for (const table of tablesToExport) {
    const res = await db.query<Record<string, any>>(`SELECT * FROM public.${table} ORDER BY created_at, id`);
    if (res.rows.length === 0) continue;

    seedLines.push(`-- Table: public.${table} (${res.rows.length} rows)`);
    const cols = Object.keys(res.rows[0]);
    const colList = cols.map((c) => `"${c}"`).join(', ');

    for (const row of res.rows) {
      const vals = cols.map((c) => sqlLiteral(row[c])).join(', ');
      seedLines.push(
        `INSERT INTO public.${table} (${colList}) VALUES (${vals}) ON CONFLICT (id) DO NOTHING;`
      );
    }
    seedLines.push('');
  }

  seedLines.push('COMMIT;');
  seedLines.push('');

  const seedSql = seedLines.join('\n');
  const supabaseDir = path.join(process.cwd(), 'supabase');
  const seedPath = path.join(supabaseDir, 'seed.sql');
  fs.writeFileSync(seedPath, seedSql, 'utf-8');

  // Also create full_database_dump.sql (Migrations 0001..0003 + seed.sql)
  const migrationsDir = path.join(supabaseDir, 'migrations');
  const fullDumpParts: string[] = [
    '-- =============================================================================',
    '-- Full Database Schema, RLS Policies, Triggers & Seed Data Dump (FY 2571)',
    '-- =============================================================================',
    '',
  ];
  for (const file of migrationFiles) {
    fullDumpParts.push(`-- >>> MIGRATION: ${file}`);
    fullDumpParts.push(fs.readFileSync(path.join(migrationsDir, file), 'utf-8'));
    fullDumpParts.push('');
  }
  fullDumpParts.push('-- >>> SEED DATA');
  fullDumpParts.push(seedSql);

  const fullDumpPath = path.join(supabaseDir, 'full_database_dump.sql');
  fs.writeFileSync(fullDumpPath, fullDumpParts.join('\n'), 'utf-8');

  await db.close();
  console.log(`Exported SQL seed to ${seedPath} and full dump to ${fullDumpPath}`);
}

exportSql().catch((err) => {
  console.error(err);
  process.exit(1);
});
