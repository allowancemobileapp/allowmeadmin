import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

content = content.replace(
  `    if (action === 'approve') {
      if (!isPlus || !hasCac) {
        return res.status(400).json({ error: "Store cannot be approved. Owner must be a Plus user and have uploaded CAC credentials." });
      }
      await pool.query("UPDATE stores SET status = 'active' WHERE id = $1", [storeId]);
    } else if (action === 'verify') {
      if (!isPlus || !hasCac) {
        return res.status(400).json({ error: "Store cannot be verified. Owner must be a Plus user and have uploaded CAC credentials." });
      }
      await pool.query("UPDATE stores SET is_plus_verified = true WHERE id = $1", [storeId]);
    }`,
  `    if (action === 'approve') {
      // Just approve it - take it out of review
      await pool.query("UPDATE stores SET status = 'active' WHERE id = $1", [storeId]);
    } else if (action === 'verify') {
      if (!isPlus || !hasCac) {
        return res.status(400).json({ error: "Store cannot be verified. Owner must be a Plus user and have uploaded CAC credentials." });
      }
      // Also approve it if they verify it
      await pool.query("UPDATE stores SET is_plus_verified = true, status = 'active' WHERE id = $1", [storeId]);
    }`
);

fs.writeFileSync('server.ts', content);
