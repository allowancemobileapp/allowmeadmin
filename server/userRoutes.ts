import { Router } from "express";

export function createUserRouter(pool: any) {
  const router = Router();
  const handleReq = (handler: any) => async (req: any, res: any) => {
    try {
      await handler(req, res);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  };

  router.get('/', handleReq(async (req: any, res: any) => {
    const result = await pool.query(`
      SELECT 
        id, username, full_name, email, avatar_url, subscription_tier, created_at, school_name, bio,
        ROW_NUMBER() OVER (ORDER BY created_at ASC) as rank
      FROM profiles 
      ORDER BY created_at ASC
    `);
    res.json(result.rows);
  }));

  router.get('/:id', handleReq(async (req: any, res: any) => {
    const { id } = req.params;
    const profileRes = await pool.query('SELECT * FROM profiles WHERE id = $1', [id]);
    if (profileRes.rows.length === 0) return res.status(404).json({error: 'User not found'});
    
    const profile = profileRes.rows[0];
    const gistsRes = await pool.query('SELECT COUNT(*) FROM gists WHERE user_id = $1', [id]);
    const momentsRes = await pool.query('SELECT COUNT(*) FROM moments WHERE user_id = $1', [id]);
    const storiesRes = await pool.query('SELECT COUNT(*) FROM stories WHERE user_id = $1', [id]);
    const ticketsRes = await pool.query('SELECT COUNT(*) FROM tickets WHERE user_id = $1', [id]);
    
    // Also fetch their actual content so we can display it
    const gistsData = await pool.query('SELECT * FROM gists WHERE user_id = $1 ORDER BY created_at DESC', [id]);
    const momentsData = await pool.query('SELECT * FROM moments WHERE user_id = $1 ORDER BY created_at DESC', [id]);
    const storiesData = await pool.query('SELECT * FROM stories WHERE user_id = $1 ORDER BY created_at DESC', [id]);
    const ticketsData = await pool.query('SELECT * FROM tickets WHERE user_id = $1 ORDER BY created_at DESC', [id]);

    res.json({
      ...profile,
      gists_count: parseInt(gistsRes.rows[0].count),
      moments_count: parseInt(momentsRes.rows[0].count),
      stories_count: parseInt(storiesRes.rows[0].count),
      tickets_count: parseInt(ticketsRes.rows[0].count),
      gists: gistsData.rows,
      moments: momentsData.rows,
      stories: storiesData.rows,
      tickets: ticketsData.rows,
    });
  }));

  router.put('/:id/upgrade', handleReq(async (req: any, res: any) => {
    const { id } = req.params;
    const adminEmail = req.adminEmail;
    
    if (adminEmail !== 'allowancemobileapp@gmail.com') {
      return res.status(403).json({ error: 'Only allowancemobileapp@gmail.com can upgrade users.' });
    }

    const { tier } = req.body; // usually 'plus' or 'free'
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 10); // 10 years

    const result = await pool.query(
      'UPDATE profiles SET subscription_tier = $1, subscription_expires_at = $2 WHERE id = $3 RETURNING *',
      [tier, expiresAt, id]
    );

    res.json(result.rows[0]);
  }));

  // Endpoint to edit a gist
  router.put('/:id/gists/:gistId', handleReq(async (req: any, res: any) => {
    const { id, gistId } = req.params;
    const { title, category } = req.body;
    const result = await pool.query(
      'UPDATE gists SET title = $1, category = $2 WHERE id = $3 AND user_id = $4 RETURNING *',
      [title, category, gistId, id]
    );
    res.json(result.rows[0]);
  }));

  // Endpoint to edit a moment
  router.put('/:id/moments/:momentId', handleReq(async (req: any, res: any) => {
    const { id, momentId } = req.params;
    const { caption, category } = req.body;
    const result = await pool.query(
      'UPDATE moments SET caption = $1, category = $2 WHERE id = $3 AND user_id = $4 RETURNING *',
      [caption, category, momentId, id]
    );
    res.json(result.rows[0]);
  }));

  // Endpoint to edit a story
  router.put('/:id/stories/:storyId', handleReq(async (req: any, res: any) => {
    const { id, storyId } = req.params;
    const { caption } = req.body;
    const result = await pool.query(
      'UPDATE stories SET caption = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
      [caption, storyId, id]
    );
    res.json(result.rows[0]);
  }));

  return router;
}
