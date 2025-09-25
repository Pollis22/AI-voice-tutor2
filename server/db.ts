import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

// Database configuration with proper SSL handling
if (!process.env.DATABASE_URL) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL must be set in production');
  }
  console.log("No DATABASE_URL found - using dummy connection for testing");
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/testdb";
}

// Configure pool with secure SSL handling
const connectionConfig: any = {
  connectionString: process.env.DATABASE_URL,
};

// Only configure SSL if explicitly enabled
if (process.env.DATABASE_SSL === 'true') {
  connectionConfig.ssl = {
    rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false'
  };
} else if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL.includes('localhost')) {
  // Default to SSL in production for remote databases
  connectionConfig.ssl = { rejectUnauthorized: true };
}

export const pool = new Pool(connectionConfig);
export const db = drizzle({ client: pool, schema });