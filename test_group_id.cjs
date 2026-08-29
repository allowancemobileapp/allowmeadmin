require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL.split('?')[0], ssl: { rejectUnauthorized: false } });
pool.query("SELECT id, vendor_id, group_id, combo_description FROM options ORDER BY id DESC LIMIT 20").then(res => { console.table(res.rows); process.exit(0); });
