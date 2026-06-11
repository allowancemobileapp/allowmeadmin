import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL || "postgresql://postgres.quuazutreaitqoquzolg:James2002eze%23@aws-0-eu-central-1.pooler.supabase.com:5432/postgres" });
async function run() {
  const result = await pool.query("SELECT id, amount_paid FROM gists WHERE amount_paid IS NOT NULL LIMIT 5");
  console.log('Gists:', result.rows);
  const fix = await pool.query("UPDATE ticket_purchases SET amount_paid = 5000 WHERE amount_paid = 50000 RETURNING *");
  console.log('Fixed Ticket:', fix.rows);
  process.exit();
}
run();
