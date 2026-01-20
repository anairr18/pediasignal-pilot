
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
neonConfig.webSocketConstructor = ws;

async function checkState() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
        const res = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public';
    `);
        console.log("=== TABLES IN DB ===");
        res.rows.forEach(r => console.log(`- ${r.table_name}`));

        // Check for drizzle migrations specifically
        const mig = await pool.query(`
      SELECT count(*) as count FROM information_schema.tables 
      WHERE table_name = '__drizzle_migrations';
    `);

        if (mig.rows[0].count > 0) {
            console.log("✅ __drizzle_migrations table found.");
            const rows = await pool.query("SELECT * FROM __drizzle_migrations");
            console.log("Migrations applied:", rows.rows);
        } else {
            console.log("❌ __drizzle_migrations table NOT found.");
        }

    } catch (e) {
        console.error("Diagnosis failed:", e);
    } finally {
        pool.end();
    }
}

checkState();
