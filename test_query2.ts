import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres' });
async function main() {
  const credsRes = await pool.query("SELECT * FROM store_credentials WHERE store_id = '0554c5c4-6cb2-46d6-bcc8-b4a74d8f57ca'");
  console.log(credsRes.rows);
  pool.end();
}
main();
