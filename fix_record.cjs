require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL.split('?')[0],
  ssl: { rejectUnauthorized: false }
});

pool.query(`
  UPDATE options 
  SET signature = 'Ofada rice (Three-Quarter), Diced Plantain x3, Moi Moi(leaf) x1, Boiled egg x2, Fried beef x2, Sausage x3 + Pack'
  WHERE id = 661
`)
  .then(() => {
    console.log('Record updated successfully!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Error applying trigger:', err);
    process.exit(1);
  });
