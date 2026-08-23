const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
pool.query(`
  ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS free_delivery_fee NUMERIC DEFAULT 500;
  ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS plus_delivery_fee NUMERIC DEFAULT 200;
`).then(res => { console.log('Schools updated'); process.exit(0); }).catch(console.error);
