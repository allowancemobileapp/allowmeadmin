require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL.split('?')[0], ssl: { rejectUnauthorized: false } });
pool.query("SELECT id, combo_description, group_id FROM options WHERE group_id IS NOT NULL ORDER BY id DESC LIMIT 5").then(res => { console.log(res.rows); process.exit(0); });
