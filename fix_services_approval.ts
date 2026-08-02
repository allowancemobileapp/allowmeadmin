import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

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
    let newStatus = action;
    if (action === 'approve') newStatus = 'active';
    else if (action === 'suspend') newStatus = 'suspended';
    else if (action === 'reject') newStatus = 'rejected';

    await pool.query('UPDATE services SET status = $1 WHERE id = $2', [newStatus, serviceId]);
    
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
});`
);

fs.writeFileSync('server.ts', content);
