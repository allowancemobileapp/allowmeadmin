const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'gists'").then(res => { console.log(res.rows); process.exit(0); });
