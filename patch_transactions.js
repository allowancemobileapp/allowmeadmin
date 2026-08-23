const fs = require('fs');

let server = fs.readFileSync('server.ts', 'utf8');

// Update /api/transactions
server = server.replace(
  `    const memRes = await pool.query(\`
      SELECT id::text, 'Membership' as type, (amount / 100) as amount, tier as status, user_id::text as user_email, created_at 
      FROM membership_payments 
      ORDER BY created_at DESC LIMIT 200
    \`);`,
  `    const memRes = await pool.query(\`
      SELECT id::text, 'Membership' as type, (amount / 100) as amount, tier as status, payment_reference as reference, user_id::text as user_email, created_at 
      FROM membership_payments 
      ORDER BY created_at DESC LIMIT 200
    \`);`
);

server = server.replace(
  `    const gistRes = await pool.query(\`
      SELECT id::text, 'Gist' as type, amount_paid as amount, status, user_id::text as user_email, created_at 
      FROM gists
      WHERE amount_paid IS NOT NULL AND amount_paid > 0
      ORDER BY created_at DESC LIMIT 200
    \`);`,
  `    const gistRes = await pool.query(\`
      SELECT id::text, 'Gist' as type, COALESCE(amount_paid, total_price, 0) as amount, status, payment_reference as reference, user_id::text as user_email, created_at 
      FROM gists
      WHERE (amount_paid IS NOT NULL AND amount_paid > 0) OR paid = true OR payment_reference IS NOT NULL
      ORDER BY created_at DESC LIMIT 200
    \`);`
);

server = server.replace(
  `    const ticketRes = await pool.query(\`
      SELECT id::text, 'Ticket' as type, amount_paid as amount, status, user_id::text as user_email, created_at 
      FROM ticket_purchases
      WHERE amount_paid IS NOT NULL AND amount_paid > 0
      ORDER BY created_at DESC LIMIT 200
    \`);`,
  `    const ticketRes = await pool.query(\`
      SELECT id::text, 'Ticket' as type, amount_paid as amount, status, payment_reference as reference, user_id::text as user_email, created_at 
      FROM ticket_purchases
      WHERE amount_paid IS NOT NULL AND amount_paid > 0
      ORDER BY created_at DESC LIMIT 200
    \`);`
);

fs.writeFileSync('server.ts', server);
