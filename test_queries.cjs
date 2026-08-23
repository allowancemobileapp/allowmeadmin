const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
pool.query(`
      SELECT id::text, 'Gist' as type, COALESCE(amount_paid, total_price, 0) as amount, payment_reference, status, user_id::text as user_email, created_at 
      FROM gists
      WHERE (amount_paid IS NOT NULL AND amount_paid > 0)
         OR paid = true 
         OR payment_reference IS NOT NULL
      ORDER BY created_at DESC LIMIT 5
`).then(res => { console.log(JSON.stringify(res.rows, null, 2)); process.exit(0); });
