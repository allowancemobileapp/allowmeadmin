const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres.quuazutreaitqoquzolg:James2002eze%23@aws-0-eu-central-1.pooler.supabase.com:5432/postgres'
});
async function run() {
  const res = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'profiles'");
  console.log(res.rows);
  process.exit(0);
}
run();
