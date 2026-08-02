import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres' });
async function main() {
  const storeRes = await pool.query(`
      SELECT s.*, p.subscription_tier 
      FROM stores s 
      LEFT JOIN profiles p ON s.owner_id = p.id 
      WHERE s.status IN ('pending', 'draft')
    `);
  console.log(storeRes.rows);
  pool.end();
}
main();
