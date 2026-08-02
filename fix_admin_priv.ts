import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

content = content.replace(
  `    if (action === 'approve') {`,
  `    const currentEmail = (req.headers['x-admin-email'] as string || '').toLowerCase();
    
    if ((action === 'verify' || action === 'revoke') && currentEmail !== 'allowancemobileapp@gmail.com') {
      return res.status(403).json({ error: "Only the root admin (allowancemobileapp@gmail.com) can verify or revoke stores." });
    }

    if (action === 'approve') {`
);

fs.writeFileSync('server.ts', content);
