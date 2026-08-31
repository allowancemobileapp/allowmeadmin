require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL.split('?')[0], ssl: { rejectUnauthorized: false } });
pool.query("SELECT * FROM food_groups LIMIT 10").then(res => { console.table(res.rows); process.exit(0); });
