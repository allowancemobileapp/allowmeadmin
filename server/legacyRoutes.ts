import express from "express";
import { Pool } from "pg";

export function createLegacyRouter(pool: Pool) {
  const router = express.Router();

  // Helper macro for error handling
  const handleReq = (handler: any) => async (req: express.Request, res: express.Response) => {
    try {
      await handler(req, res);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  };

  // --- Countries ---
  router.get('/countries', handleReq(async (req, res) => {
    const result = await pool.query('SELECT * FROM countries ORDER BY name ASC');
    res.json(result.rows);
  }));
  router.post('/countries', handleReq(async (req, res) => {
    const { name, continent } = req.body;
    const result = await pool.query('INSERT INTO countries (name, continent) VALUES ($1, $2) RETURNING *', [name, continent]);
    res.status(201).json(result.rows[0]);
  }));
  router.put('/countries/:id', handleReq(async (req, res) => {
    const { name, continent } = req.body;
    const result = await pool.query('UPDATE countries SET name = $1, continent = $2 WHERE id = $3 RETURNING *', [name, continent, req.params.id]);
    res.json(result.rows[0]);
  }));
  router.delete('/countries/:id', handleReq(async (req, res) => {
    await pool.query('DELETE FROM countries WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  }));

  // --- Schools ---
  router.get('/schools', handleReq(async (req, res) => {
    const { country_id } = req.query;
    let query = `
      SELECT s.id, s.name, s.address, s.location, s.country_id, COALESCE(v.vendor_count, 0) AS vendor_count
      FROM schools s
      LEFT JOIN (SELECT school_id, COUNT(*)::int AS vendor_count FROM vendors GROUP BY school_id) v ON v.school_id = s.id
    `;
    const params: any[] = [];
    if (country_id) {
      query += ` WHERE s.country_id = $1`;
      params.push(country_id);
    }
    query += ` ORDER BY s.name ASC`;
    const result = await pool.query(query, params);
    res.json(result.rows);
  }));
  router.post('/schools', handleReq(async (req, res) => {
    const { name, address, location, country_id } = req.body;
    const result = await pool.query('INSERT INTO schools (name, address, location, country_id) VALUES ($1, $2, $3, $4) RETURNING *', [name, address, location, country_id]);
    res.status(201).json(result.rows[0]);
  }));
  router.put('/schools/:id', handleReq(async (req, res) => {
    const { name, address, location, country_id } = req.body;
    const result = await pool.query('UPDATE schools SET name = $1, address = $2, location = $3, country_id = $4 WHERE id = $5 RETURNING *', [name, address, location, country_id, req.params.id]);
    res.json(result.rows[0]);
  }));
  router.delete('/schools/:id', handleReq(async (req, res) => {
    await pool.query('DELETE FROM schools WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  }));

  // --- Vendors ---
  router.get('/vendors', handleReq(async (req, res) => {
    const { school_id, country_id } = req.query;
    let query = 'SELECT * FROM vendors';
    const params: any[] = [];
    if (school_id) {
      query += ' WHERE school_id = $1';
      params.push(school_id);
    } else if (country_id) {
      query += ' WHERE country_id = $1';
      params.push(country_id);
    }
    query += ' ORDER BY name ASC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  }));
  router.get('/vendors/:id', handleReq(async (req, res) => {
    const result = await pool.query('SELECT * FROM vendors WHERE id = $1', [req.params.id]);
    res.json(result.rows[0]);
  }));
  router.post('/vendors', handleReq(async (req, res) => {
    const { name, school_id, phone_number, country_id } = req.body;
    const result = await pool.query('INSERT INTO vendors (name, school_id, phone_number, country_id) VALUES ($1, $2, $3, $4) RETURNING *', [name, school_id, phone_number, country_id]);
    res.status(201).json(result.rows[0]);
  }));
  router.put('/vendors/:id', handleReq(async (req, res) => {
    const { name, school_id, phone_number, country_id } = req.body;
    const result = await pool.query('UPDATE vendors SET name = $1, school_id = $2, phone_number = $3, country_id = $4 WHERE id = $5 RETURNING *', [name, school_id, phone_number, country_id, req.params.id]);
    res.json(result.rows[0]);
  }));
  router.delete('/vendors/:id', handleReq(async (req, res) => {
    await pool.query('DELETE FROM vendors WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  }));

  // --- Meals ---
  router.get('/meals/sections', handleReq(async (req, res) => {
    const result = await pool.query('SELECT * FROM sections ORDER BY id ASC');
    res.json(result.rows);
  }));
  router.get('/meals/categories', handleReq(async (req, res) => {
    const result = await pool.query('SELECT * FROM categories ORDER BY id ASC');
    res.json(result.rows);
  }));
  router.get('/meals', handleReq(async (req, res) => {
    const { section, section_id } = req.query;
    let query = 'SELECT m.*, s.name AS section_name, s.id AS section_id FROM meals m JOIN sections s ON m.section_id = s.id';
    const params: any[] = [];
    if (section_id) {
      query += ' WHERE m.section_id = $1';
      params.push(section_id);
    } else if (section) {
      query += ' WHERE s.name = $1';
      params.push(section);
    }
    query += ' ORDER BY m.name ASC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  }));
  router.get('/meals/:id', handleReq(async (req, res) => {
    const result = await pool.query('SELECT m.*, s.name AS section_name, s.id AS section_id FROM meals m JOIN sections s ON m.section_id = s.id WHERE m.id = $1', [req.params.id]);
    res.json(result.rows[0]);
  }));
  router.post('/meals', handleReq(async (req, res) => {
    const { name, section_id, category_id, calorie_count } = req.body;
    const result = await pool.query('INSERT INTO meals (name, section_id, category_id, calorie_count) VALUES ($1, $2, $3, $4) RETURNING *', [name, section_id, category_id, calorie_count]);
    res.status(201).json(result.rows[0]);
  }));
  router.put('/meals/:id', handleReq(async (req, res) => {
    const { name, section_id, category_id, calorie_count } = req.body;
    const result = await pool.query('UPDATE meals SET name = $1, section_id = $2, category_id = $3, calorie_count = $4 WHERE id = $5 RETURNING *', [name, section_id, category_id, calorie_count, req.params.id]);
    res.json(result.rows[0]);
  }));
  router.delete('/meals/:id', handleReq(async (req, res) => {
    await pool.query('DELETE FROM meals WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  }));

  // --- Vendor Menus ---
  router.get('/vendor_menus/sections', handleReq(async (req, res) => {
    const result = await pool.query('SELECT * FROM sections ORDER BY name ASC');
    res.json(result.rows);
  }));
  router.get('/vendor_menus', handleReq(async (req, res) => {
    const { vendor_id, section_id } = req.query;
    let query = 'SELECT vm.*, m.name AS meal_name, s.name AS section_name, s.id AS section_id FROM vendor_menus vm JOIN meals m ON vm.meal_id = m.id JOIN sections s ON m.section_id = s.id';
    const params: any[] = [];
    const conditions: string[] = [];
    if (vendor_id) {
       params.push(vendor_id);
       conditions.push(`vm.vendor_id = $${params.length}`);
    }
    if (section_id) {
       params.push(section_id);
       conditions.push(`m.section_id = $${params.length}`);
    }
    if (conditions.length) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY vm.id DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  }));
  router.post('/vendor_menus', handleReq(async (req, res) => {
    const { vendor_id, meal_id, quantity_portion, price } = req.body;
    const result = await pool.query('INSERT INTO vendor_menus (vendor_id, meal_id, quantity_portion, price) VALUES ($1, $2, $3, $4) RETURNING *', [vendor_id, meal_id, quantity_portion, price]);
    const newItem = result.rows[0];
    const mealInfo = await pool.query('SELECT m.name AS meal_name, s.name AS section_name, s.id AS section_id FROM meals m JOIN sections s ON m.section_id = s.id WHERE m.id = $1', [newItem.meal_id]);
    res.status(201).json({ ...newItem, ...mealInfo.rows[0] });
  }));
  router.get('/vendor_menus/:id', handleReq(async (req, res) => {
    const result = await pool.query('SELECT vm.*, m.name AS meal_name, s.name AS section_name, s.id AS section_id FROM vendor_menus vm JOIN meals m ON vm.meal_id = m.id JOIN sections s ON m.section_id = s.id WHERE vm.id = $1', [req.params.id]);
    res.json(result.rows[0]);
  }));
  router.put('/vendor_menus/:id', handleReq(async (req, res) => {
    const { vendor_id, meal_id, quantity_portion, price } = req.body;
    const result = await pool.query('UPDATE vendor_menus SET vendor_id = $1, meal_id = $2, quantity_portion = $3, price = $4 WHERE id = $5 RETURNING *', [vendor_id, meal_id, quantity_portion, price, req.params.id]);
    const updatedItem = result.rows[0];
    const mealInfo = await pool.query('SELECT m.name AS meal_name, s.name AS section_name, s.id AS section_id FROM meals m JOIN sections s ON m.section_id = s.id WHERE m.id = $1', [updatedItem.meal_id]);
    res.json({ ...updatedItem, ...mealInfo.rows[0] });
  }));
  router.delete('/vendor_menus/:id', handleReq(async (req, res) => {
    await pool.query('DELETE FROM vendor_menus WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  }));

  // --- Options ---
  router.get('/options', handleReq(async (req, res) => {
    const { vendor_id } = req.query;
    if (!vendor_id) return res.json([]);
    const result = await pool.query('SELECT * FROM options WHERE vendor_id = $1', [vendor_id]);
    res.json(result.rows);
  }));
  router.get('/options/:id', handleReq(async (req, res) => {
    const result = await pool.query('SELECT * FROM options WHERE id = $1', [req.params.id]);
    res.json(result.rows[0]);
  }));
  router.post('/options', handleReq(async (req, res) => {
    const { vendor_id, combo_description, total_price, total_calories, items, signature, group_id } = req.body;
    const itemsJson = typeof items === 'string' ? items : JSON.stringify(items);
    const result = await pool.query(
      'INSERT INTO options (vendor_id, combo_description, total_price, total_calories, items, signature, group_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [vendor_id, combo_description, total_price, total_calories, itemsJson, signature, group_id || null]
    );
    res.status(201).json(result.rows[0]);
  }));
  router.put('/options/:id', handleReq(async (req, res) => {
    const { vendor_id, combo_description, total_price, total_calories, items, signature, group_id } = req.body;
    const itemsJson = typeof items === 'string' ? items : JSON.stringify(items);
    const result = await pool.query(
      'UPDATE options SET vendor_id = $1, combo_description = $2, total_price = $3, total_calories = $4, items = $5, signature = $6, group_id = $7 WHERE id = $8 RETURNING *',
      [vendor_id, combo_description, total_price, total_calories, itemsJson, signature, group_id || null, req.params.id]
    );
    res.json(result.rows[0]);
  }));
  router.delete('/options/:id', handleReq(async (req, res) => {
    await pool.query('DELETE FROM options WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  }));

  // --- Food Groups ---
  router.get('/food_groups', handleReq(async (req, res) => {
    const vendor_id = req.query.vendor_id;
    if (!vendor_id) return res.json([]);
    const vendorResult = await pool.query('SELECT school_id FROM vendors WHERE id = $1', [vendor_id]);
    if (vendorResult.rows.length === 0) return res.json([]);
    const schoolId = vendorResult.rows[0].school_id;
    const groupsResult = await pool.query('SELECT id, name FROM food_groups WHERE school_id = $1', [schoolId]);
    res.json(groupsResult.rows);
  }));

  return router;
}
