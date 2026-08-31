require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL.split('?')[0], ssl: { rejectUnauthorized: false } });
pool.query("SELECT id, name, is_active FROM vendors WHERE id IN (1, 2, 6, 56)").then(res => { console.table(res.rows); process.exit(0); });
