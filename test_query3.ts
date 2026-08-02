import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres' });
async function main() {
  const credsRes = await pool.query("SELECT * FROM store_credentials LIMIT 1");
  console.log(credsRes.rows);
  pool.end();
}
main();
