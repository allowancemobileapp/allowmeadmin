require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL.split('?')[0], ssl: { rejectUnauthorized: false } });
pool.query("SELECT * FROM vendors WHERE id IN (1, 2, 6, 56)").then(res => { console.log(JSON.stringify(res.rows[0], null, 2)); process.exit(0); });
