import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

export const DEFAULT_PGLITE_DIR = path.join(process.cwd(), '.pgdata');

export async function createOrOpenDb(dataDir?: string | 'memory'): Promise<PGlite> {
  if (dataDir === 'memory') {
    return new PGlite();
  }
  const targetDir = dataDir ?? DEFAULT_PGLITE_DIR;
  return new PGlite(targetDir);
}

export async function resetDbDirectory(dataDir: string = DEFAULT_PGLITE_DIR): Promise<void> {
  if (fs.existsSync(dataDir)) {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

export async function runMigrations(db: PGlite): Promise<string[]> {
  const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sqlPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(sqlPath, 'utf-8');
    await db.exec(sql);
  }
  return files;
}

/**
 * Helper to execute SQL statements as a specific authenticated user (by profile UUID),
 * enforcing Postgres Row-Level Security via SET LOCAL ROLE authenticated and JWT claim sub.
 */
export async function execAsUser<T = any>(
  db: PGlite,
  userId: string,
  sql: string,
  params: any[] = []
): Promise<{ rows: T[]; affectedRows?: number }> {
  await db.exec('BEGIN');
  try {
    await db.exec(`SET LOCAL ROLE authenticated;`);
    await db.exec(`SELECT set_config('request.jwt.claim.sub', '${userId}', true);`);
    const res = await db.query<T>(sql, params);
    await db.exec('COMMIT');
    return res;
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }
}
