import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

content = content.replace(
  "const prods = await pool.query('SELECT * FROM service_offerings WHERE service_id = $1', [service.id]);",
  "const prods = await pool.query('SELECT * FROM service_catalog WHERE service_id = $1', [service.id]);"
);

fs.writeFileSync('server.ts', content);
