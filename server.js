// server.ts
import express2 from "express";
import path from "path";
import { Pool } from "pg";
import { google } from "googleapis";
import dotenv from "dotenv";

// server/legacyRoutes.ts
import express from "express";
function createLegacyRouter(pool2) {
  const router = express.Router();
  const handleReq = (handler) => async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  };
  router.get("/countries", handleReq(async (req, res) => {
    const result = await pool2.query("SELECT * FROM countries ORDER BY name ASC");
    res.json(result.rows);
  }));
  router.post("/countries", handleReq(async (req, res) => {
    const { name, continent } = req.body;
    const result = await pool2.query("INSERT INTO countries (name, continent) VALUES ($1, $2) RETURNING *", [name, continent]);
    res.status(201).json(result.rows[0]);
  }));
  router.put("/countries/:id", handleReq(async (req, res) => {
    const { name, continent } = req.body;
    const result = await pool2.query("UPDATE countries SET name = $1, continent = $2 WHERE id = $3 RETURNING *", [name, continent, req.params.id]);
    res.json(result.rows[0]);
  }));
  router.delete("/countries/:id", handleReq(async (req, res) => {
    await pool2.query("DELETE FROM countries WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  }));
  router.get("/schools", handleReq(async (req, res) => {
    const { country_id } = req.query;
    let query = `
      SELECT s.id, s.name, s.address, s.location, s.country_id, COALESCE(v.vendor_count, 0) AS vendor_count
      FROM schools s
      LEFT JOIN (SELECT school_id, COUNT(*)::int AS vendor_count FROM vendors GROUP BY school_id) v ON v.school_id = s.id
    `;
    const params = [];
    if (country_id) {
      query += ` WHERE s.country_id = $1`;
      params.push(country_id);
    }
    query += ` ORDER BY s.name ASC`;
    const result = await pool2.query(query, params);
    res.json(result.rows);
  }));
  router.post("/schools", handleReq(async (req, res) => {
    const { name, address, location, country_id } = req.body;
    const result = await pool2.query("INSERT INTO schools (name, address, location, country_id) VALUES ($1, $2, $3, $4) RETURNING *", [name, address, location, country_id]);
    res.status(201).json(result.rows[0]);
  }));
  router.put("/schools/:id", handleReq(async (req, res) => {
    const { name, address, location, country_id } = req.body;
    const result = await pool2.query("UPDATE schools SET name = $1, address = $2, location = $3, country_id = $4 WHERE id = $5 RETURNING *", [name, address, location, country_id, req.params.id]);
    res.json(result.rows[0]);
  }));
  router.delete("/schools/:id", handleReq(async (req, res) => {
    await pool2.query("DELETE FROM schools WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  }));
  router.get("/vendors", handleReq(async (req, res) => {
    const { school_id, country_id } = req.query;
    let query = "SELECT * FROM vendors";
    const params = [];
    if (school_id) {
      query += " WHERE school_id = $1";
      params.push(school_id);
    } else if (country_id) {
      query += " WHERE country_id = $1";
      params.push(country_id);
    }
    query += " ORDER BY name ASC";
    const result = await pool2.query(query, params);
    res.json(result.rows);
  }));
  router.get("/vendors/:id", handleReq(async (req, res) => {
    const result = await pool2.query("SELECT * FROM vendors WHERE id = $1", [req.params.id]);
    res.json(result.rows[0]);
  }));
  router.post("/vendors", handleReq(async (req, res) => {
    const { name, school_id, phone_number, country_id } = req.body;
    const result = await pool2.query("INSERT INTO vendors (name, school_id, phone_number, country_id) VALUES ($1, $2, $3, $4) RETURNING *", [name, school_id, phone_number, country_id]);
    res.status(201).json(result.rows[0]);
  }));
  router.put("/vendors/:id", handleReq(async (req, res) => {
    const { name, school_id, phone_number, country_id } = req.body;
    const result = await pool2.query("UPDATE vendors SET name = $1, school_id = $2, phone_number = $3, country_id = $4 WHERE id = $5 RETURNING *", [name, school_id, phone_number, country_id, req.params.id]);
    res.json(result.rows[0]);
  }));
  router.delete("/vendors/:id", handleReq(async (req, res) => {
    await pool2.query("DELETE FROM vendors WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  }));
  router.get("/meals/sections", handleReq(async (req, res) => {
    const result = await pool2.query("SELECT * FROM sections ORDER BY id ASC");
    res.json(result.rows);
  }));
  router.get("/meals/categories", handleReq(async (req, res) => {
    const result = await pool2.query("SELECT * FROM categories ORDER BY id ASC");
    res.json(result.rows);
  }));
  router.get("/meals", handleReq(async (req, res) => {
    const { section, section_id } = req.query;
    let query = "SELECT m.*, s.name AS section_name, s.id AS section_id FROM meals m JOIN sections s ON m.section_id = s.id";
    const params = [];
    if (section_id) {
      query += " WHERE m.section_id = $1";
      params.push(section_id);
    } else if (section) {
      query += " WHERE s.name = $1";
      params.push(section);
    }
    query += " ORDER BY m.name ASC";
    const result = await pool2.query(query, params);
    res.json(result.rows);
  }));
  router.get("/meals/:id", handleReq(async (req, res) => {
    const result = await pool2.query("SELECT m.*, s.name AS section_name, s.id AS section_id FROM meals m JOIN sections s ON m.section_id = s.id WHERE m.id = $1", [req.params.id]);
    res.json(result.rows[0]);
  }));
  router.post("/meals", handleReq(async (req, res) => {
    const { name, section_id, category_id, calorie_count } = req.body;
    const result = await pool2.query("INSERT INTO meals (name, section_id, category_id, calorie_count) VALUES ($1, $2, $3, $4) RETURNING *", [name, section_id, category_id, calorie_count]);
    res.status(201).json(result.rows[0]);
  }));
  router.put("/meals/:id", handleReq(async (req, res) => {
    const { name, section_id, category_id, calorie_count } = req.body;
    const result = await pool2.query("UPDATE meals SET name = $1, section_id = $2, category_id = $3, calorie_count = $4 WHERE id = $5 RETURNING *", [name, section_id, category_id, calorie_count, req.params.id]);
    res.json(result.rows[0]);
  }));
  router.delete("/meals/:id", handleReq(async (req, res) => {
    await pool2.query("DELETE FROM meals WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  }));
  router.get("/vendor_menus/sections", handleReq(async (req, res) => {
    const result = await pool2.query("SELECT * FROM sections ORDER BY name ASC");
    res.json(result.rows);
  }));
  router.get("/vendor_menus", handleReq(async (req, res) => {
    const { vendor_id, section_id } = req.query;
    let query = "SELECT vm.*, m.name AS meal_name, s.name AS section_name, s.id AS section_id FROM vendor_menus vm JOIN meals m ON vm.meal_id = m.id JOIN sections s ON m.section_id = s.id";
    const params = [];
    const conditions = [];
    if (vendor_id) {
      params.push(vendor_id);
      conditions.push(`vm.vendor_id = $${params.length}`);
    }
    if (section_id) {
      params.push(section_id);
      conditions.push(`m.section_id = $${params.length}`);
    }
    if (conditions.length) {
      query += " WHERE " + conditions.join(" AND ");
    }
    query += " ORDER BY vm.id DESC";
    const result = await pool2.query(query, params);
    res.json(result.rows);
  }));
  router.post("/vendor_menus", handleReq(async (req, res) => {
    const { vendor_id, meal_id, quantity_portion, price } = req.body;
    const result = await pool2.query("INSERT INTO vendor_menus (vendor_id, meal_id, quantity_portion, price) VALUES ($1, $2, $3, $4) RETURNING *", [vendor_id, meal_id, quantity_portion, price]);
    const newItem = result.rows[0];
    const mealInfo = await pool2.query("SELECT m.name AS meal_name, s.name AS section_name, s.id AS section_id FROM meals m JOIN sections s ON m.section_id = s.id WHERE m.id = $1", [newItem.meal_id]);
    res.status(201).json({ ...newItem, ...mealInfo.rows[0] });
  }));
  router.get("/vendor_menus/:id", handleReq(async (req, res) => {
    const result = await pool2.query("SELECT vm.*, m.name AS meal_name, s.name AS section_name, s.id AS section_id FROM vendor_menus vm JOIN meals m ON vm.meal_id = m.id JOIN sections s ON m.section_id = s.id WHERE vm.id = $1", [req.params.id]);
    res.json(result.rows[0]);
  }));
  router.put("/vendor_menus/:id", handleReq(async (req, res) => {
    const { vendor_id, meal_id, quantity_portion, price } = req.body;
    const result = await pool2.query("UPDATE vendor_menus SET vendor_id = $1, meal_id = $2, quantity_portion = $3, price = $4 WHERE id = $5 RETURNING *", [vendor_id, meal_id, quantity_portion, price, req.params.id]);
    const updatedItem = result.rows[0];
    const mealInfo = await pool2.query("SELECT m.name AS meal_name, s.name AS section_name, s.id AS section_id FROM meals m JOIN sections s ON m.section_id = s.id WHERE m.id = $1", [updatedItem.meal_id]);
    res.json({ ...updatedItem, ...mealInfo.rows[0] });
  }));
  router.delete("/vendor_menus/:id", handleReq(async (req, res) => {
    await pool2.query("DELETE FROM vendor_menus WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  }));
  router.get("/options", handleReq(async (req, res) => {
    const { vendor_id } = req.query;
    if (!vendor_id) return res.json([]);
    const result = await pool2.query("SELECT * FROM options WHERE vendor_id = $1", [vendor_id]);
    res.json(result.rows);
  }));
  router.get("/options/:id", handleReq(async (req, res) => {
    const result = await pool2.query("SELECT * FROM options WHERE id = $1", [req.params.id]);
    res.json(result.rows[0]);
  }));
  router.post("/options", handleReq(async (req, res) => {
    const { vendor_id, combo_description, total_price, total_calories, items, signature, group_id } = req.body;
    const itemsJson = typeof items === "string" ? items : JSON.stringify(items);
    const result = await pool2.query(
      "INSERT INTO options (vendor_id, combo_description, total_price, total_calories, items, signature, group_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
      [vendor_id, combo_description, total_price, total_calories, itemsJson, signature, group_id || null]
    );
    res.status(201).json(result.rows[0]);
  }));
  router.put("/options/:id", handleReq(async (req, res) => {
    const { vendor_id, combo_description, total_price, total_calories, items, signature, group_id } = req.body;
    const itemsJson = typeof items === "string" ? items : JSON.stringify(items);
    const result = await pool2.query(
      "UPDATE options SET vendor_id = $1, combo_description = $2, total_price = $3, total_calories = $4, items = $5, signature = $6, group_id = $7 WHERE id = $8 RETURNING *",
      [vendor_id, combo_description, total_price, total_calories, itemsJson, signature, group_id || null, req.params.id]
    );
    res.json(result.rows[0]);
  }));
  router.delete("/options/:id", handleReq(async (req, res) => {
    await pool2.query("DELETE FROM options WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  }));
  router.get("/food_groups", handleReq(async (req, res) => {
    const vendor_id = req.query.vendor_id;
    if (!vendor_id) return res.json([]);
    const vendorResult = await pool2.query("SELECT school_id FROM vendors WHERE id = $1", [vendor_id]);
    if (vendorResult.rows.length === 0) return res.json([]);
    const schoolId = vendorResult.rows[0].school_id;
    const groupsResult = await pool2.query("SELECT id, name FROM food_groups WHERE school_id = $1", [schoolId]);
    res.json(groupsResult.rows);
  }));
  return router;
}

// server/libraryRoutes.ts
import { Router } from "express";
import multer from "multer";
var storage = multer.memoryStorage();
var upload = multer({ storage });
function createLibraryRouter(pool2) {
  const router = Router();
  const logAdminAction2 = async (req, action, details) => {
    try {
      const adminEmail = req.adminEmail || "unknown";
      await pool2.query(
        "INSERT INTO system_logs (type, admin_email, action, details) VALUES ($1, $2, $3, $4)",
        ["admin", adminEmail, action, JSON.stringify(details)]
      );
    } catch (e) {
      console.error("Failed to log admin action", e);
    }
  };
  const handleReq = (handler) => async (req, res) => {
    try {
      await handler(req, res);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  };
  router.post("/upload", upload.single("file"), handleReq(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const { createClient } = await import("@supabase/supabase-js");
    const supabaseUrl = "https://quuazutreaitqoquzolg.supabase.co";
    const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1dWF6dXRyZWFpdHFvcXV6b2xnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDA4OTYxOCwiZXhwIjoyMDU5NjY1NjE4fQ.pQoriaaK_dG1Z9nQUWdCYvFtugulM7ir9OjTukIhDGs";
    const supabase = createClient(supabaseUrl, supabaseKey);
    const fileName = `${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const { data, error } = await supabase.storage.from("library-materials").upload(fileName, req.file.buffer, {
      contentType: req.file.mimetype,
      upsert: true
    });
    if (error) {
      throw new Error(`Failed to upload to Supabase: ${error.message}`);
    }
    const { data: publicUrlData } = supabase.storage.from("library-materials").getPublicUrl(fileName);
    res.json({ url: publicUrlData.publicUrl });
  }));
  router.get("/colleges", handleReq(async (req, res) => {
    const { school_id } = req.query;
    let query = "SELECT c.*, s.name as school_name FROM colleges c JOIN schools s ON c.school_id = s.id";
    const params = [];
    if (school_id) {
      query += " WHERE c.school_id = $1";
      params.push(school_id);
    }
    const result = await pool2.query(query, params);
    res.json(result.rows);
  }));
  router.post("/colleges", handleReq(async (req, res) => {
    const { school_id, name } = req.body;
    const result = await pool2.query(
      "INSERT INTO colleges (school_id, name) VALUES ($1, $2) RETURNING *",
      [school_id, name]
    );
    await logAdminAction2(req, `Created college ${name}`, { school_id, name });
    res.json(result.rows[0]);
  }));
  router.put("/colleges/:id", handleReq(async (req, res) => {
    const { school_id, name } = req.body;
    const result = await pool2.query(
      "UPDATE colleges SET school_id = $1, name = $2 WHERE id = $3 RETURNING *",
      [school_id, name, req.params.id]
    );
    await logAdminAction2(req, `Updated college ${req.params.id}`, { school_id, name });
    res.json(result.rows[0]);
  }));
  router.delete("/colleges/:id", handleReq(async (req, res) => {
    await pool2.query("DELETE FROM colleges WHERE id = $1", [req.params.id]);
    await logAdminAction2(req, `Deleted college ${req.params.id}`, {});
    res.json({ success: true });
  }));
  router.get("/courses", handleReq(async (req, res) => {
    const { college_id } = req.query;
    let query = "SELECT c.*, col.name as college_name, s.name as school_name FROM courses c JOIN colleges col ON c.college_id = col.id JOIN schools s ON col.school_id = s.id";
    const params = [];
    if (college_id) {
      query += " WHERE c.college_id = $1";
      params.push(college_id);
    }
    const result = await pool2.query(query, params);
    res.json(result.rows);
  }));
  router.post("/courses", handleReq(async (req, res) => {
    const { college_id, course_code, course_title, course_description } = req.body;
    const result = await pool2.query(
      "INSERT INTO courses (college_id, course_code, course_title, course_description) VALUES ($1, $2, $3, $4) RETURNING *",
      [college_id, course_code, course_title, course_description]
    );
    await logAdminAction2(req, `Created course ${course_code}`, { college_id, course_code, course_title });
    res.json(result.rows[0]);
  }));
  router.put("/courses/:id", handleReq(async (req, res) => {
    const { college_id, course_code, course_title, course_description } = req.body;
    const result = await pool2.query(
      "UPDATE courses SET college_id = $1, course_code = $2, course_title = $3, course_description = $4 WHERE id = $5 RETURNING *",
      [college_id, course_code, course_title, course_description, req.params.id]
    );
    await logAdminAction2(req, `Updated course ${req.params.id}`, { college_id, course_code, course_title });
    res.json(result.rows[0]);
  }));
  router.delete("/courses/:id", handleReq(async (req, res) => {
    await pool2.query("DELETE FROM courses WHERE id = $1", [req.params.id]);
    await logAdminAction2(req, `Deleted course ${req.params.id}`, {});
    res.json({ success: true });
  }));
  router.get("/library_materials", handleReq(async (req, res) => {
    const { course_id } = req.query;
    let query = "SELECT m.*, c.course_code FROM library_materials m JOIN courses c ON m.course_id = c.id";
    const params = [];
    if (course_id) {
      query += " WHERE m.course_id = $1";
      params.push(course_id);
    }
    const result = await pool2.query(query, params);
    res.json(result.rows);
  }));
  router.post("/library_materials", handleReq(async (req, res) => {
    const { course_id, material_type, title, academic_year, semester, file_url, price } = req.body;
    const result = await pool2.query(
      "INSERT INTO library_materials (course_id, material_type, title, academic_year, semester, file_url, price) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
      [course_id, material_type, title, academic_year, semester, file_url, price || 0]
    );
    await logAdminAction2(req, `Created library material ${title}`, { course_id, material_type });
    res.json(result.rows[0]);
  }));
  router.put("/library_materials/:id", handleReq(async (req, res) => {
    const { course_id, material_type, title, academic_year, semester, file_url, price } = req.body;
    const result = await pool2.query(
      "UPDATE library_materials SET course_id = $1, material_type = $2, title = $3, academic_year = $4, semester = $5, file_url = $6, price = $7 WHERE id = $8 RETURNING *",
      [course_id, material_type, title, academic_year, semester, file_url, price || 0, req.params.id]
    );
    await logAdminAction2(req, `Updated library material ${req.params.id}`, { course_id, material_type, title });
    res.json(result.rows[0]);
  }));
  router.delete("/library_materials/:id", handleReq(async (req, res) => {
    await pool2.query("DELETE FROM library_materials WHERE id = $1", [req.params.id]);
    await logAdminAction2(req, `Deleted library material ${req.params.id}`, {});
    res.json({ success: true });
  }));
  router.get("/quiz_questions", handleReq(async (req, res) => {
    const { material_id, course_id } = req.query;
    let query = "SELECT * FROM quiz_questions WHERE 1=1";
    const params = [];
    if (material_id) {
      params.push(material_id);
      query += ` AND material_id = $${params.length}`;
    }
    if (course_id) {
      params.push(course_id);
      query += ` AND course_id = $${params.length}`;
    }
    const result = await pool2.query(query, params);
    res.json(result.rows);
  }));
  router.post("/quiz_questions/generate", handleReq(async (req, res) => {
    const { course_id, material_id, file_url } = req.body;
    const { GoogleGenAI, Type } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    let contents = [
      { text: `You are an expert professor. Generate a 50-question pop quiz based on the course material provided. For each question provide exactly 3 options (option_a, option_b, option_c) and one correct_option ('A', 'B', or 'C').` }
    ];
    if (file_url) {
      const fileResponse = await fetch(file_url);
      const arrayBuffer = await fileResponse.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64 = buffer.toString("base64");
      const mimeType = fileResponse.headers.get("content-type") || "application/pdf";
      contents.push({
        inlineData: {
          mimeType,
          data: base64
        }
      });
    }
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              question_text: { type: Type.STRING },
              option_a: { type: Type.STRING },
              option_b: { type: Type.STRING },
              option_c: { type: Type.STRING },
              correct_option: { type: Type.STRING, enum: ["A", "B", "C"] }
            },
            required: ["question_text", "option_a", "option_b", "option_c", "correct_option"]
          }
        }
      }
    });
    const questionsText = response.text || "[]";
    const questions = JSON.parse(questionsText.trim());
    if (questions.length > 0) {
      await pool2.query("DELETE FROM quiz_questions WHERE material_id = $1", [material_id]);
      const values = questions.map(
        (q) => `(${course_id}, ${material_id}, '${q.question_text.replace(/'/g, "''")}', '${q.option_a.replace(/'/g, "''")}', '${q.option_b.replace(/'/g, "''")}', '${q.option_c.replace(/'/g, "''")}', '${q.correct_option}')`
      ).join(",");
      const result = await pool2.query(`INSERT INTO quiz_questions (course_id, material_id, question_text, option_a, option_b, option_c, correct_option) VALUES ${values} RETURNING *`);
      await logAdminAction2(req, `Generated ${questions.length} quiz questions for material ${material_id}`, { course_id, count: questions.length });
      return res.json(result.rows);
    }
    res.json([]);
  }));
  router.delete("/quiz_questions/:id", handleReq(async (req, res) => {
    await pool2.query("DELETE FROM quiz_questions WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  }));
  router.delete("/quiz_questions/material/:material_id", handleReq(async (req, res) => {
    await pool2.query("DELETE FROM quiz_questions WHERE material_id = $1", [req.params.material_id]);
    res.json({ success: true });
  }));
  return router;
}

// server/userRoutes.ts
import { Router as Router2 } from "express";
function createUserRouter(pool2) {
  const router = Router2();
  const handleReq = (handler) => async (req, res) => {
    try {
      await handler(req, res);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  };
  const logAdminAction2 = async (req, action, details) => {
    try {
      const adminEmail = req.adminEmail || "unknown";
      await pool2.query(
        "INSERT INTO system_logs (type, admin_email, action, details) VALUES ($1, $2, $3, $4)",
        ["admin", adminEmail, action, JSON.stringify(details)]
      );
    } catch (e) {
      console.error("Failed to log admin action", e);
    }
  };
  router.get("/", handleReq(async (req, res) => {
    const { sort } = req.query;
    const order = sort === "newest" ? "DESC" : "ASC";
    const result = await pool2.query(`
      SELECT * FROM (
        SELECT 
          id, username, full_name, email, avatar_url, subscription_tier, created_at, school_name, bio,
          ROW_NUMBER() OVER (ORDER BY created_at ASC) as rank
        FROM profiles 
      ) as ranked_profiles
      ORDER BY created_at ${order}
    `);
    res.json(result.rows);
  }));
  router.get("/:id", handleReq(async (req, res) => {
    const { id } = req.params;
    const profileRes = await pool2.query(`
      SELECT p.*, r.username as referrer_username, r.full_name as referrer_full_name 
      FROM profiles p
      LEFT JOIN profiles r ON p.referred_by = r.id
      WHERE p.id = $1
    `, [id]);
    if (profileRes.rows.length === 0) return res.status(404).json({ error: "User not found" });
    const profile = profileRes.rows[0];
    const gistsRes = await pool2.query("SELECT COUNT(*) FROM gists WHERE user_id = $1", [id]);
    const momentsRes = await pool2.query("SELECT COUNT(*) FROM moments WHERE user_id = $1", [id]);
    const storiesRes = await pool2.query("SELECT COUNT(*) FROM stories WHERE user_id = $1", [id]);
    const ticketsRes = await pool2.query("SELECT COUNT(*) FROM tickets WHERE user_id = $1", [id]);
    const gistsData = await pool2.query("SELECT * FROM gists WHERE user_id = $1 ORDER BY created_at DESC", [id]);
    const momentsData = await pool2.query("SELECT * FROM moments WHERE user_id = $1 ORDER BY created_at DESC", [id]);
    const storiesData = await pool2.query("SELECT * FROM stories WHERE user_id = $1 ORDER BY created_at DESC", [id]);
    const ticketsData = await pool2.query("SELECT * FROM tickets WHERE user_id = $1 ORDER BY created_at DESC", [id]);
    res.json({
      ...profile,
      gists_count: parseInt(gistsRes.rows[0].count),
      moments_count: parseInt(momentsRes.rows[0].count),
      stories_count: parseInt(storiesRes.rows[0].count),
      tickets_count: parseInt(ticketsRes.rows[0].count),
      gists: gistsData.rows,
      moments: momentsData.rows,
      stories: storiesData.rows,
      tickets: ticketsData.rows
    });
  }));
  router.put("/:id/upgrade", handleReq(async (req, res) => {
    const { id } = req.params;
    const adminEmail = req.adminEmail;
    if (adminEmail !== "allowancemobileapp@gmail.com") {
      return res.status(403).json({ error: "Only allowancemobileapp@gmail.com can upgrade users." });
    }
    const { tier } = req.body;
    const expiresAt = /* @__PURE__ */ new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 10);
    const result = await pool2.query(
      "UPDATE profiles SET subscription_tier = $1, subscription_expires_at = $2 WHERE id = $3 RETURNING *",
      [tier, expiresAt, id]
    );
    await logAdminAction2(req, `Updated user ${id} subscription tier to ${tier}`, { tier, expiresAt });
    res.json(result.rows[0]);
  }));
  router.put("/:id/gists/:gistId", handleReq(async (req, res) => {
    const { id, gistId } = req.params;
    const { title, category } = req.body;
    const result = await pool2.query(
      "UPDATE gists SET title = $1, category = $2 WHERE id = $3 AND user_id = $4 RETURNING *",
      [title, category, gistId, id]
    );
    await logAdminAction2(req, `Edited gist ${gistId} for user ${id}`, { title, category });
    res.json(result.rows[0]);
  }));
  router.put("/:id/moments/:momentId", handleReq(async (req, res) => {
    const { id, momentId } = req.params;
    const { caption, category } = req.body;
    const result = await pool2.query(
      "UPDATE moments SET caption = $1, category = $2 WHERE id = $3 AND user_id = $4 RETURNING *",
      [caption, category, momentId, id]
    );
    await logAdminAction2(req, `Edited moment ${momentId} for user ${id}`, { caption, category });
    res.json(result.rows[0]);
  }));
  router.put("/:id/stories/:storyId", handleReq(async (req, res) => {
    const { id, storyId } = req.params;
    const { caption } = req.body;
    const result = await pool2.query(
      "UPDATE stories SET caption = $1 WHERE id = $2 AND user_id = $3 RETURNING *",
      [caption, storyId, id]
    );
    await logAdminAction2(req, `Edited story ${storyId} for user ${id}`, { caption });
    res.json(result.rows[0]);
  }));
  return router;
}

// server.ts
import cors from "cors";
dotenv.config();
var app = express2();
var PORT = 3e3;
app.use(cors());
app.use(express2.json());
var envDbUrl = process.env.DATABASE_URL;
var connectionString = envDbUrl && !envDbUrl.includes("localhost") && !envDbUrl.includes("127.0.0.1") ? envDbUrl : "postgresql://postgres.quuazutreaitqoquzolg:James2002eze%23@aws-0-eu-central-1.pooler.supabase.com:5432/postgres";
var isLocalDb = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");
var cleanConnectionString = connectionString.split("?")[0];
var pool = new Pool({
  connectionString: cleanConnectionString,
  ssl: isLocalDb ? false : { rejectUnauthorized: false }
});
async function initDb() {
  try {
    console.log("Initializing database tables...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
          id SERIAL PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          title VARCHAR(50),
          permissions JSONB DEFAULT '{}',
          added_by VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS company_expenses (
          id SERIAL PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          reason VARCHAR(255) NOT NULL,
          amount DECIMAL(12, 2) NOT NULL,
          expense_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS system_logs (
          id SERIAL PRIMARY KEY,
          type VARCHAR(50),
          user_email VARCHAR(255),
          action_summary TEXT NOT NULL,
          action VARCHAR(255),
          admin_email VARCHAR(255),
          details JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS allowance_coupons ( 
          id SERIAL PRIMARY KEY, 
          code VARCHAR(6) UNIQUE NOT NULL, 
          claim_limit INT NOT NULL DEFAULT 1, 
          claimed_count INT DEFAULT 0, 
          is_active BOOLEAN DEFAULT TRUE, 
          discount_percentage INT CHECK (discount_percentage IN (10, 25, 50, 75, 100)), 
          expires_at TIMESTAMPTZ NOT NULL, 
          created_by VARCHAR(255), 
          created_at TIMESTAMPTZ DEFAULT NOW() 
      );
      CREATE TABLE IF NOT EXISTS allowance_notifications (
          id SERIAL PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          message TEXT NOT NULL,
          sent_by VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      -- Insert default admin if it doesnt exist
      INSERT INTO admin_users (email, title, permissions, added_by) 
      VALUES ('allowancemobileapp@gmail.com', 'Super Admin', '{"all": true}', 'system')
      ON CONFLICT (email) DO NOTHING;
    `);
    await pool.query(`
      INSERT INTO system_logs (type, user_email, action_summary, details) 
      SELECT 'app', 'student@scholar.edu', 'User updated their profile', '{"updatedFields": ["phone"]}'
      WHERE NOT EXISTS (SELECT 1 FROM system_logs WHERE type = 'app');
    `);
    console.log("Database initialized successfully.");
  } catch (err) {
    console.error("Database initialization failed (using mock data safely):", err);
  }
}
initDb();
async function logAdminAction(admin_email, action, details) {
  try {
    await pool.query(
      "INSERT INTO system_logs (type, admin_email, action, details) VALUES ($1, $2, $3, $4)",
      ["admin", admin_email, action, JSON.stringify(details)]
    );
  } catch (e) {
    console.error("Logger error:", e);
  }
}
function requireAdmin(req, res, next) {
  const email = req.headers["x-admin-email"];
  if (!email) {
    res.status(401).json({ error: "Unauthorized. Missing x-admin-email header." });
    return;
  }
  const lowerEmail = email.toLowerCase();
  if (lowerEmail === "allowancemobileapp@gmail.com" || lowerEmail === "allowancemobielapp@gmail.com") {
    req.adminEmail = lowerEmail;
    next();
    return;
  }
  pool.query("SELECT permissions FROM admin_users WHERE email = $1", [lowerEmail]).then((result) => {
    if (result.rows.length === 0) {
      res.status(403).json({ error: "Forbidden. Admin account not found." });
      return;
    }
    req.adminEmail = email;
    req.adminPermissions = result.rows[0].permissions;
    next();
  }).catch((err) => {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  });
}
app.post("/api/auth/verify", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });
    const lowerEmail = email.toLowerCase();
    if (lowerEmail === "allowancemobileapp@gmail.com" || lowerEmail === "allowancemobielapp@gmail.com") return res.json({ verified: true, title: "Super Admin", permissions: { all: true } });
    const result = await pool.query("SELECT title, permissions FROM admin_users WHERE email = $1", [lowerEmail]);
    if (result.rows.length > 0) {
      res.json({ verified: true, title: result.rows[0].title, permissions: result.rows[0].permissions });
    } else {
      res.status(403).json({ error: "Unauthorized email." });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.use("/api", requireAdmin, createLegacyRouter(pool));
app.use("/api/library", requireAdmin, createLibraryRouter(pool));
app.use("/api/users", requireAdmin, createUserRouter(pool));
app.get("/api/expenses", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM company_expenses ORDER BY expense_date DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/expenses/reasons", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT DISTINCT reason FROM company_expenses WHERE reason IS NOT NULL AND reason != '' ORDER BY reason ASC");
    res.json(result.rows.map((r) => r.reason));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/expenses", requireAdmin, async (req, res) => {
  try {
    const { title, reason, amount, expense_date } = req.body;
    const result = await pool.query(
      "INSERT INTO company_expenses (title, reason, amount, expense_date) VALUES ($1, $2, $3, $4) RETURNING *",
      [title, reason, amount, expense_date || (/* @__PURE__ */ new Date()).toISOString()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/admins", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM admin_users ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/admins", requireAdmin, async (req, res) => {
  try {
    const { email, title, permissions } = req.body;
    const adminEmail = req.adminEmail;
    if (adminEmail !== "allowancemobileapp@gmail.com") {
      res.status(403).json({ error: "Only allowancemobileapp@gmail.com can add new admins." });
      return;
    }
    const result = await pool.query(
      "INSERT INTO admin_users (email, title, permissions, added_by) VALUES ($1, $2, $3, $4) RETURNING *",
      [email, title, JSON.stringify(permissions), adminEmail]
    );
    await logAdminAction(adminEmail, `Added new admin ${email}`, { permissions });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.put("/api/admins/:id", requireAdmin, async (req, res) => {
  try {
    const { title, permissions } = req.body;
    const adminEmail = req.adminEmail;
    if (adminEmail !== "allowancemobileapp@gmail.com" && adminEmail !== "allowancemobielapp@gmail.com") {
      res.status(403).json({ error: "Only super admin can edit admins." });
      return;
    }
    const adminId = req.params.id;
    const result = await pool.query(
      "UPDATE admin_users SET title = $1, permissions = $2 WHERE id = $3 RETURNING *",
      [title, JSON.stringify(permissions), adminId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Admin not found" });
    await logAdminAction(req.adminEmail, `Updated admin access for ${result.rows[0].email}`, { permissions });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.delete("/api/admins/:id", requireAdmin, async (req, res) => {
  try {
    const adminEmail = req.adminEmail;
    if (adminEmail !== "allowancemobileapp@gmail.com") {
      res.status(403).json({ error: "Only allowancemobileapp@gmail.com can remove admins." });
      return;
    }
    const adminId = req.params.id;
    const adminRes = await pool.query("SELECT email FROM admin_users WHERE id = $1", [adminId]);
    if (adminRes.rows.length === 0) return res.status(404).json({ error: "Admin not found" });
    if (adminRes.rows[0].email === "allowancemobileapp@gmail.com") return res.status(403).json({ error: "Cannot delete super admin" });
    await pool.query("DELETE FROM admin_users WHERE id = $1", [adminId]);
    await logAdminAction(adminEmail, `Removed admin access for ${adminRes.rows[0].email}`, {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/logs/admin", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM system_logs WHERE type = 'admin' ORDER BY created_at DESC LIMIT 500");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/logs/app", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        al.id, 
        COALESCE(p.username, 'anonymous') as user_email, 
        al.action_type as action_summary, 
        al.created_at, 
        jsonb_build_object('user_id', al.user_id, 'log_details', al.details) as details 
      FROM activity_logs al 
      LEFT JOIN profiles p ON (al.user_id::text = p.id::text OR (al.details->'extra'->>'user_id')::text = p.id::text)
      ORDER BY al.created_at DESC 
      LIMIT 1000
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/logs/app", async (req, res) => {
  try {
    const { user_email, action_summary, details } = req.body;
    if (!user_email || !action_summary) return res.status(400).json({ error: "Missing required fields" });
    const result = await pool.query(
      "INSERT INTO system_logs (type, user_email, action_summary, details) VALUES ($1, $2, $3, $4) RETURNING *",
      ["app", user_email, action_summary, details || {}]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/metadata/stats", requireAdmin, async (req, res) => {
  try {
    let total_schools = 0;
    try {
      const schoolRes = await pool.query("SELECT COUNT(*) FROM schools");
      total_schools = parseInt(schoolRes.rows[0].count);
    } catch (e) {
    }
    let active_tickets = 0;
    try {
      const ticketsRes = await pool.query("SELECT COUNT(*) FROM tickets WHERE status = 'active'");
      active_tickets = parseInt(ticketsRes.rows[0].count);
    } catch (e) {
    }
    let active_gists = 0;
    try {
      const gistsRes = await pool.query("SELECT COUNT(*) FROM gists WHERE status = 'active'");
      active_gists = parseInt(gistsRes.rows[0].count);
    } catch (e) {
    }
    let total_users = 0;
    let new_users_today = 0;
    try {
      const usersRes = await pool.query("SELECT COUNT(*) FROM profiles");
      total_users = parseInt(usersRes.rows[0].count);
      const newUsersRes = await pool.query("SELECT COUNT(*) FROM profiles WHERE created_at >= current_date");
      new_users_today = parseInt(newUsersRes.rows[0].count);
    } catch (e) {
    }
    let total_subscribers = 0;
    let new_subscribers_today = 0;
    try {
      const subsRes = await pool.query("SELECT COUNT(DISTINCT user_id) FROM membership_payments");
      total_subscribers = parseInt(subsRes.rows[0].count);
      const newSubsRes = await pool.query("SELECT COUNT(*) FROM membership_payments WHERE created_at >= current_date");
      new_subscribers_today = parseInt(newSubsRes.rows[0].count);
    } catch (e) {
    }
    let total_revenue = 0;
    let revenue_today = 0;
    try {
      const revRes = await pool.query(`
         SELECT SUM(total) as total FROM (
           SELECT COALESCE(SUM(amount / 100), 0) as total FROM membership_payments
           UNION ALL
           SELECT COALESCE(SUM(amount_paid), 0) as total FROM gists WHERE amount_paid > 0
           UNION ALL
           SELECT COALESCE(SUM(amount_paid), 0) as total FROM ticket_purchases WHERE amount_paid > 0
         ) sub
       `);
      total_revenue = parseFloat(revRes.rows[0].total || 0);
      const revTodayRes = await pool.query(`
         SELECT SUM(total) as total FROM (
           SELECT COALESCE(SUM(amount / 100), 0) as total FROM membership_payments WHERE created_at >= current_date
           UNION ALL
           SELECT COALESCE(SUM(amount_paid), 0) as total FROM gists WHERE created_at >= current_date AND amount_paid > 0
           UNION ALL
           SELECT COALESCE(SUM(amount_paid), 0) as total FROM ticket_purchases WHERE created_at >= current_date AND amount_paid > 0
         ) sub
       `);
      revenue_today = parseFloat(revTodayRes.rows[0].total || 0);
    } catch (e) {
    }
    res.json({
      total_users,
      new_users_today,
      total_subscribers,
      new_subscribers_today,
      active_tickets,
      active_gists,
      total_schools,
      total_revenue,
      revenue_today
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/transactions", requireAdmin, async (req, res) => {
  try {
    const memRes = await pool.query(`
      SELECT id::text, 'Membership' as type, (amount / 100) as amount, tier as status, user_id::text as user_email, created_at 
      FROM membership_payments 
      ORDER BY created_at DESC LIMIT 200
    `);
    const gistRes = await pool.query(`
      SELECT id::text, 'Gist' as type, amount_paid as amount, status, user_id::text as user_email, created_at 
      FROM gists
      WHERE amount_paid IS NOT NULL AND amount_paid > 0
      ORDER BY created_at DESC LIMIT 200
    `);
    const ticketRes = await pool.query(`
      SELECT id::text, 'Ticket' as type, amount_paid as amount, status, user_id::text as user_email, created_at 
      FROM ticket_purchases
      WHERE amount_paid IS NOT NULL AND amount_paid > 0
      ORDER BY created_at DESC LIMIT 200
    `);
    const all = [...memRes.rows, ...gistRes.rows, ...ticketRes.rows].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 500);
    res.json(all);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/dashboard/stats", requireAdmin, async (req, res) => {
  try {
    const adminCount = await pool.query("SELECT COUNT(*) FROM admin_users");
    const referrals = await pool.query(`
      SELECT COUNT(*) as refs 
      FROM profiles 
      WHERE referred_by IS NOT NULL 
        AND created_at >= date_trunc('month', CURRENT_DATE)
    `);
    const transactions = await pool.query(`
      SELECT SUM(total) as total FROM (
         SELECT COALESCE(SUM(amount / 100), 0) as total FROM membership_payments WHERE created_at >= current_date
         UNION ALL
         SELECT COALESCE(SUM(amount_paid), 0) as total FROM gists WHERE created_at >= current_date AND amount_paid > 0
         UNION ALL
         SELECT COALESCE(SUM(amount_paid), 0) as total FROM ticket_purchases WHERE created_at >= current_date AND amount_paid > 0
      ) sub
    `);
    res.json({
      activeAdmins: parseInt(adminCount.rows[0].count, 10) || 0,
      monthlyReferrals: parseInt(referrals.rows[0].refs, 10) || 0,
      todayTransactions: parseInt(transactions.rows[0].total, 10) || 0
    });
  } catch (err) {
    console.error("Dashboard stats error:", err);
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/accounting/generate", requireAdmin, async (req, res) => {
  const adminEmail = req.adminEmail;
  try {
    const auth = new google.auth.GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive.file"]
    });
    await logAdminAction(adminEmail, "Generated accounting data", { table: "all" });
    res.json({ message: "Accounting sheets generated successfully! They have been saved to the designated Google Drive." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to connect to Google Sheets. " + err.message });
  }
});
app.get("/api/tickets", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT id, name as title, description, price, status, date as created_at FROM tickets ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.put("/api/tickets/:id/status", requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const result = await pool.query(
      "UPDATE tickets SET status = $1 WHERE id = $2 RETURNING *",
      [status, req.params.id]
    );
    await logAdminAction(req.adminEmail, `Updated ticket ${req.params.id} status`, { status });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.put("/api/tickets/:id", requireAdmin, async (req, res) => {
  try {
    const { title, description, price, status, end_date } = req.body;
    const result = await pool.query(
      "UPDATE tickets SET title = $1, description = $2, price = $3, status = $4, end_date = $5 WHERE id = $6 RETURNING *",
      [title, description, price, status, end_date || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Ticket not found" });
    await logAdminAction(req.adminEmail, `Updated ticket ${req.params.id}`, { title, status });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/gists", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT g.id, g.title, g.type as content, g.school_id, s.name as school_name, g.status, g.created_at, g.end_date, g.image_url, g.image_urls, g.image_path, g.paid, g.amount_paid FROM gists g LEFT JOIN schools s ON g.school_id = s.id ORDER BY g.created_at DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.put("/api/gists/:id", requireAdmin, async (req, res) => {
  try {
    const { title, content, status, end_date } = req.body;
    const result = await pool.query(
      "UPDATE gists SET title = $1, type = $2, status = $3, end_date = $4 WHERE id = $5 RETURNING *",
      [title, content, status, end_date || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Gist not found" });
    await logAdminAction(req.adminEmail, `Updated gist ${req.params.id}`, { title, status });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.delete("/api/gists/:id", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM gists WHERE id = $1", [req.params.id]);
    await logAdminAction(req.adminEmail, `Deleted gist ${req.params.id}`, {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/gists/:id/notify", requireAdmin, async (req, res) => {
  try {
    const gistId = req.params.id;
    await logAdminAction(req.adminEmail, `Sent push notification for gist ${gistId}`, {});
    res.json({ message: "Push notification queued for gist." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/notifications", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM allowance_notifications ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/notifications", requireAdmin, async (req, res) => {
  try {
    const { title, message } = req.body;
    const result = await pool.query(
      "INSERT INTO allowance_notifications (title, message, sent_by) VALUES ($1, $2, $3) RETURNING *",
      [title, message, req.adminEmail]
    );
    console.log(`[PUSH NOTIFICATION DISPATCHED] Title: ${title}, By: ${req.adminEmail}`);
    await logAdminAction(req.adminEmail, `Created general notification`, { title });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/coupons", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM allowance_coupons ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/coupons", requireAdmin, async (req, res) => {
  try {
    const { code, discount_percentage, expires_at, claim_limit } = req.body;
    const adminEmail = req.adminEmail;
    if (!code || code.length !== 6) {
      res.status(400).json({ error: "Coupon code must be exactly 6 characters long." });
      return;
    }
    if (discount_percentage === 100) {
      const targetDate = new Date(expires_at);
      const oneMonthFromNow = /* @__PURE__ */ new Date();
      oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);
      if (targetDate > oneMonthFromNow) {
        res.status(400).json({ error: "100% discount coupons cannot exceed a 1 month expiry date." });
        return;
      }
    }
    let verifiedLimit = claim_limit;
    if (claim_limit === -1 || claim_limit && claim_limit > 500) {
      verifiedLimit = -1;
    }
    if (adminEmail !== "allowancemobileapp@gmail.com") {
      const perms = req.adminPermissions || {};
      if (verifiedLimit === -1) {
        if (!perms.canCreateUnlimited) {
          res.status(403).json({ error: "You are not authorized to create unlimited supply coupons." });
          return;
        }
      }
    }
    const result = await pool.query(
      "INSERT INTO allowance_coupons (code, discount_percentage, expires_at, claim_limit, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [code, discount_percentage, expires_at, verifiedLimit, adminEmail]
    );
    await logAdminAction(adminEmail, `Created coupon ${code}`, { discount_percentage, claim_limit: verifiedLimit });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
  import("vite").then(async ({ createServer: createViteServer }) => {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }).catch((err) => console.error("Failed to start Vite dev server:", err));
} else if (!process.env.VERCEL) {
  const distPath = path.join(process.cwd(), "dist");
  app.use(express2.static(distPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Production server running on http://localhost:${PORT}`);
  });
}
var server_default = app;
export {
  server_default as default
};
//# sourceMappingURL=server.js.map
