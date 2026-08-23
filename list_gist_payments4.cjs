const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
pool.query("SELECT id, paid, amount_paid, total_price, payment_reference, status FROM gists WHERE payment_reference IS NOT NULL OR amount_paid > 0 OR total_price > 0 LIMIT 10").then(res => { console.log(res.rows); process.exit(0); });
