import { createOrOpenDb, resetDbDirectory, runMigrations } from '../lib/revenue/services/db';

async function main() {
  console.log('Resetting local Postgres (PGlite) database...');
  await resetDbDirectory();
  const db = await createOrOpenDb();
  const executed = await runMigrations(db);
  await db.close();
  console.log(`Database reset complete. Applied ${executed.length} migrations:`, executed.join(', '));
}

main().catch((err) => {
  console.error('db:reset failed:', err);
  process.exit(1);
});
