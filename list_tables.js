const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'").then(res => { console.log(res.rows); process.exit(0); });
