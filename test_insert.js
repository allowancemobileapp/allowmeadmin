const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});
async function run() {
  try {
    await pool.query("INSERT INTO system_logs (type, admin_email, action, details) VALUES ('admin', 'test@test.com', 'test', '{}')");
    console.log("Success");
  } catch (e) {
    console.error(e);
  }
}
run();
