import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL?.split('?')[0],
  ssl: { rejectUnauthorized: false }
});

async function check() {
  try {
    const res = await pool.query("SELECT count(*) FROM profiles;");
    console.log("Profiles count:", res.rows[0].count);
    
    const tablesRes = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log("Tables:", tablesRes.rows.map(r => r.table_name).join(", "));
  } catch (e) {
    console.error("DB Error:", e);
  } finally {
    pool.end();
  }
}
check();
