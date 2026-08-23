const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function processAll() {
  const subs = await pool.query("SELECT * FROM feed_submissions WHERE status = 'pending'");
  for (let sub of subs.rows) {
     const res = await fetch('http://localhost:3000/api/approvals/feed-submissions/' + sub.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-admin-email': 'allowancemobileapp@gmail.com' },
        body: JSON.stringify({ status: 'approved' })
     });
     console.log("Processed:", sub.id, await res.json());
  }
  process.exit(0);
}
processAll();
