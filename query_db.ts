import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  try {
    const res = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    console.log(res.rows.map(r => r.table_name).join(', '));
    pool.end();
  } catch (e) { console.error(e); }
}
run();
