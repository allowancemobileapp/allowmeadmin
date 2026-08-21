const { Pool } = require('pg');
const pool = new Pool({
  connectionString: "postgresql://postgres:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"
});
async function run() {
  try {
    console.log("Testing stores...");
    const res = await pool.query(`
      SELECT s.*, p.username as owner_username 
      FROM stores s 
      LEFT JOIN profiles p ON s.owner_id = p.id 
      WHERE s.status IN ('pending', 'draft') 
      ORDER BY s.created_at DESC
    `);
    console.log("Stores query successful, count:", res.rows.length);
  } catch(e) { console.error("Stores error:", e); }

  try {
    console.log("Testing services...");
    const res = await pool.query(`
      SELECT s.*, p.username as owner_username 
      FROM services s 
      LEFT JOIN profiles p ON COALESCE(s.owner_id, s.provider_id) = p.id 
      WHERE s.status IN ('pending', 'draft') 
      ORDER BY s.created_at DESC
    `);
    console.log("Services query successful, count:", res.rows.length);
  } catch(e) { console.error("Services error:", e); }

  process.exit(0);
}
run();
