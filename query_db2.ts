import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  try {
    const res1 = await pool.query("SELECT * FROM service_offerings LIMIT 5");
    console.log("service_offerings:", res1.rows);
    const res2 = await pool.query("SELECT * FROM service_catalog LIMIT 5");
    console.log("service_catalog:", res2.rows);
    pool.end();
  } catch (e) { console.error(e); }
}
run();
