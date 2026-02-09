/**
 * Database seeding script
 * Run manually to populate database with default assets
 * 
 * Usage:
 *   cd backend && npx tsx src/db/seed.ts
 *   
 * Or set environment:
 *   DATABASE_PATH=/path/to/db npx tsx src/db/seed.ts
 */

import { initDB, run, query, saveDB } from './index.js';
import { defaultAssets } from './seeds.js';

async function seedDatabase() {
  console.log('🌱 Starting database seeding...\n');
  
  // Initialize database connection
  await initDB();
  
  // Check existing assets
  const existingAssets = query('SELECT COUNT(*) as count FROM assets')[0] as { count: number };
  console.log(`Current assets in database: ${existingAssets.count}`);
  
  if (existingAssets.count > 0) {
    console.log('\n⚠️  Database already contains assets.');
    console.log('   Use --force to seed anyway (may cause duplicates).\n');
    process.exit(0);
  }
  
  // Seed assets
  console.log(`\n📦 Seeding ${defaultAssets.length} default assets...\n`);
  
  let successCount = 0;
  let skipCount = 0;
  
  for (const asset of defaultAssets) {
    try {
      run(
        'INSERT INTO assets (symbol, name, type, exchange, currency) VALUES (?, ?, ?, ?, ?)',
        [asset.symbol, asset.name, asset.type, asset.exchange || null, asset.currency]
      );
      successCount++;
      console.log(`  ✅ ${asset.symbol} - ${asset.name}`);
    } catch (error: any) {
      if (error.message?.includes('UNIQUE')) {
        skipCount++;
        console.log(`  ⏭️  ${asset.symbol} - already exists`);
      } else {
        console.log(`  ❌ ${asset.symbol} - ${error.message}`);
      }
    }
  }
  
  saveDB();
  
  console.log(`\n✅ Seeding complete!`);
  console.log(`   Added: ${successCount}`);
  console.log(`   Skipped: ${skipCount}`);
  console.log(`   Total: ${defaultAssets.length}\n`);
  
  process.exit(0);
}

// Handle --force flag
const forceMode = process.argv.includes('--force');
if (forceMode) {
  console.log('⚠️  Force mode enabled - may create duplicates\n');
}

seedDatabase().catch(error => {
  console.error('❌ Seeding failed:', error);
  process.exit(1);
});
