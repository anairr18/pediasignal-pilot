import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import ws from "ws";
import * as schema from "@shared/schema";
import dotenv from "dotenv";
import pg from 'pg';

// Load environment variables
dotenv.config({ path: ".env.local" });

neonConfig.webSocketConstructor = ws;

// Check if DATABASE_URL is available
if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL not set - running without database connection");
  console.warn("Create .env.local with DATABASE_URL for full functionality");
}

// Create a fallback database interface when DATABASE_URL is not available
const createFallbackDB = () => {
  return {
    insert: (table: any) => ({
      values: () => ({
        returning: () => {
          // Default fallback
          return [{ id: Math.floor(Math.random() * 1000000) }];
        },
        onConflictDoNothing: () => ({})
      })
    }),
    select: () => ({
      from: (table: any) => {
        const chain: any = {
          where: () => chain,
          limit: () => chain, // Limit updates chain but we return data on await
          orderBy: () => chain,
          // Make it awaitable
          then: (resolve: any) => {
            if (table === schema.kbPassages) {
              resolve([{
                id: 1,
                caseId: "aliem_case_01_anaphylaxis",
                text: "Epinephrine is the first-line treatment for anaphylaxis. Dose: 0.01 mg/kg IM.",
                sourceCitation: "ALiEM Guidelines",
                tags: ['critical_actions'],
                section: 'critical_actions',
                combinedScore: 0.95
              }]);
            } else if (table === schema.pubmedArticles) {
              resolve([]);
            } else {
              resolve([]);
            }
          }
        };
        return chain;
      }
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: () => []
        })
      })
    }),
    delete: () => ({
      where: () => ({})
    })
  };
};

const isLocal = process.env.DATABASE_URL?.includes("localhost") || process.env.DATABASE_URL?.includes("127.0.0.1");

export const pool = process.env.DATABASE_URL
  ? (isLocal ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : new Pool({ connectionString: process.env.DATABASE_URL }))
  : null;

export const db = process.env.DATABASE_URL && pool
  ? (isLocal ? drizzlePg(pool as pg.Pool, { schema }) : drizzle(pool as Pool, { schema }))
  : createFallbackDB();