import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

content = content.replace(
  `app.get('/api/approvals/stores', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(\`
      SELECT s.*, p.username as owner_username 
      FROM stores s 
      LEFT JOIN profiles p ON s.owner_id = p.id 
      WHERE s.status IN ('pending', 'draft') 
      ORDER BY s.created_at DESC
    \`);
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});`,
  `app.get('/api/approvals/stores', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(\`
      SELECT s.*, p.username as owner_username, p.subscription_tier
      FROM stores s 
      LEFT JOIN profiles p ON s.owner_id = p.id 
      WHERE s.status IN ('pending', 'draft') 
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
  `app.post('/api/approvals/stores/:id', requireAdmin, async (req, res) => {
  const { status } = req.body;
  try {
    await pool.query('UPDATE stores SET status = $1 WHERE id = $2', [status, req.params.id]);
    
    // Attempt to log
    try {
      const adminEmail = (req as any).adminEmail || 'unknown';
      await pool.query(
        'INSERT INTO system_logs (type, admin_email, action, details) VALUES ($1, $2, $3, $4)',
        ['admin', adminEmail, \`\${status} store \${req.params.id}\`, JSON.stringify({ status })]
      );
    } catch(e) {}
    
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});`,
  `app.post('/api/approvals/stores/:id/:action', requireAdmin, async (req, res) => {
  const { action } = req.params;
  const storeId = req.params.id;
  try {
    const storeRes = await pool.query(\`
      SELECT s.*, p.subscription_tier 
      FROM stores s 
      LEFT JOIN profiles p ON s.owner_id = p.id 
      WHERE s.id = $1
    \`, [storeId]);
    
    if (storeRes.rows.length === 0) {
      return res.status(404).json({ error: "Store not found" });
    }
    const store = storeRes.rows[0];

    const credsRes = await pool.query("SELECT * FROM store_credentials WHERE store_id = $1 AND kind = 'cac'", [storeId]);
    const hasCac = credsRes.rows.length > 0;
    const isPlus = store.subscription_tier === 'Membership';

    if (action === 'approve') {
      if (!isPlus || !hasCac) {
        return res.status(400).json({ error: "Store cannot be approved. Owner must be a Plus user and have uploaded CAC credentials." });
      }
      await pool.query("UPDATE stores SET status = 'active' WHERE id = $1", [storeId]);
    } else if (action === 'verify') {
      if (!isPlus || !hasCac) {
        return res.status(400).json({ error: "Store cannot be verified. Owner must be a Plus user and have uploaded CAC credentials." });
      }
      await pool.query("UPDATE stores SET is_plus_verified = true WHERE id = $1", [storeId]);
    } else if (action === 'reject') {
      await pool.query("UPDATE stores SET status = 'rejected' WHERE id = $1", [storeId]);
    }

    // Attempt to log
    try {
      const adminEmail = (req as any).adminEmail || 'unknown';
      await pool.query(
        'INSERT INTO system_logs (type, admin_email, action, details) VALUES ($1, $2, $3, $4)',
        ['admin', adminEmail, \`\${action} store \${storeId}\`, JSON.stringify({ action })]
      );
    } catch(e) {}
    
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/approvals/stores/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM stores WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});`
);

content = content.replace(
  `app.get('/api/approvals/services', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(\`
      SELECT s.*, p.username as owner_username 
      FROM services s 
      LEFT JOIN profiles p ON COALESCE(s.owner_id, s.provider_id) = p.id 
      WHERE s.status IN ('pending', 'draft') 
      ORDER BY s.created_at DESC
    \`);
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});`,
  `app.get('/api/approvals/services', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(\`
      SELECT s.*, p.username as owner_username, p.subscription_tier
      FROM services s 
      LEFT JOIN profiles p ON COALESCE(s.owner_id, s.provider_id) = p.id 
      WHERE s.status IN ('pending', 'draft') 
      ORDER BY s.created_at DESC
    \`);
    const services = result.rows;
    for (let service of services) {
      // Fetch offerings based on the new schema step 3
      const prods = await pool.query('SELECT * FROM service_offerings WHERE service_id = $1', [service.id]);
      service.offerings = prods.rows;
    }
    res.json(services);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});`
);

content = content.replace(
  `app.post('/api/approvals/services/:id', requireAdmin, async (req, res) => {
  const { status } = req.body;
  try {
    await pool.query('UPDATE services SET status = $1 WHERE id = $2', [status, req.params.id]);
    
    // Attempt to log
    try {
      const adminEmail = (req as any).adminEmail || 'unknown';
      await pool.query(
        'INSERT INTO system_logs (type, admin_email, action, details) VALUES ($1, $2, $3, $4)',
        ['admin', adminEmail, \`\${status} service \${req.params.id}\`, JSON.stringify({ status })]
      );
    } catch(e) {}
    
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});`,
  `app.post('/api/approvals/services/:id/:action', requireAdmin, async (req, res) => {
  const { action } = req.params;
  const serviceId = req.params.id;
  try {
    if (action === 'approve') {
      await pool.query("UPDATE services SET status = 'active' WHERE id = $1", [serviceId]);
    } else if (action === 'reject') {
      await pool.query("UPDATE services SET status = 'rejected' WHERE id = $1", [serviceId]);
    }

    // Attempt to log
    try {
      const adminEmail = (req as any).adminEmail || 'unknown';
      await pool.query(
        'INSERT INTO system_logs (type, admin_email, action, details) VALUES ($1, $2, $3, $4)',
        ['admin', adminEmail, \`\${action} service \${serviceId}\`, JSON.stringify({ action })]
      );
    } catch(e) {}
    
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/approvals/services/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM services WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});`
);

fs.writeFileSync('server.ts', content);
