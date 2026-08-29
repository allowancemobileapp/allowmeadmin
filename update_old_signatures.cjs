require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL.split('?')[0], ssl: { rejectUnauthorized: false } });

async function run() {
  const { rows } = await pool.query("SELECT id, items FROM options WHERE id IN (661, 662)");
  
  for (const row of rows) {
    let items = typeof row.items === 'string' ? JSON.parse(row.items) : row.items;
    
    // Sort logic from TS
    const sorted = items
      .filter(i => i.name !== 'Pack')
      .map(item => `${item.category}:${item.name},${item.portion || item.quantity}`)
      .sort()
      .join('|');
      
    const signature = sorted + (items.find(i => i.name === 'Pack') ? '|Pack' : '');
    
    console.log(`Updating ${row.id} signature to: ${signature}`);
    await pool.query("UPDATE options SET signature = $1 WHERE id = $2", [signature, row.id]);
  }
  
  console.log("Records updated!");
  process.exit(0);
}

run().catch(console.error);
