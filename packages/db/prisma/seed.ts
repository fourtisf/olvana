/**
 * Seeds the default blue-chip collateral classes (HANDOFF §5). Symbols only —
 * token addresses stay null until verified. Tokenized stocks (mid) are added
 * by an admin at listing time, once their Robinhood Chain symbols are known.
 */
import { DEFAULT_BLUE_CHIP_SYMBOLS } from '@olvana/core/risk';
import { createPrismaClient } from '../src/index';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const db = createPrismaClient(url);
try {
  for (const symbol of DEFAULT_BLUE_CHIP_SYMBOLS) {
    await db.collateralClass.upsert({
      where: { symbol },
      create: { symbol, quality: 'blue' },
      update: {},
    });
  }
  console.log(`Seeded ${DEFAULT_BLUE_CHIP_SYMBOLS.length} blue-chip collateral classes.`);
} finally {
  await db.$disconnect();
}
