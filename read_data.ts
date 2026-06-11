import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL || "postgresql://postgres.quuazutreaitqoquzolg:James2002eze%23@aws-0-eu-central-1.pooler.supabase.com:5432/postgres" });
async function run() {
  const result = await pool.query("SELECT * FROM tickets LIMIT 1");
  console.log(result.rows);
  const result2 = await pool.query("SELECT * FROM gists LIMIT 1");
  console.log(result2.rows);
  process.exit();
}
run();
