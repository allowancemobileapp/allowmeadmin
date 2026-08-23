const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
pool.query(`
  SELECT id::text, 'Gist' as type, COALESCE(amount_paid, total_price, 0) as amount, status, payment_reference as reference, user_id::text as user_email, created_at 
  FROM gists
  WHERE ((amount_paid IS NOT NULL AND amount_paid > 0) OR paid = true)
    AND (payment_reference IS NULL OR payment_reference NOT ILIKE 'coupon%')
`).then(res => { console.log(res.rows); process.exit(0); });
