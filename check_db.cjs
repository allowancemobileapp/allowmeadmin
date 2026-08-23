const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function check() {
  const m = await pool.query("SELECT * FROM meals WHERE name = 'Meat' ORDER BY id DESC LIMIT 1");
  console.log("Meal:", m.rows);
  if (m.rows.length > 0) {
    const v = await pool.query("SELECT * FROM vendor_menus WHERE meal_id = $1", [m.rows[0].id]);
    console.log("Vendor Menu:", v.rows);
  }
  process.exit(0);
}
check();
