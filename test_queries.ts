import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  try {
    const res = await pool.query(`
      SELECT date_trunc('month', created_at) as month, COUNT(*) as count 
      FROM profiles 
      GROUP BY month 
      ORDER BY month ASC
    `);
    console.log(res.rows);
    pool.end();
  } catch(e) {
    console.error(e);
  }
}
run();
