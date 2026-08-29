require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL.split('?')[0], ssl: { rejectUnauthorized: false } });

async function run() {
  const { rows } = await pool.query("SELECT id, items FROM options WHERE id IN (661, 662)");
  
  for (const row of rows) {
    let items = typeof row.items === 'string' ? JSON.parse(row.items) : row.items;
    
    // Process items
    let newItems = [];
    for (const item of items) {
      if (item.name === 'Pack') {
        newItems.push(item);
        continue;
      }
      const mealRes = await pool.query("SELECT id FROM meals WHERE name = $1 LIMIT 1", [item.name]);
      item.meal_id = mealRes.rows.length > 0 ? mealRes.rows[0].id : null;
      newItems.push(item);
    }
    
    // Ensure Pack exists
    if (!newItems.find(i => i.name === 'Pack')) {
      newItems.push({ name: 'Pack', category: 'packaging', price: 200, quantity: 1, portion: null, meal_id: 0 });
    }
    
    await pool.query("UPDATE options SET items = $1 WHERE id = $2", [JSON.stringify(newItems), row.id]);
  }
  
  console.log("Records updated!");
  process.exit(0);
}

run().catch(console.error);
