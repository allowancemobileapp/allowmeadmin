require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL.split('?')[0],
  ssl: { rejectUnauthorized: false }
});

pool.query("SELECT column_name, column_default, data_type FROM information_schema.columns WHERE table_name = 'options'")
  .then(res => {
    console.table(res.rows);
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
