import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

content = content.replace(
  `} else if (action === 'verify') {
      if (!isPlus || !hasCac) {
        return res.status(400).json({ error: "Store cannot be verified. Owner must be a Plus user and have uploaded CAC credentials." });
      }
      // Also approve it if they verify it
      await pool.query("UPDATE stores SET is_plus_verified = true, status = 'active' WHERE id = $1", [storeId]);
    } else if (action === 'revoke') {`,
  `} else if (action === 'verify') {
      // Allow admin to bypass strict checks and verify
      await pool.query("UPDATE stores SET is_plus_verified = true, status = 'active' WHERE id = $1", [storeId]);
    } else if (action === 'revoke') {`
);

fs.writeFileSync('server.ts', content);
