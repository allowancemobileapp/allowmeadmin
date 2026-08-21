const { Pool } = require('pg');
const pool = new Pool({
  connectionString: "postgresql://postgres:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"
});
async function run() {
  try {
    const res1 = await pool.query(`
      SELECT s.*, p.username as owner_username 
      FROM stores s 
      LEFT JOIN profiles p ON s.owner_id = p.id 
      WHERE s.status IN ('pending', 'draft') 
      ORDER BY s.created_at DESC
    `);
    console.log("Stores OK, count:", res1.rows.length);
  } catch(e) { console.error("Stores error:", e.message); }

  try {
    const res2 = await pool.query(`
      SELECT s.*, p.username as owner_username 
      FROM services s 
      LEFT JOIN profiles p ON COALESCE(s.owner_id, s.provider_id) = p.id 
      WHERE s.status IN ('pending', 'draft') 
      ORDER BY s.created_at DESC
    `);
    console.log("Services OK, count:", res2.rows.length);
  } catch(e) { console.error("Services error:", e.message); }
  
  process.exit(0);
}
run();
