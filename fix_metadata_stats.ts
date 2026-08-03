import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

content = content.replace(
  `       total_schools,
       total_revenue,
       revenue_today
    });`,
  `       total_schools,
       total_revenue,
       revenue_today,
       total_stores,
       active_stores,
       total_services,
       active_services
    });`
);

content = content.replace(
  `    // Tickets`,
  `    // Stores
    let total_stores = 0;
    let active_stores = 0;
    try {
       const storesRes = await pool.query("SELECT COUNT(*) as total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active FROM stores");
       total_stores = parseInt(storesRes.rows[0].total) || 0;
       active_stores = parseInt(storesRes.rows[0].active) || 0;
    } catch(e) {}

    // Services
    let total_services = 0;
    let active_services = 0;
    try {
       const servicesRes = await pool.query("SELECT COUNT(*) as total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active FROM services");
       total_services = parseInt(servicesRes.rows[0].total) || 0;
       active_services = parseInt(servicesRes.rows[0].active) || 0;
    } catch(e) {}

    // Tickets`
);

fs.writeFileSync('server.ts', content);
