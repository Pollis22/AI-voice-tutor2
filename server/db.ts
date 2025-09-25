import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

// For testing/development mode, allow dummy database URL
if (!process.env.DATABASE_URL) {
  console.log("No DATABASE_URL found - using dummy connection for testing");
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/testdb";
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle({ client: pool, schema });