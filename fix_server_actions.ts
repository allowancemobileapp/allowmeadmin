import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

content = content.replace(
  `} else if (action === 'verify') {
      if (!isPlus || !hasCac) {
        return res.status(400).json({ error: "Store cannot be verified. Owner must be a Plus user and have uploaded CAC credentials." });
      }
      // Also approve it if they verify it
      await pool.query("UPDATE stores SET is_plus_verified = true, status = 'active' WHERE id = $1", [storeId]);
    } else if (action === 'reject') {`,
  `} else if (action === 'verify') {
      if (!isPlus || !hasCac) {
        return res.status(400).json({ error: "Store cannot be verified. Owner must be a Plus user and have uploaded CAC credentials." });
      }
      // Also approve it if they verify it
      await pool.query("UPDATE stores SET is_plus_verified = true, status = 'active' WHERE id = $1", [storeId]);
    } else if (action === 'revoke') {
      await pool.query("UPDATE stores SET is_plus_verified = false WHERE id = $1", [storeId]);
    } else if (action === 'suspend') {
      await pool.query("UPDATE stores SET status = 'suspended', is_plus_verified = false WHERE id = $1", [storeId]);
    } else if (action === 'reject') {`
);

content = content.replace(
  `} else if (action === 'reject') {
      await pool.query("UPDATE services SET status = 'rejected' WHERE id = $1", [serviceId]);
    }`,
  `} else if (action === 'reject') {
      await pool.query("UPDATE services SET status = 'rejected' WHERE id = $1", [serviceId]);
    } else if (action === 'suspend') {
      await pool.query("UPDATE services SET status = 'suspended' WHERE id = $1", [serviceId]);
    }`
);

fs.writeFileSync('server.ts', content);
