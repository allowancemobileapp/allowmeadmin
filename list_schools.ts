import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL || "postgresql://postgres.quuazutreaitqoquzolg:James2002eze%23@aws-0-eu-central-1.pooler.supabase.com:5432/postgres" });
async function run() {
  const result = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name = 'schools'");
  console.log(result.rows);
  process.exit();
}
run();
