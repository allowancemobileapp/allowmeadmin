import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

const analyticsRoute = `
// -- Analytics Data for Graphs --
app.get('/api/analytics', requireAdmin, async (req, res) => {
  try {
    const monthsQuery = \`
      WITH months AS (
        SELECT generate_series(
          date_trunc('month', CURRENT_DATE - INTERVAL '11 months'),
          date_trunc('month', CURRENT_DATE),
          '1 month'::interval
        ) as month
      )
      SELECT month FROM months
    \`;
    
    // Users
    const usersQuery = \`
      SELECT date_trunc('month', created_at) as month, COUNT(*) as count
      FROM profiles
      WHERE created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '11 months')
      GROUP BY month
    \`;
    
    // Revenue
    const revenueQuery = \`
      SELECT month, SUM(amount) as amount FROM (
         SELECT date_trunc('month', created_at) as month, COALESCE(SUM(amount / 100), 0) as amount 
         FROM membership_payments 
         WHERE created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '11 months')
         GROUP BY month
         UNION ALL
         SELECT date_trunc('month', created_at) as month, COALESCE(SUM(amount_paid), 0) as amount 
         FROM gists 
         WHERE created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '11 months') AND amount_paid > 0
         GROUP BY month
         UNION ALL
         SELECT date_trunc('month', created_at) as month, COALESCE(SUM(amount_paid), 0) as amount 
         FROM ticket_purchases 
         WHERE created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '11 months') AND amount_paid > 0
         GROUP BY month
      ) sub GROUP BY month
    \`;

    // Stores
    const storesQuery = \`
      SELECT date_trunc('month', created_at) as month, COUNT(*) as count
      FROM stores
      WHERE created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '11 months')
      GROUP BY month
    \`;

    // Services
    const servicesQuery = \`
      SELECT date_trunc('month', created_at) as month, COUNT(*) as count
      FROM services
      WHERE created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '11 months')
      GROUP BY month
    \`;

    const [monthsRes, usersRes, revenueRes, storesRes, servicesRes] = await Promise.all([
      pool.query(monthsQuery),
      pool.query(usersQuery),
      pool.query(revenueQuery),
      pool.query(storesQuery),
      pool.query(servicesQuery)
    ]);

    const data = monthsRes.rows.map(row => {
      const monthStr = row.month.toISOString();
      const userMatch = usersRes.rows.find(u => u.month && u.month.toISOString() === monthStr);
      const revMatch = revenueRes.rows.find(r => r.month && r.month.toISOString() === monthStr);
      const storeMatch = storesRes.rows.find(s => s.month && s.month.toISOString() === monthStr);
      const serviceMatch = servicesRes.rows.find(s => s.month && s.month.toISOString() === monthStr);

      return {
        month: row.month.toLocaleString('default', { month: 'short', year: 'numeric' }),
        users: parseInt(userMatch?.count || 0),
        revenue: parseFloat(revMatch?.amount || 0),
        stores: parseInt(storeMatch?.count || 0),
        services: parseInt(serviceMatch?.count || 0)
      };
    });

    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
`;

content = content.replace(
  '// Vite Middleware and Dev Server Output (local only)',
  analyticsRoute + '\n// Vite Middleware and Dev Server Output (local only)'
);

fs.writeFileSync('server.ts', content);
