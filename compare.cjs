require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL.split('?')[0],
  ssl: { rejectUnauthorized: false }
});

pool.query("SELECT id, signature, items FROM options WHERE id IN (660, 661)")
  .then(res => {
    console.log(JSON.stringify(res.rows, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
