const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres.quuazutreaitqoquzolg:James2002eze%23@aws-0-eu-central-1.pooler.supabase.com:5432/postgres'
});
async function run() {
  const gists = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'gists'");
  console.log("gists:", gists.rows);
  const moments = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'moments'");
  console.log("moments:", moments.rows);
  process.exit(0);
}
run();
