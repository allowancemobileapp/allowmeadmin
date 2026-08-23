const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
pool.query(`
  SELECT *
  FROM ticket_purchases
`).then(res => { console.log(res.rows); process.exit(0); });
