const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
pool.query("SELECT * FROM system_logs LIMIT 1").then(res => { console.log(JSON.stringify(res.rows, null, 2)); process.exit(0); });
