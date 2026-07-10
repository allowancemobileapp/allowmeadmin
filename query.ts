import { Pool } from "pg";
const pool = new Pool({
  connectionString: 'postgresql://postgres.quuazutreaitqoquzolg:James2002eze%23@aws-0-eu-central-1.pooler.supabase.com:5432/postgres'
});
async function run() {
  const res = await pool.query("SELECT * FROM system_logs WHERE type = 'admin' ORDER BY created_at DESC LIMIT 2");
  console.log(res.rows);
  process.exit(0);
}
run();
