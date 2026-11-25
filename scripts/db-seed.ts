import { createOrOpenDb, runMigrations } from '../lib/revenue/services/db';
import { seedFromExcel2571 } from '../lib/revenue/services/seed';

async function main() {
  console.log('Opening database & ensuring migrations are up to date...');
  const db = await createOrOpenDb();
  await runMigrations(db);

  console.log('Seeding database from reference/Revenue_Estimate_Template2571.xlsx...');
  const summary = await seedFromExcel2571(db);
  await db.close();

  console.log('Seed completed successfully:');
  console.table(summary);
}

main().catch((err) => {
  console.error('db:seed failed:', err);
  process.exit(1);
});
