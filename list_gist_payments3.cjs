const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
pool.query("SELECT id, paid, amount_paid, payment_reference, status, created_at FROM gists WHERE payment_reference NOT LIKE 'coupon%' AND payment_reference IS NOT NULL LIMIT 20").then(res => { console.log(res.rows); process.exit(0); });
