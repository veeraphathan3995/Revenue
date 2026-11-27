import { createOrOpenDb, runMigrations } from '../lib/revenue/services/db';
import { clearAllRevenueData, seedCleanBaseline } from '../lib/revenue/services/seed';

async function main() {
  console.log('Connecting to database...');
  const db = await createOrOpenDb();
  await runMigrations(db);

  console.log('Clearing all transactional data, estimate versions, and extra fiscal years...');
  const summary = await seedCleanBaseline(db, 2571);

  console.log('✅ Database cleared successfully! Initialized clean Fiscal Year 2571 Draft v1 with 0 lines:');
  console.table({
    'Fiscal Year (พ.ศ.)': summary.fiscalYearBe,
    'Tuition Lines': summary.tuitionLinesCount,
    'Service Projects': summary.serviceProjectsCount,
    'Research Projects': summary.researchProjectsCount,
    'Rental Items': summary.rentalItemsCount,
    'Carryover Amount (บาท)': summary.carryoverAmount,
    'Total Revenue (บาท)': 0,
  });

  await db.close();
}

main().catch((err) => {
  console.error('db:clear failed:', err);
  process.exit(1);
});
