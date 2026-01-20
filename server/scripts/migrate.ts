
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from "ws";
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' }); // Load prod credentials

neonConfig.webSocketConstructor = ws;

async function runMigrations() {
    console.log('📦 Starting Database Migration...');

    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL is not set');
    }

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const db = drizzle(pool);

    try {
        console.log('⏳ Running migrations...');
        await migrate(db, { migrationsFolder: "drizzle" });
        console.log('✅ Migrations completed successfully!');
    } catch (err) {
        console.error('❌ Migration Failed:', err);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runMigrations();
