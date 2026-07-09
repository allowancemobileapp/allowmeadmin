const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres.quuazutreaitqoquzolg:James2002eze%23@aws-0-eu-central-1.pooler.supabase.com:5432/postgres'
});
async function run() {
  const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
  console.log("tables:", tables.rows.map(r => r.table_name));
  
  if (tables.rows.some(r => r.table_name === 'stories')) {
    const stories = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'stories'");
    console.log("stories:", stories.rows);
  }
  if (tables.rows.some(r => r.table_name === 'tickets')) {
    const tickets = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'tickets'");
    console.log("tickets:", tickets.rows);
  }
  process.exit(0);
}
run();
