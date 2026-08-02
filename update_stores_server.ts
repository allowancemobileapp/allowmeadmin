import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

content = content.replace(
  `app.get('/api/stores', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT s.*, p.username, p.full_name as owner_name FROM stores s LEFT JOIN profiles p ON s.owner_id = p.id ORDER BY s.created_at DESC');
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});`,
  `app.get('/api/stores', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(\`
      SELECT s.*, p.username, p.username as owner_username, p.full_name as owner_name, p.subscription_tier 
      FROM stores s 
      LEFT JOIN profiles p ON s.owner_id = p.id 
      ORDER BY s.created_at DESC
    \`);
    const stores = result.rows;
    for (let store of stores) {
      const creds = await pool.query('SELECT * FROM store_credentials WHERE store_id = $1', [store.id]);
      store.credentials = creds.rows;
      
      const prods = await pool.query('SELECT * FROM store_products WHERE store_id = $1', [store.id]);
      store.products = prods.rows;
    }
    res.json(stores);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});`
);

content = content.replace(
  `app.get('/api/services', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT s.*, p.username, p.full_name as owner_name FROM services s LEFT JOIN profiles p ON COALESCE(s.owner_id, s.provider_id) = p.id ORDER BY s.created_at DESC');
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});`,
  `app.get('/api/services', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(\`
      SELECT s.*, p.username, p.username as owner_username, p.full_name as owner_name, p.subscription_tier 
      FROM services s 
      LEFT JOIN profiles p ON COALESCE(s.owner_id, s.provider_id) = p.id 
      ORDER BY s.created_at DESC
    \`);
    const services = result.rows;
    for (let service of services) {
      const prods = await pool.query('SELECT * FROM service_offerings WHERE service_id = $1', [service.id]);
      service.offerings = prods.rows;
    }
    res.json(services);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});`
);

fs.writeFileSync('server.ts', content);
