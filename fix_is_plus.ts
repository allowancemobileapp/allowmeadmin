import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres' });
async function main() {
  await pool.query("UPDATE stores SET status = 'pending' WHERE id = '0554c5c4-6cb2-46d6-bcc8-b4a74d8f57ca'");
  pool.end();
}
main();
