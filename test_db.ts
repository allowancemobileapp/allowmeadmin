import { Pool } from "pg";
const connectionString = "postgresql://postgres:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres";
const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});
pool.query('SELECT 1').then(() => console.log('success')).catch(e => console.error(e));
