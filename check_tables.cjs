require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL.split('?')[0], ssl: { rejectUnauthorized: false } });
pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'").then(res => { console.table(res.rows); process.exit(0); });
