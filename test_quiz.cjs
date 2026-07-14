const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres.quuazutreaitqoquzolg:James2002eze%23@aws-0-eu-central-1.pooler.supabase.com:5432/postgres'
});
async function run() {
  const res = await pool.query("SELECT * FROM library_materials ORDER BY id DESC LIMIT 1");
  console.log(res.rows[0]);
  process.exit(0);
}
run();
