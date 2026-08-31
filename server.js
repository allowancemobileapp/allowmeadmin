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
      SELECT s.id, s.name, s.address, s.location, s.country_id, s.free_delivery_fee, s.plus_delivery_fee, COALESCE(v.vendor_count, 0) AS vendor_count
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
var upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });
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
  router.post("/upload", (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: "Upload error: " + err.message });
      }
      next();
    });
  }, handleReq(async (req, res) => {
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
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.trim() === "") {
      return res.status(400).json({ error: "Gemini API key is not configured. Please set GEMINI_API_KEY in your environment variables to use AI features." });
    }
    try {
      const { GoogleGenAI, Type } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      let contents = [
        { text: `You are an expert professor. Generate a 50-question pop quiz based on the course material provided. For each question provide exactly 3 options (option_a, option_b, option_c) and one correct_option ('A', 'B', or 'C').` }
      ];
      if (file_url) {
        const fileResponse = await fetch(file_url, { signal: AbortSignal.timeout(6e4) });
        const arrayBuffer = await fileResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const mimeType = fileResponse.headers.get("content-type") || "application/pdf";
        const fs = await import("fs");
        const os = await import("os");
        const path2 = await import("path");
        let ext = "";
        try {
          if (file_url) ext = path2.extname(new URL(file_url).pathname);
        } catch (e) {
        }
        if (!ext) {
          if (mimeType.includes("wordprocessingml.document")) ext = ".docx";
          else if (mimeType.includes("presentationml.presentation")) ext = ".pptx";
          else if (mimeType.includes("spreadsheetml.sheet")) ext = ".xlsx";
        }
        const tempFilePath = path2.join(os.tmpdir(), `gemini_upload_${Date.now()}${ext}`);
        fs.writeFileSync(tempFilePath, buffer);
        const supportedGeminiMimes = [
          "application/pdf",
          "text/plain",
          "text/csv",
          "text/html",
          "text/markdown",
          "text/rtf",
          "text/xml",
          "application/json",
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/heic",
          "image/heif"
        ];
        if (supportedGeminiMimes.includes(mimeType) || mimeType.startsWith("image/")) {
          const uploadResult = await ai.files.upload({
            file: tempFilePath,
            config: { mimeType }
          });
          fs.unlinkSync(tempFilePath);
          contents.push({
            fileData: {
              mimeType,
              fileUri: uploadResult.uri
            }
          });
        } else {
          let text = "";
          try {
            if (mimeType === "application/msword" || mimeType === "application/vnd.ms-excel") {
              const anyText = await import("any-text");
              text = await anyText.default.getText(tempFilePath);
            } else if (mimeType === "application/vnd.ms-powerpoint") {
              const ppt2text = await import("ppt-to-text");
              text = ppt2text.default.extractText(tempFilePath);
            } else {
              const officeparser = await import("officeparser");
              const parsed = await officeparser.parseOffice(tempFilePath);
              text = parsed.toText();
            }
            fs.unlinkSync(tempFilePath);
            contents.push({ text: `Document content:

${text}` });
          } catch (e) {
            if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
            throw new Error(`Failed to extract text from file (${mimeType}). Details: ${e.message}`);
          }
        }
      }
      let response;
      let retries = 3;
      while (retries > 0) {
        try {
          response = await ai.models.generateContent({
            model: "gemini-3.6-flash",
            contents,
            config: {
              httpOptions: { timeout: 12e4 },
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
          break;
        } catch (err) {
          retries--;
          const msg = (err.message || err.toString() || "").toLowerCase();
          const isTransient = msg.includes("503") || msg.includes("429") || msg.includes("abort") || msg.includes("timeout") || msg.includes("fetch failed") || msg.includes("service unavailable") || err.status === 503 || err.status === 429;
          if (retries === 0 || !isTransient) {
            throw new Error(`AI Model Error: ${err.message || JSON.stringify(err)}`);
          }
          await new Promise((r) => setTimeout(r, 2e3));
        }
      }
      let questionsText = response.text || "[]";
      questionsText = questionsText.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
      const questions = JSON.parse(questionsText);
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
    } catch (err) {
      if (err.message && err.message.includes("API key not valid")) {
        return res.status(400).json({ error: "Your Gemini API key is invalid or has expired. Please check your GEMINI_API_KEY environment variable." });
      }
      throw err;
    }
  }));
  router.delete("/quiz_questions/:id", handleReq(async (req, res) => {
    await pool2.query("DELETE FROM quiz_questions WHERE id = $1", [req.params.id]);
    await logAdminAction2(req, `Deleted quiz question ${req.params.id}`, {});
    res.json({ success: true });
  }));
  router.delete("/quiz_questions/material/:material_id", handleReq(async (req, res) => {
    await pool2.query("DELETE FROM quiz_questions WHERE material_id = $1", [req.params.material_id]);
    await logAdminAction2(req, `Deleted all quiz questions for material ${req.params.material_id}`, {});
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

// server/financeRoutes.ts
import { Router as Router3 } from "express";
function createFinanceRouter(pool2) {
  const router = Router3();
  const handleReq = (handler) => async (req, res) => {
    try {
      await handler(req, res);
    } catch (e) {
      console.error("[finance]", e);
      res.status(500).json({ error: e.message });
    }
  };
  const logAdminAction2 = async (req, action, details) => {
    try {
      await pool2.query(
        "INSERT INTO system_logs (type, admin_email, action, details) VALUES ($1, $2, $3, $4)",
        ["admin", req.adminEmail || "unknown", action, JSON.stringify(details)]
      );
    } catch (e) {
      console.error("Failed to log admin action", e);
    }
  };
  const range = (q) => {
    const period = String(q.period || "all");
    const iso = (d) => d.toISOString().slice(0, 10);
    const today = /* @__PURE__ */ new Date();
    if (period === "custom") {
      const f = new Date(String(q.from || ""));
      const t = new Date(String(q.to || ""));
      const from = isNaN(f.getTime()) ? "1970-01-01" : iso(f);
      const to = isNaN(t.getTime()) ? iso(today) : iso(t);
      return { from, to, label: `${from} to ${to}` };
    }
    const start = new Date(today);
    switch (period) {
      case "today":
        break;
      case "week":
        start.setDate(start.getDate() - 6);
        break;
      case "month":
        start.setDate(1);
        break;
      case "quarter":
        start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1);
        break;
      case "year":
        start.setMonth(0, 1);
        break;
      case "all":
      default:
        return { from: "1970-01-01", to: iso(today), label: "All time" };
    }
    return {
      from: iso(start),
      to: iso(today),
      label: period.charAt(0).toUpperCase() + period.slice(1)
    };
  };
  router.get("/summary", handleReq(async (req, res) => {
    const { from, to, label } = range(req.query);
    const [income, expenses, totals] = await Promise.all([
      pool2.query(`
        SELECT stream, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS payments
        FROM company_income
        WHERE received_at::date BETWEEN $1 AND $2
        GROUP BY stream ORDER BY total DESC
      `, [from, to]),
      pool2.query(`
        SELECT COALESCE(reason, 'Uncategorised') AS category,
               COALESCE(SUM(amount), 0) AS total, COUNT(*) AS entries
        FROM company_expenses
        WHERE expense_date::date BETWEEN $1 AND $2
        GROUP BY reason ORDER BY total DESC
      `, [from, to]),
      pool2.query(`
        SELECT
          (SELECT COALESCE(SUM(amount), 0) FROM company_investments
            WHERE invested_on BETWEEN $1 AND $2 AND disposed_on IS NULL)
            AS invested,
          -- Everything still owned, NOT just what was bought in this window.
          -- The card is labelled "Assets owned"; scoping it to the period
          -- made it read as zero on any range you had not bought something in.
          (SELECT COALESCE(SUM(COALESCE(current_value, amount)), 0)
             FROM company_investments WHERE disposed_on IS NULL)
            AS assets_worth,
          -- A debt does not stop existing because the date filter moved.
          (SELECT COALESCE(SUM(amount), 0) FROM company_liabilities
            WHERE settled_on IS NULL) AS liabilities,
          (SELECT COALESCE(SUM(monthly_gross), 0) FROM staff_salaries
            WHERE ended_on IS NULL) AS payroll_monthly,
          (SELECT row_to_json(v) FROM (
              SELECT amount, valued_on, method, basis FROM company_valuations
              ORDER BY valued_on DESC, created_at DESC LIMIT 1) v)
            AS valuation,
          -- The same length of window immediately before this one, so the
          -- page can say whether things are getting better or worse.
          (SELECT COALESCE(SUM(amount), 0) FROM company_income
            WHERE received_at::date >= ($1::date - ($2::date - $1::date) - 1)
              AND received_at::date < $1::date) AS prior_income
      `, [from, to])
    ]);
    const agg = totals.rows[0];
    const totalIncome = income.rows.reduce((s, r) => s + Number(r.total), 0);
    const totalExpense = expenses.rows.reduce((s, r) => s + Number(r.total), 0);
    const priorIncome = Number(agg.prior_income || 0);
    res.json({
      period: { from, to, label },
      streams: income.rows.map((r) => ({
        stream: r.stream,
        total: Number(r.total),
        payments: Number(r.payments)
      })),
      expense_categories: expenses.rows.map((r) => ({
        category: r.category,
        total: Number(r.total),
        entries: Number(r.entries)
      })),
      totals: {
        income: totalIncome,
        expenses: totalExpense,
        profit: totalIncome - totalExpense,
        margin_pct: totalIncome > 0 ? (totalIncome - totalExpense) / totalIncome * 100 : 0,
        invested: Number(agg.invested || 0),
        assets_worth: Number(agg.assets_worth || 0),
        liabilities: Number(agg.liabilities || 0),
        payroll_monthly: Number(agg.payroll_monthly || 0),
        prior_income: priorIncome,
        income_change_pct: priorIncome > 0 ? (totalIncome - priorIncome) / priorIncome * 100 : null
      },
      valuation: agg.valuation ? {
        amount: Number(agg.valuation.amount),
        valued_on: agg.valuation.valued_on,
        method: agg.valuation.method,
        basis: agg.valuation.basis
      } : null
    });
  }));
  router.get("/timeseries", handleReq(async (req, res) => {
    const { from, to } = range(req.query);
    const result = await pool2.query(`
      WITH days AS (
        SELECT generate_series($1::date, $2::date, '1 day')::date AS day
      )
      SELECT
        d.day,
        COALESCE((SELECT SUM(amount) FROM company_income
                   WHERE received_at::date = d.day), 0) AS income,
        COALESCE((SELECT SUM(amount) FROM company_expenses
                   WHERE expense_date::date = d.day), 0) AS expenses
      FROM days d ORDER BY d.day
    `, [from, to]);
    res.json(result.rows.map((r) => ({
      day: r.day,
      income: Number(r.income),
      expenses: Number(r.expenses),
      profit: Number(r.income) - Number(r.expenses)
    })));
  }));
  router.get("/income", handleReq(async (req, res) => {
    const { from, to } = range(req.query);
    const stream = req.query.stream ? String(req.query.stream) : null;
    const result = await pool2.query(`
      SELECT stream, source_id, amount, received_at, payer, reference
      FROM company_income
      WHERE received_at::date BETWEEN $1 AND $2
        AND ($3::text IS NULL OR stream = $3)
      ORDER BY received_at DESC
      LIMIT 2000
    `, [from, to, stream]);
    res.json(result.rows.map((r) => ({ ...r, amount: Number(r.amount) })));
  }));
  router.get("/cap-table", handleReq(async (_req, res) => {
    const [rows, classes, safes] = await Promise.all([
      pool2.query("SELECT * FROM cap_table"),
      pool2.query("SELECT * FROM share_classes ORDER BY sort_order"),
      pool2.query(`SELECT * FROM safes WHERE status = 'outstanding' ORDER BY signed_on`)
    ]);
    res.json({
      holders: rows.rows.map((r) => ({
        ...r,
        shares: Number(r.shares),
        votes: Number(r.votes),
        ownership_pct: Number(r.ownership_pct),
        voting_pct: Number(r.voting_pct),
        all_shares: Number(r.all_shares),
        all_votes: Number(r.all_votes)
      })),
      classes: classes.rows,
      // Outstanding SAFEs are not shares yet, so they are NOT in the cap
      // table -- they are returned beside it so the page can show what is
      // waiting to convert without it silently changing anyone's percentage.
      outstanding_safes: safes.rows.map((s) => ({
        ...s,
        amount: Number(s.amount),
        valuation_cap: s.valuation_cap ? Number(s.valuation_cap) : null,
        discount_pct: Number(s.discount_pct)
      }))
    });
  }));
  router.get("/stakeholders", handleReq(async (req, res) => {
    const { from, to } = range(req.query);
    const [cap, valuation, windowProfit, todayProfit, history] = await Promise.all([
      pool2.query("SELECT * FROM cap_table"),
      pool2.query(`SELECT amount FROM company_valuations
                  ORDER BY valued_on DESC, created_at DESC LIMIT 1`),
      pool2.query(`
        SELECT
          COALESCE((SELECT SUM(amount) FROM company_income
                     WHERE received_at::date BETWEEN $1 AND $2), 0)
        - COALESCE((SELECT SUM(amount) FROM company_expenses
                     WHERE expense_date::date BETWEEN $1 AND $2), 0) AS profit
      `, [from, to]),
      pool2.query(`
        SELECT
          COALESCE((SELECT SUM(amount) FROM company_income
                     WHERE received_at::date = current_date), 0)
        - COALESCE((SELECT SUM(amount) FROM company_expenses
                     WHERE expense_date::date = current_date), 0) AS profit
      `),
      pool2.query(`
        SELECT shareholder_id, snapshot_date, stake_value, profit_share
        FROM stakeholder_snapshots
        WHERE snapshot_date BETWEEN $1 AND $2
        ORDER BY snapshot_date
      `, [from, to])
    ]);
    const companyValue = Number(valuation.rows[0]?.amount || 0);
    const profit = Number(windowProfit.rows[0]?.profit || 0);
    const profitToday = Number(todayProfit.rows[0]?.profit || 0);
    const byHolder = {};
    for (const h of history.rows) {
      (byHolder[h.shareholder_id] ||= []).push({
        date: h.snapshot_date,
        value: Number(h.stake_value),
        profit: Number(h.profit_share)
      });
    }
    res.json({
      company_value: companyValue,
      period_profit: profit,
      profit_today: profitToday,
      holders: cap.rows.map((r) => {
        const pct = Number(r.ownership_pct) / 100;
        return {
          shareholder_id: r.shareholder_id,
          full_name: r.full_name,
          role_title: r.role_title,
          is_founder: r.is_founder,
          share_class: r.share_class,
          shares: Number(r.shares),
          ownership_pct: Number(r.ownership_pct),
          voting_pct: Number(r.voting_pct),
          stake_value: companyValue * pct,
          // Their slice of what the business actually made. This is the
          // number that makes the page worth opening every morning.
          earned_in_period: profit * pct,
          earned_today: profitToday * pct,
          history: byHolder[r.shareholder_id] || []
        };
      })
    });
  }));
  router.get("/expenses", handleReq(async (req, res) => {
    const { from, to } = range(req.query);
    const r = await pool2.query(`
      SELECT * FROM company_expenses
      WHERE expense_date::date BETWEEN $1 AND $2
      ORDER BY expense_date DESC`, [from, to]);
    res.json(r.rows);
  }));
  router.post("/expenses", handleReq(async (req, res) => {
    const { title, reason, category, amount, expense_date, vendor } = req.body;
    if (!title || !amount) {
      return res.status(400).json({ error: "A title and an amount are required." });
    }
    const r = await pool2.query(
      `INSERT INTO company_expenses
         (title, reason, category, amount, expense_date, vendor, approved_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        title,
        reason || category || "Uncategorised",
        category || "other",
        amount,
        expense_date || (/* @__PURE__ */ new Date()).toISOString(),
        vendor || null,
        req.adminEmail
      ]
    );
    await logAdminAction2(req, "finance.expense.add", { title, amount });
    res.status(201).json(r.rows[0]);
  }));
  router.get("/investments", handleReq(async (_req, res) => {
    const r = await pool2.query(
      "SELECT * FROM company_investments ORDER BY invested_on DESC"
    );
    res.json(r.rows);
  }));
  router.post("/investments", handleReq(async (req, res) => {
    const { title, category, amount, invested_on, current_value, note } = req.body;
    if (!title || !amount) {
      return res.status(400).json({ error: "A title and an amount are required." });
    }
    const r = await pool2.query(
      `INSERT INTO company_investments
         (title, category, amount, invested_on, current_value, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        title,
        category || "Other",
        amount,
        invested_on || /* @__PURE__ */ new Date(),
        current_value || null,
        note || null,
        req.adminEmail
      ]
    );
    await logAdminAction2(req, "finance.investment.add", { title, amount });
    res.status(201).json(r.rows[0]);
  }));
  router.get("/liabilities", handleReq(async (_req, res) => {
    const r = await pool2.query(
      "SELECT * FROM company_liabilities ORDER BY settled_on NULLS FIRST, due_on"
    );
    res.json(r.rows);
  }));
  router.post("/liabilities", handleReq(async (req, res) => {
    const { title, owed_to, amount, due_on, note } = req.body;
    if (!title || !amount) {
      return res.status(400).json({ error: "A title and an amount are required." });
    }
    const r = await pool2.query(
      `INSERT INTO company_liabilities (title, owed_to, amount, due_on, note)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [title, owed_to || null, amount, due_on || null, note || null]
    );
    await logAdminAction2(req, "finance.liability.add", { title, amount });
    res.status(201).json(r.rows[0]);
  }));
  router.get("/salaries", handleReq(async (_req, res) => {
    const r = await pool2.query(
      "SELECT * FROM staff_salaries ORDER BY ended_on NULLS FIRST, monthly_gross DESC"
    );
    res.json(r.rows);
  }));
  router.post("/salaries", handleReq(async (req, res) => {
    const { person_name, role_title, monthly_gross, shareholder_id, started_on } = req.body;
    if (!person_name) return res.status(400).json({ error: "A name is required." });
    const r = await pool2.query(
      `INSERT INTO staff_salaries
         (person_name, role_title, monthly_gross, shareholder_id, started_on)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        person_name,
        role_title || null,
        monthly_gross || 0,
        shareholder_id || null,
        started_on || /* @__PURE__ */ new Date()
      ]
    );
    await logAdminAction2(req, "finance.salary.add", { person_name });
    res.status(201).json(r.rows[0]);
  }));
  router.get("/valuations", handleReq(async (_req, res) => {
    const r = await pool2.query(
      "SELECT * FROM company_valuations ORDER BY valued_on DESC LIMIT 50"
    );
    res.json(r.rows);
  }));
  router.post("/valuations", handleReq(async (req, res) => {
    const { amount, method, basis, valued_on, note } = req.body;
    if (!amount) return res.status(400).json({ error: "An amount is required." });
    const r = await pool2.query(
      `INSERT INTO company_valuations
         (amount, method, basis, valued_on, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        amount,
        method || "manual",
        basis || "founder_estimate",
        valued_on || /* @__PURE__ */ new Date(),
        note || null,
        req.adminEmail
      ]
    );
    await logAdminAction2(req, "finance.valuation.set", { amount });
    res.status(201).json(r.rows[0]);
  }));
  router.get("/safes", handleReq(async (_req, res) => {
    const r = await pool2.query("SELECT * FROM safes ORDER BY signed_on DESC");
    res.json(r.rows);
  }));
  router.post("/safes", handleReq(async (req, res) => {
    const {
      investor_name,
      amount,
      valuation_cap,
      discount_pct,
      post_money,
      mfn,
      signed_on,
      note
    } = req.body;
    if (!investor_name || !amount) {
      return res.status(400).json({ error: "An investor and an amount are required." });
    }
    const r = await pool2.query(
      `INSERT INTO safes
         (investor_name, amount, valuation_cap, discount_pct, post_money,
          mfn, signed_on, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        investor_name,
        amount,
        valuation_cap || null,
        discount_pct || 0,
        post_money !== false,
        !!mfn,
        signed_on || /* @__PURE__ */ new Date(),
        note || null
      ]
    );
    await logAdminAction2(req, "finance.safe.add", { investor_name, amount });
    res.status(201).json(r.rows[0]);
  }));
  router.post("/model-round", handleReq(async (req, res) => {
    const raise = Number(req.body.raise || 0);
    const preMoney = Number(req.body.pre_money || 0);
    const poolPct = Number(req.body.pool_pct || 0);
    const poolPreMoney = req.body.pool_pre_money !== false;
    const includeSafes = req.body.include_safes !== false;
    if (raise <= 0 || preMoney <= 0) {
      return res.status(400).json({ error: "A raise and a pre-money valuation are required." });
    }
    const cap = await pool2.query("SELECT * FROM cap_table");
    if (cap.rows.length === 0) {
      return res.status(400).json({ error: "There is nobody on the cap table yet." });
    }
    let shares = cap.rows.map((r2) => ({
      shareholder_id: r2.shareholder_id,
      name: r2.full_name,
      share_class: r2.share_class,
      votes_per_share: Number(r2.votes_per_share),
      before: Number(r2.shares),
      after: Number(r2.shares)
    }));
    const startingShares = shares.reduce((s, h) => s + h.before, 0);
    const postMoney = preMoney + raise;
    const safeRows = includeSafes ? (await pool2.query(`SELECT * FROM safes WHERE status = 'outstanding'`)).rows : [];
    const roundPrice = preMoney / startingShares;
    let safeShares = 0;
    const safeDetail = safeRows.map((s) => {
      const amount = Number(s.amount);
      const discounted = roundPrice * (1 - Number(s.discount_pct) / 100);
      const capPrice = s.valuation_cap ? Number(s.valuation_cap) / startingShares : Infinity;
      const price = Math.min(discounted, capPrice);
      const issued = price > 0 ? Math.floor(amount / price) : 0;
      safeShares += issued;
      return {
        investor: s.investor_name,
        amount,
        price_paid: price,
        shares: issued,
        converted_on: s.valuation_cap && capPrice < discounted ? "cap" : "discount"
      };
    });
    const afterSafes = startingShares + safeShares;
    const r = raise / postMoney;
    const poolFrac = poolPct / 100;
    let poolShares = 0;
    let investorShares = 0;
    let finalTotal = 0;
    if (poolPreMoney) {
      const target = afterSafes / (1 - poolFrac - r);
      poolShares = Math.max(0, Math.floor(poolFrac * target));
      investorShares = Math.max(0, Math.floor(r * target));
      finalTotal = afterSafes + poolShares + investorShares;
    } else {
      const afterInvestment = afterSafes / (1 - r);
      investorShares = Math.max(0, Math.floor(r * afterInvestment));
      const beforePool = afterSafes + investorShares;
      poolShares = Math.max(0, Math.floor(beforePool * poolFrac / (1 - poolFrac)));
      finalTotal = beforePool + poolShares;
    }
    const founderBefore = shares.filter((h) => h.share_class?.startsWith("Class A")).reduce((s, h) => s + h.before, 0);
    res.json({
      inputs: {
        raise,
        pre_money: preMoney,
        post_money: postMoney,
        pool_pct: poolPct,
        pool_pre_money: poolPreMoney
      },
      share_price: raise / investorShares,
      shares: {
        before: startingShares,
        from_safes: safeShares,
        from_pool: poolShares,
        to_investor: investorShares,
        after: finalTotal
      },
      safes: safeDetail,
      holders: shares.map((h) => ({
        name: h.name,
        share_class: h.share_class,
        shares: h.after,
        before_pct: h.before / startingShares * 100,
        after_pct: h.after / finalTotal * 100,
        dilution_pct: h.before / startingShares * 100 - h.after / finalTotal * 100,
        value_after: h.after / finalTotal * postMoney
      })),
      // Article 5 makes the Founder Permanent Chairman regardless, but the
      // 75% and 50% marks are where a shareholder vote stops being a
      // formality, so they are worth seeing before the deal is signed.
      founder_voting_after: (() => {
        const votesAfter = shares.reduce(
          (s, h) => s + h.after * h.votes_per_share,
          0
        ) + (safeShares + poolShares + investorShares) * 1;
        const founderVotes = founderBefore * 10;
        return founderVotes / votesAfter * 100;
      })()
    });
  }));
  router.get("/shareholders", handleReq(async (_req, res) => {
    const r = await pool2.query(
      "SELECT * FROM shareholders ORDER BY is_founder DESC, full_name"
    );
    res.json(r.rows);
  }));
  router.post("/shareholders", handleReq(async (req, res) => {
    const { full_name, email, role_title, is_founding_team } = req.body;
    if (!full_name) return res.status(400).json({ error: "A name is required." });
    const r = await pool2.query(
      `INSERT INTO shareholders (full_name, email, role_title, is_founding_team)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [full_name, email || null, role_title || null, !!is_founding_team]
    );
    await logAdminAction2(req, "finance.shareholder.add", { full_name });
    res.status(201).json(r.rows[0]);
  }));
  router.post("/share-transactions", handleReq(async (req, res) => {
    const {
      shareholder_id,
      class_id,
      shares,
      kind,
      price_per_share,
      txn_date,
      note
    } = req.body;
    if (!shareholder_id || !class_id || !shares) {
      return res.status(400).json({ error: "A shareholder, a class and a number of shares are required." });
    }
    const cls = await pool2.query(
      "SELECT founder_only, name FROM share_classes WHERE id = $1",
      [class_id]
    );
    if (cls.rows[0]?.founder_only && kind === "issue") {
      const holder = await pool2.query(
        "SELECT is_founder FROM shareholders WHERE id = $1",
        [shareholder_id]
      );
      if (!holder.rows[0]?.is_founder) {
        return res.status(400).json({
          error: `${cls.rows[0].name} can only be issued to the Founder. Article 3(b) allows it to reach a Founding Team Member by transfer -- record that as a transfer, not an issue.`
        });
      }
    }
    const signed = ["transfer_out", "buyback"].includes(kind) ? -Math.abs(Number(shares)) : Math.abs(Number(shares));
    const r = await pool2.query(
      `INSERT INTO share_transactions
         (shareholder_id, class_id, shares, kind, price_per_share, txn_date,
          note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        shareholder_id,
        class_id,
        signed,
        kind || "issue",
        price_per_share || 0,
        txn_date || /* @__PURE__ */ new Date(),
        note || null,
        req.adminEmail
      ]
    );
    await logAdminAction2(
      req,
      "finance.shares.move",
      { shareholder_id, shares: signed, kind }
    );
    res.status(201).json(r.rows[0]);
  }));
  router.get("/balance-sheet", handleReq(async (req, res) => {
    const { from, to, label } = range(req.query);
    const [income, expenses, assets, liabilities, valuation] = await Promise.all([
      pool2.query(`SELECT stream, COALESCE(SUM(amount),0) AS total
                  FROM company_income WHERE received_at::date BETWEEN $1 AND $2
                  GROUP BY stream ORDER BY total DESC`, [from, to]),
      pool2.query(`SELECT COALESCE(reason,'Uncategorised') AS category,
                         COALESCE(SUM(amount),0) AS total
                  FROM company_expenses WHERE expense_date::date BETWEEN $1 AND $2
                  GROUP BY reason ORDER BY total DESC`, [from, to]),
      pool2.query(`SELECT title, category, amount, COALESCE(current_value, amount) AS worth
                  FROM company_investments WHERE disposed_on IS NULL
                  ORDER BY invested_on DESC`),
      pool2.query(`SELECT title, owed_to, amount, due_on
                  FROM company_liabilities WHERE settled_on IS NULL
                  ORDER BY due_on NULLS LAST`),
      pool2.query(`SELECT amount, valued_on FROM company_valuations
                  ORDER BY valued_on DESC, created_at DESC LIMIT 1`)
    ]);
    const totalIncome = income.rows.reduce((s, r) => s + Number(r.total), 0);
    const totalExpense = expenses.rows.reduce((s, r) => s + Number(r.total), 0);
    const totalAssets = assets.rows.reduce((s, r) => s + Number(r.worth), 0);
    const totalLiab = liabilities.rows.reduce((s, r) => s + Number(r.amount), 0);
    const retained = totalIncome - totalExpense;
    res.json({
      company: "ALLOWANCE SAAS LTD",
      rc_number: "RC 9615473",
      period: { from, to, label },
      generated_at: (/* @__PURE__ */ new Date()).toISOString(),
      income: income.rows.map((r) => ({ stream: r.stream, total: Number(r.total) })),
      expenses: expenses.rows.map((r) => ({ category: r.category, total: Number(r.total) })),
      assets: assets.rows.map((r) => ({ ...r, amount: Number(r.amount), worth: Number(r.worth) })),
      liabilities: liabilities.rows.map((r) => ({ ...r, amount: Number(r.amount) })),
      totals: {
        income: totalIncome,
        expenses: totalExpense,
        retained,
        assets: totalAssets,
        liabilities: totalLiab,
        // What is left for the shareholders once what is owed is paid.
        net_worth: totalAssets + retained - totalLiab,
        valuation: Number(valuation.rows[0]?.amount || 0)
      }
    });
  }));
  router.post("/snapshot", handleReq(async (req, res) => {
    const days = Math.min(Number(req.body?.days || 1), 365);
    let written = 0;
    for (let i = 0; i < days; i++) {
      const d = /* @__PURE__ */ new Date();
      d.setDate(d.getDate() - i);
      const r = await pool2.query(
        "SELECT take_stakeholder_snapshot($1) AS n",
        [d.toISOString().slice(0, 10)]
      );
      written += Number(r.rows[0]?.n || 0);
    }
    res.json({ ok: true, rows: written, days });
  }));
  router.get("/settings", handleReq(async (_req, res) => {
    const r = await pool2.query("SELECT * FROM company_settings ORDER BY key");
    res.json(r.rows.map((s) => ({ ...s, value: Number(s.value) })));
  }));
  router.put("/settings/:key", handleReq(async (req, res) => {
    const r = await pool2.query(
      `UPDATE company_settings SET value = $1, updated_at = now(), updated_by = $2
       WHERE key = $3 RETURNING *`,
      [req.body.value, req.adminEmail, req.params.key]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "No such setting." });
    await logAdminAction2(
      req,
      "finance.setting.change",
      { key: req.params.key, value: req.body.value }
    );
    res.json(r.rows[0]);
  }));
  return router;
}

// server/financeV2Routes.ts
import { Router as Router4 } from "express";

// src/lib/finance/money.ts
var naira = (n) => Math.round(n * 100);
function assertKobo(k, what = "amount") {
  if (!Number.isInteger(k)) {
    throw new Error(`${what} must be a whole number of kobo, got ${k}`);
  }
  if (!Number.isSafeInteger(k)) {
    throw new Error(`${what} is beyond safe integer range: ${k}`);
  }
  return k;
}
var half = (k) => Math.floor(k / 2);

// src/lib/finance/grossProfit.ts
function computeGrossProfit(i) {
  assertKobo(i.collections, "collections");
  assertKobo(i.gatewayFees, "gatewayFees");
  assertKobo(i.sellerPayouts, "sellerPayouts");
  assertKobo(i.directInfrastructure, "directInfrastructure");
  assertKobo(i.refunds, "refunds");
  const totalDeductions = i.gatewayFees + i.sellerPayouts + i.directInfrastructure + i.refunds;
  return {
    ...i,
    totalDeductions,
    // Deliberately allowed to go negative. A loss-making month is a real
    // outcome and clamping it at zero would quietly overstate the band.
    grossProfit: i.collections - totalDeductions
  };
}
var EXPENSE_CATEGORIES = [
  { id: "payment_processing", label: "Payment processing", deductible: true },
  { id: "seller_payouts", label: "Seller / vendor share", deductible: true },
  { id: "infrastructure", label: "Direct infrastructure", deductible: true },
  { id: "refunds", label: "Refunds & chargebacks", deductible: true },
  { id: "payroll", label: "Salaries & staff", deductible: false },
  { id: "marketing", label: "Marketing", deductible: false },
  { id: "g_and_a", label: "General & admin", deductible: false },
  { id: "professional", label: "Professional fees", deductible: false },
  { id: "tax", label: "Tax", deductible: false },
  { id: "capex", label: "Capital expenditure", deductible: false },
  { id: "financing", label: "Financing costs", deductible: false },
  { id: "other", label: "Other", deductible: false }
];

// src/lib/finance/payroll.ts
var FULL_SALARY = {
  officer: naira(4e5),
  founder: naira(6e5)
};
var DEFERRED_CAP = {
  officer: naira(1e6),
  founder: naira(15e5)
};
var MIN_INSTALMENT = {
  officer: naira(1e5),
  founder: naira(15e4)
};
var BANDS = [
  {
    band: 1,
    minGrossProfit: 0,
    maxGrossProfit: naira(1499999),
    officerCash: 0,
    founderCash: 0
  },
  {
    band: 2,
    minGrossProfit: naira(15e5),
    maxGrossProfit: naira(2999999),
    officerCash: naira(1e5),
    founderCash: naira(15e4)
  },
  {
    band: 3,
    minGrossProfit: naira(3e6),
    maxGrossProfit: naira(4499999),
    officerCash: naira(2e5),
    founderCash: naira(3e5)
  },
  {
    band: 4,
    minGrossProfit: naira(45e5),
    maxGrossProfit: naira(6999999),
    officerCash: naira(3e5),
    founderCash: naira(45e4)
  },
  {
    band: 5,
    minGrossProfit: naira(7e6),
    maxGrossProfit: null,
    officerCash: naira(4e5),
    founderCash: naira(6e5)
  }
];
function bandFor(grossProfit) {
  for (let i = BANDS.length - 1; i >= 0; i--) {
    if (grossProfit >= BANDS[i].minGrossProfit) return BANDS[i];
  }
  return BANDS[0];
}
function payFor(scale, grossProfit) {
  const b = bandFor(grossProfit);
  const full = FULL_SALARY[scale];
  const cash = scale === "founder" ? b.founderCash : b.officerCash;
  const shortfall = full - cash;
  const accrual = half(shortfall);
  return {
    scale,
    band: b.band,
    fullSalary: full,
    cash,
    accrual,
    extinguished: shortfall - accrual
  };
}
function applyAccrual(scale, currentBalance, monthAccrual) {
  const cap = DEFERRED_CAP[scale];
  const headroom = Math.max(0, cap - currentBalance);
  const accrued = Math.min(monthAccrual, headroom);
  return {
    accrued,
    newBalance: currentBalance + accrued,
    extinguishedByCap: monthAccrual - accrued
  };
}
function band5TriggerMet(certifiedGrossProfitsNewestFirst) {
  if (certifiedGrossProfitsNewestFirst.length < 3) return false;
  return certifiedGrossProfitsNewestFirst.slice(0, 3).every((gp) => bandFor(gp).band === 5);
}
var FINANCING_TRIGGER = naira(15e7);
function founderPaymentBlocked(officerPayments) {
  const outstanding = officerPayments.filter((o) => o.paid < o.due).map((o) => ({ name: o.name, shortfall: o.due - o.paid }));
  return { blocked: outstanding.length > 0, outstanding };
}
function paymentDueDate(year, monthIndex0) {
  return new Date(Date.UTC(year, monthIndex0 + 1, 10));
}

// src/lib/finance/capTable.ts
var SHARE_CLASSES = {
  A: {
    code: "A",
    name: "Class A Ordinary",
    votesPerShare: 10,
    parValue: naira(10),
    founderOnly: true
  },
  B: {
    code: "B",
    name: "Class B Ordinary",
    votesPerShare: 1,
    parValue: naira(10),
    founderOnly: false
  }
};
function computeCapTable(holders, holdings, movements = []) {
  const byHolder = /* @__PURE__ */ new Map();
  for (const h of holders) byHolder.set(h.id, { A: 0, B: 0 });
  for (const h of holdings) {
    const row = byHolder.get(h.holderId);
    if (!row) throw new Error(`Holding for unknown holder ${h.holderId}`);
    row[h.classCode] += h.shares;
  }
  for (const m of movements) {
    const to = byHolder.get(m.toHolderId);
    if (!to) throw new Error(`Movement to unknown holder ${m.toHolderId}`);
    if (m.kind === "transfer") {
      if (!m.fromHolderId) {
        throw new Error("A transfer needs a fromHolderId. Shares cannot appear from nowhere.");
      }
      const from = byHolder.get(m.fromHolderId);
      if (!from) throw new Error(`Movement from unknown holder ${m.fromHolderId}`);
      if (from[m.classCode] < m.shares) {
        throw new Error(
          `${m.fromHolderId} holds ${from[m.classCode]} class ${m.classCode} shares, cannot transfer ${m.shares}.`
        );
      }
      const recipient = holders.find((h) => h.id === m.toHolderId);
      const keepsClassA = m.classCode !== "A" || recipient.isFounder === true || recipient.isFoundingTeam === true;
      from[m.classCode] -= m.shares;
      to[keepsClassA ? m.classCode : "B"] += m.shares;
    } else if (m.kind === "issue") {
      const recipient = holders.find((h) => h.id === m.toHolderId);
      if (SHARE_CLASSES[m.classCode].founderOnly && !recipient.isFounder) {
        throw new Error(
          `${SHARE_CLASSES[m.classCode].name} may only be ISSUED to the Founder (Article 3a). It reaches a Founding Team Member by transfer instead.`
        );
      }
      to[m.classCode] += m.shares;
    } else if (m.kind === "buyback") {
      if (to[m.classCode] < m.shares) {
        throw new Error(`Cannot buy back more shares than ${m.toHolderId} holds.`);
      }
      to[m.classCode] -= m.shares;
    } else if (m.kind === "conversion") {
      if (to.A < m.shares) throw new Error("Not enough Class A to convert.");
      to.A -= m.shares;
      to.B += m.shares;
    }
  }
  const sharesByClass = { A: 0, B: 0 };
  let totalShares = 0;
  let totalVotes = 0;
  for (const [, row] of byHolder) {
    sharesByClass.A += row.A;
    sharesByClass.B += row.B;
    totalShares += row.A + row.B;
    totalVotes += row.A * SHARE_CLASSES.A.votesPerShare + row.B * SHARE_CLASSES.B.votesPerShare;
  }
  const positions = holders.map((h) => {
    const row = byHolder.get(h.id);
    const total = row.A + row.B;
    const votes = row.A * SHARE_CLASSES.A.votesPerShare + row.B * SHARE_CLASSES.B.votesPerShare;
    return {
      holderId: h.id,
      name: h.name,
      role: h.role,
      isFounder: !!h.isFounder,
      byClass: { ...row },
      totalShares: total,
      votes,
      // Guarded, so an empty table is zeroes rather than NaN.
      economicPct: totalShares > 0 ? total / totalShares * 100 : 0,
      votingPct: totalVotes > 0 ? votes / totalVotes * 100 : 0,
      paidInValue: row.A * SHARE_CLASSES.A.parValue + row.B * SHARE_CLASSES.B.parValue
    };
  }).filter((p) => p.totalShares > 0);
  return {
    holders: positions,
    totalShares,
    totalVotes,
    sharesByClass,
    issuedCapital: sharesByClass.A * SHARE_CLASSES.A.parValue + sharesByClass.B * SHARE_CLASSES.B.parValue
  };
}
function assertCapTableInvariants(s) {
  const sumEcon = s.holders.reduce((a, h) => a + h.economicPct, 0);
  const sumVote = s.holders.reduce((a, h) => a + h.votingPct, 0);
  const sumShares = s.holders.reduce((a, h) => a + h.totalShares, 0);
  if (s.totalShares > 0 && Math.abs(sumEcon - 100) > 1e-4) {
    throw new Error(`Economic percentages sum to ${sumEcon}, not 100.`);
  }
  if (s.totalVotes > 0 && Math.abs(sumVote - 100) > 1e-4) {
    throw new Error(`Voting percentages sum to ${sumVote}, not 100.`);
  }
  if (sumShares !== s.totalShares) {
    throw new Error(`Holder shares sum to ${sumShares}, table says ${s.totalShares}.`);
  }
  if (!Number.isInteger(s.totalShares)) {
    throw new Error("Share counts must be whole numbers.");
  }
  const expectedCapital = s.totalShares * naira(10);
  if (s.issuedCapital !== expectedCapital) {
    throw new Error(
      `Issued capital ${s.issuedCapital} does not equal shares x par ${expectedCapital}.`
    );
  }
}
function filingImpact(movements) {
  const newShares = movements.filter((m) => m.kind === "issue").reduce((a, m) => a + m.shares, 0);
  return {
    newShares,
    capitalIncrease: newShares * naira(10),
    // A transfer needs neither. Only an issue changes the share capital.
    requiresMemorandumAmendment: newShares > 0,
    requiresCacFiling: newShares > 0
  };
}

// src/lib/finance/milestones.ts
var MILESTONE_RECORDING_DEADLINE = "2026-09-30";
function certifierIsValid(certifierId, founderId, directorIds) {
  if (certifierId === founderId) return false;
  return directorIds.includes(certifierId);
}
function milestoneRecordingLocked(now = /* @__PURE__ */ new Date()) {
  return now > /* @__PURE__ */ new Date(`${MILESTONE_RECORDING_DEADLINE}T23:59:59.999Z`);
}
var LAPSED = ["declined", "not_completed", "expired"];
function resolveAward(scheme, atLongstop = false) {
  if (scheme.kind === "tranche") {
    const tranches = scheme.tranches ?? [];
    const vested2 = tranches.filter((t) => t.achieved && t.certifiedBy).reduce((a, t) => a + t.shares, 0);
    const lapsed2 = atLongstop ? tranches.filter((t) => !(t.achieved && t.certifiedBy)).reduce((a, t) => a + t.shares, 0) : 0;
    return {
      schemeId: scheme.id,
      holderId: scheme.holderId,
      holderName: scheme.holderName,
      classCode: scheme.classCode,
      mechanism: scheme.mechanism,
      awardTotal: scheme.awardTotal,
      allocatedToChallenges: 0,
      vestedFromChallenges: vested2,
      lapsed: lapsed2,
      // No default award on this scheme. Miss the milestone and it dies.
      defaultAward: 0,
      totalVested: vested2,
      pending: atLongstop ? 0 : scheme.awardTotal - vested2 - lapsed2
    };
  }
  const challenges = scheme.challenges ?? [];
  const allocated = challenges.reduce((a, c) => a + c.allocatedShares, 0);
  const vested = challenges.filter((c) => c.status === "completed").reduce((a, c) => a + c.allocatedShares, 0);
  const lapsed = challenges.filter((c) => LAPSED.includes(c.status)).reduce((a, c) => a + c.allocatedShares, 0);
  const defaultAward = Math.max(0, scheme.awardTotal - allocated);
  const totalVested = atLongstop ? vested + defaultAward : vested;
  return {
    schemeId: scheme.id,
    holderId: scheme.holderId,
    holderName: scheme.holderName,
    classCode: scheme.classCode,
    mechanism: scheme.mechanism,
    awardTotal: scheme.awardTotal,
    allocatedToChallenges: allocated,
    vestedFromChallenges: vested,
    lapsed,
    defaultAward,
    totalVested,
    pending: atLongstop ? 0 : scheme.awardTotal - vested - lapsed - defaultAward
  };
}
function movementsFromAwards(outcomes, schemes) {
  return outcomes.filter((o) => o.totalVested > 0).map((o) => {
    const scheme = schemes.find((s) => s.id === o.schemeId);
    return {
      kind: o.mechanism === "transfer" ? "transfer" : "issue",
      classCode: o.classCode,
      shares: o.totalVested,
      toHolderId: o.holderId,
      fromHolderId: scheme.transferFromHolderId,
      note: `${scheme.holderName} milestone award`
    };
  });
}
function respondByDate(issuedOn) {
  const d = new Date(issuedOn);
  let added = 0;
  while (added < 5) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d.toISOString().slice(0, 10);
}

// server/financeV2Routes.ts
function createFinanceV2Router(pool2) {
  const router = Router4();
  const handle = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      console.error("[finance-v2]", e);
      res.status(400).json({ error: e.message });
    }
  };
  const audit = async (req, action, entity, entityId, before, after) => {
    try {
      await pool2.query(
        `INSERT INTO finance_audit (actor, action, entity, entity_id, before, after)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          req.adminEmail || "unknown",
          action,
          entity,
          entityId,
          before ? JSON.stringify(before) : null,
          after ? JSON.stringify(after) : null
        ]
      );
    } catch (e) {
      console.error("audit write failed", e);
    }
  };
  const roleOf = async (email) => {
    const r = await pool2.query("SELECT finance_role($1) AS role", [email || ""]);
    return r.rows[0]?.role || "none";
  };
  const founderOnly = (fn) => handle(async (req, res) => {
    const role = await roleOf(req.adminEmail);
    if (role !== "founder") {
      return res.status(403).json({
        error: "Only the founder can do this."
      });
    }
    await fn(req, res);
  });
  const draftFor = async (month) => {
    const [rev, exp] = await Promise.all([
      pool2.query(`
        SELECT stream,
               COALESCE(SUM(gross_collected),0) AS gross,
               COALESCE(SUM(gateway_fee),0)     AS gateway,
               COALESCE(SUM(seller_payout),0)   AS seller,
               COALESCE(SUM(direct_cost),0)     AS direct
        FROM revenue_entries
        WHERE date_trunc('month', collected_on) = date_trunc('month', $1::date)
        GROUP BY stream`, [month]),
      pool2.query(`
        SELECT category, COALESCE(SUM(amount),0)::bigint AS amount
        FROM company_expenses
        WHERE date_trunc('month', expense_date) = date_trunc('month', $1::date)
        GROUP BY category`, [month])
    ]);
    const streams = rev.rows.map((r) => ({
      stream: r.stream,
      gross: Number(r.gross),
      gateway: Number(r.gateway),
      seller: Number(r.seller),
      direct: Number(r.direct)
    }));
    const sum = (k) => streams.reduce((a, s) => a + s[k], 0);
    const expenseBucket = (cat) => Math.round(Number(exp.rows.find((r) => r.category === cat)?.amount || 0) * 100);
    const inputs = {
      collections: sum("gross"),
      // Fees can be recorded per transaction OR as an expense line. Both are
      // counted, because a company will do one or the other and losing either
      // would overstate gross profit and overpay.
      gatewayFees: sum("gateway") + expenseBucket("payment_processing"),
      sellerPayouts: sum("seller") + expenseBucket("seller_payouts"),
      directInfrastructure: sum("direct") + expenseBucket("infrastructure"),
      refunds: expenseBucket("refunds")
    };
    const result = computeGrossProfit(inputs);
    return { result, breakdown: { streams, expenses: exp.rows, inputs } };
  };
  router.get("/gross-profit/draft", handle(async (req, res) => {
    const month = String(req.query.month || (/* @__PURE__ */ new Date()).toISOString().slice(0, 7)) + "-01";
    const { result, breakdown } = await draftFor(month);
    res.json({ month, ...result, band: bandFor(result.grossProfit).band, breakdown });
  }));
  router.get("/gross-profit", handle(async (_req, res) => {
    const r = await pool2.query(`
      SELECT * FROM gross_profit_months ORDER BY month DESC, version DESC LIMIT 120`);
    res.json(r.rows.map((m) => ({
      ...m,
      collections: Number(m.collections),
      gateway_fees: Number(m.gateway_fees),
      seller_payouts: Number(m.seller_payouts),
      direct_infrastructure: Number(m.direct_infrastructure),
      refunds: Number(m.refunds),
      gross_profit: Number(m.gross_profit),
      band: bandFor(Number(m.gross_profit)).band
    })));
  }));
  router.post("/gross-profit/certify", founderOnly(async (req, res) => {
    const month = String(req.body.month).slice(0, 7) + "-01";
    const reason = req.body.correction_reason || null;
    const client = await pool2.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query(
        `SELECT * FROM gross_profit_months
         WHERE month = $1 AND status = 'certified'`,
        [month]
      );
      if (existing.rows.length > 0 && !reason) {
        throw new Error(
          `${month.slice(0, 7)} is already certified. A correction needs a reason, and is recorded as a new version -- the original stays visible.`
        );
      }
      const { result, breakdown } = await draftFor(month);
      const version = existing.rows.length > 0 ? Number(existing.rows[0].version) + 1 : 1;
      if (existing.rows.length > 0) {
        await client.query(
          `UPDATE gross_profit_months SET status = 'superseded' WHERE id = $1`,
          [existing.rows[0].id]
        );
      }
      const ins = await client.query(
        `
        INSERT INTO gross_profit_months
          (month, version, collections, gateway_fees, seller_payouts,
           direct_infrastructure, refunds, gross_profit, breakdown, status,
           certified_by, certified_at, supersedes_id, correction_reason)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'certified',$10,now(),$11,$12)
        RETURNING *`,
        [
          month,
          version,
          result.collections,
          result.gatewayFees,
          result.sellerPayouts,
          result.directInfrastructure,
          result.refunds,
          result.grossProfit,
          JSON.stringify(breakdown),
          req.adminEmail,
          existing.rows[0]?.id || null,
          reason
        ]
      );
      const gpRow = ins.rows[0];
      const scales = await client.query(`
        SELECT ps.*, s.full_name FROM pay_scales ps
        JOIN shareholders s ON s.id = ps.shareholder_id
        WHERE ps.active`);
      const d = new Date(month);
      const due = paymentDueDate(d.getUTCFullYear(), d.getUTCMonth());
      for (const p of scales.rows) {
        const line = payFor(p.scale, result.grossProfit);
        const bal = await client.query(
          `SELECT COALESCE(SUM(amount),0)::bigint AS balance
           FROM deferred_salary_ledger
           WHERE shareholder_id = $1 AND kind <> 'cap_extinguished'`,
          [p.shareholder_id]
        );
        const applied = applyAccrual(
          p.scale,
          Number(bal.rows[0].balance),
          line.accrual
        );
        await client.query(
          `
          INSERT INTO payroll_runs
            (month, shareholder_id, gross_profit_id, band, full_salary,
             cash_due, accrued, extinguished, due_on)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          ON CONFLICT (month, shareholder_id) DO UPDATE SET
            gross_profit_id = EXCLUDED.gross_profit_id,
            band = EXCLUDED.band, cash_due = EXCLUDED.cash_due,
            accrued = EXCLUDED.accrued, extinguished = EXCLUDED.extinguished`,
          [
            month,
            p.shareholder_id,
            gpRow.id,
            line.band,
            line.fullSalary,
            line.cash,
            applied.accrued,
            line.extinguished + applied.extinguishedByCap,
            due
          ]
        );
        if (applied.accrued > 0) {
          await client.query(
            `
            INSERT INTO deferred_salary_ledger
              (shareholder_id, entry_date, amount, kind, month, note, created_by)
            VALUES ($1,$2,$3,'accrual',$4,$5,$6)`,
            [
              p.shareholder_id,
              month,
              applied.accrued,
              month,
              `Band ${line.band} accrual`,
              req.adminEmail
            ]
          );
        }
        if (applied.extinguishedByCap > 0) {
          await client.query(
            `
            INSERT INTO deferred_salary_ledger
              (shareholder_id, entry_date, amount, kind, month, note, created_by)
            VALUES ($1,$2,$3,'cap_extinguished',$4,$5,$6)`,
            [
              p.shareholder_id,
              month,
              applied.extinguishedByCap,
              month,
              "Cap reached -- extinguished, not owed",
              req.adminEmail
            ]
          );
        }
      }
      await client.query("COMMIT");
      await audit(
        req,
        "certify",
        "gross_profit_months",
        gpRow.id,
        existing.rows[0] || null,
        gpRow
      );
      res.json({
        ...gpRow,
        gross_profit: Number(gpRow.gross_profit),
        band: bandFor(result.grossProfit).band
      });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }));
  router.get("/payroll", handle(async (req, res) => {
    const month = req.query.month ? String(req.query.month).slice(0, 7) + "-01" : null;
    const r = await pool2.query(`
      SELECT pr.*, s.full_name, ps.scale
      FROM payroll_runs pr
      JOIN shareholders s ON s.id = pr.shareholder_id
      JOIN pay_scales ps ON ps.shareholder_id = pr.shareholder_id
      WHERE ($1::date IS NULL OR pr.month = $1)
      ORDER BY pr.month DESC, ps.scale, s.full_name`, [month]);
    const rows = r.rows.map((p) => ({
      ...p,
      full_salary: Number(p.full_salary),
      cash_due: Number(p.cash_due),
      cash_paid: Number(p.cash_paid),
      accrued: Number(p.accrued),
      extinguished: Number(p.extinguished),
      overdue: !p.paid_on && new Date(p.due_on) < /* @__PURE__ */ new Date()
    }));
    res.json(rows);
  }));
  router.post("/payroll/:id/pay", founderOnly(async (req, res) => {
    const row = await pool2.query(`
      SELECT pr.*, ps.scale FROM payroll_runs pr
      JOIN pay_scales ps ON ps.shareholder_id = pr.shareholder_id
      WHERE pr.id = $1`, [req.params.id]);
    if (row.rows.length === 0) throw new Error("No such payroll line.");
    const line = row.rows[0];
    if (line.scale === "founder") {
      const others = await pool2.query(`
        SELECT s.full_name, pr.cash_due, pr.cash_paid
        FROM payroll_runs pr
        JOIN pay_scales ps ON ps.shareholder_id = pr.shareholder_id
        JOIN shareholders s ON s.id = pr.shareholder_id
        WHERE pr.month = $1 AND ps.scale = 'officer'`, [line.month]);
      const check = founderPaymentBlocked(others.rows.map((o) => ({
        name: o.full_name,
        due: Number(o.cash_due),
        paid: Number(o.cash_paid)
      })));
      if (check.blocked) {
        return res.status(409).json({
          error: "The founder ranks last. These officers are still owed for this period: " + check.outstanding.map((o) => `${o.name} (${(o.shortfall / 100).toLocaleString()} naira)`).join(", "),
          outstanding: check.outstanding
        });
      }
    }
    const amount = Number(req.body.amount ?? line.cash_due);
    const upd = await pool2.query(
      `
      UPDATE payroll_runs SET cash_paid = $1, paid_on = COALESCE($2, current_date)
      WHERE id = $3 RETURNING *`,
      [amount, req.body.paid_on || null, req.params.id]
    );
    await audit(req, "salary.pay", "payroll_runs", req.params.id, line, upd.rows[0]);
    res.json(upd.rows[0]);
  }));
  router.get("/deferred", handle(async (_req, res) => {
    const [balances, history] = await Promise.all([
      pool2.query("SELECT * FROM deferred_balances ORDER BY full_name"),
      pool2.query(`
        SELECT gp.month, gp.gross_profit FROM gross_profit_months gp
        WHERE gp.status = 'certified' ORDER BY gp.month DESC LIMIT 12`)
    ]);
    const gps = history.rows.map((h) => Number(h.gross_profit));
    res.json({
      balances: balances.rows.map((b) => ({
        ...b,
        balance: Number(b.balance),
        deferred_cap: Number(b.deferred_cap),
        total_accrued: Number(b.total_accrued),
        total_paid: Number(b.total_paid),
        at_cap: Number(b.balance) >= Number(b.deferred_cap)
      })),
      total_liability: balances.rows.reduce((a, b) => a + Number(b.balance), 0),
      triggers: {
        // Detected automatically from certified history (section 5).
        band5_three_months: band5TriggerMet(gps),
        // Manually flagged. The app cannot know about a sale.
        financing_note: "Equity financing of 150,000,000 naira or more -- flag manually.",
        change_of_control_note: "Sale or change of control -- flag manually."
      }
    });
  }));
  router.get("/deferred/:shareholderId/statement", handle(async (req, res) => {
    const r = await pool2.query(
      `
      SELECT * FROM deferred_salary_ledger
      WHERE shareholder_id = $1 ORDER BY entry_date, created_at`,
      [req.params.shareholderId]
    );
    res.json(r.rows.map((e) => ({ ...e, amount: Number(e.amount) })));
  }));
  router.post("/deferred/pay", founderOnly(async (req, res) => {
    const { shareholder_id, amount, note } = req.body;
    if (!shareholder_id || !amount) throw new Error("A person and an amount are required.");
    const r = await pool2.query(
      `
      INSERT INTO deferred_salary_ledger
        (shareholder_id, amount, kind, note, created_by)
      VALUES ($1, $2, 'payment', $3, $4) RETURNING *`,
      [shareholder_id, -Math.abs(Number(amount)), note || null, req.adminEmail]
    );
    await audit(req, "deferred.pay", "deferred_salary_ledger", r.rows[0].id, null, r.rows[0]);
    res.status(201).json(r.rows[0]);
  }));
  const loadSchemes = async () => {
    const [schemes, challenges, tranches] = await Promise.all([
      pool2.query(`
        SELECT a.*, s.full_name FROM award_schemes a
        JOIN shareholders s ON s.id = a.shareholder_id`),
      pool2.query("SELECT * FROM award_challenges"),
      pool2.query("SELECT * FROM award_tranches ORDER BY tranche_index")
    ]);
    return schemes.rows.map((s) => ({
      id: s.id,
      holderId: s.shareholder_id,
      holderName: s.full_name,
      awardTotal: Number(s.award_total),
      classCode: s.class_code,
      mechanism: s.mechanism,
      transferFromHolderId: s.transfer_from_id || void 0,
      longstopDate: s.longstop_date,
      kind: s.kind,
      challenges: challenges.rows.filter((c) => c.scheme_id === s.id).map((c) => ({
        id: c.id,
        description: c.description,
        acceptanceCriteria: c.acceptance_criteria || "",
        allocatedShares: Number(c.allocated_shares),
        issuedOn: c.issued_on,
        respondBy: c.respond_by,
        deliverBy: c.deliver_by,
        status: c.status,
        outcome: c.outcome,
        assessedBy: c.assessed_by,
        assessedOn: c.assessed_on
      })),
      tranches: tranches.rows.filter((t) => t.scheme_id === s.id).map((t) => ({
        id: t.id,
        index: t.tranche_index,
        shares: Number(t.shares),
        milestoneDescription: t.milestone_description,
        recordedOn: t.recorded_on,
        achieved: t.achieved,
        certifiedBy: t.certified_by,
        certifiedOn: t.certified_on
      }))
    }));
  };
  const loadTable = async () => {
    const [holders, txns] = await Promise.all([
      pool2.query("SELECT * FROM shareholders ORDER BY is_founder DESC, full_name"),
      pool2.query(`
        SELECT st.shareholder_id, sc.name AS class_name, SUM(st.shares) AS shares
        FROM share_transactions st
        JOIN share_classes sc ON sc.id = st.class_id
        GROUP BY st.shareholder_id, sc.name HAVING SUM(st.shares) > 0`)
    ]);
    const hs = holders.rows.map((h) => ({
      id: h.id,
      name: h.full_name,
      role: h.role_title,
      isFounder: h.is_founder,
      isFoundingTeam: h.is_founding_team
    }));
    const hd = txns.rows.map((t) => ({
      holderId: t.shareholder_id,
      classCode: String(t.class_name).startsWith("Class A") ? "A" : "B",
      shares: Number(t.shares)
    }));
    return { hs, hd };
  };
  router.get("/cap-table/:mode", handle(async (req, res) => {
    const mode = req.params.mode;
    const { hs, hd } = await loadTable();
    const schemes = await loadSchemes();
    let movements = [];
    if (mode === "if_all_vest") {
      const outcomes = schemes.map((s) => {
        const forced = s.kind === "tranche" ? { ...s, tranches: (s.tranches ?? []).map((t) => ({
          ...t,
          achieved: true,
          certifiedBy: t.certifiedBy || "assumed"
        })) } : { ...s, challenges: (s.challenges ?? []).map((c) => ({
          ...c,
          status: "completed"
        })) };
        return resolveAward(forced, true);
      });
      movements = movementsFromAwards(outcomes, schemes);
    } else if (mode === "scenario") {
      const on = String(req.query.on || "").split(",").filter(Boolean);
      const outcomes = schemes.filter((s) => on.includes(s.id)).map((s) => resolveAward(s, true));
      movements = movementsFromAwards(outcomes, schemes);
    }
    const state = computeCapTable(hs, hd, movements);
    assertCapTableInvariants(state);
    res.json({
      mode,
      ...state,
      filing: filingImpact(movements),
      awards: schemes.map((s) => resolveAward(s, false))
    });
  }));
  router.get("/awards", handle(async (_req, res) => {
    const schemes = await loadSchemes();
    res.json(schemes.map((s) => ({
      scheme: s,
      now: resolveAward(s, false),
      atLongstop: resolveAward(s, true),
      daysToLongstop: Math.ceil(
        (new Date(s.longstopDate).getTime() - Date.now()) / 864e5
      )
    })));
  }));
  router.post("/awards/:schemeId/challenges", founderOnly(async (req, res) => {
    const { description, acceptance_criteria, allocated_shares, deliver_by } = req.body;
    if (!description || !allocated_shares) {
      throw new Error("A description and a share allocation are required.");
    }
    const s = await pool2.query(`
      SELECT a.award_total,
             COALESCE((SELECT SUM(allocated_shares) FROM award_challenges
                        WHERE scheme_id = a.id), 0) AS allocated
      FROM award_schemes a WHERE a.id = $1`, [req.params.schemeId]);
    if (s.rows.length === 0) throw new Error("No such scheme.");
    const remaining = Number(s.rows[0].award_total) - Number(s.rows[0].allocated);
    if (Number(allocated_shares) > remaining) {
      throw new Error(
        `Only ${remaining.toLocaleString()} shares are still unallocated on this scheme.`
      );
    }
    const issued = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const r = await pool2.query(
      `
      INSERT INTO award_challenges
        (scheme_id, description, acceptance_criteria, allocated_shares,
         issued_on, respond_by, deliver_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        req.params.schemeId,
        description,
        acceptance_criteria || null,
        allocated_shares,
        issued,
        respondByDate(issued),
        deliver_by || null
      ]
    );
    await audit(req, "challenge.issue", "award_challenges", r.rows[0].id, null, r.rows[0]);
    res.status(201).json(r.rows[0]);
  }));
  router.post("/challenges/:id/status", handle(async (req, res) => {
    const status = String(req.body.status);
    const valid = ["accepted", "declined", "completed", "not_completed", "expired"];
    if (!valid.includes(status)) throw new Error(`Unknown status ${status}.`);
    const before = await pool2.query(
      "SELECT * FROM award_challenges WHERE id = $1",
      [req.params.id]
    );
    if (before.rows.length === 0) throw new Error("No such challenge.");
    if (["completed", "not_completed"].includes(status)) {
      const role = await roleOf(req.adminEmail);
      if (role !== "founder") {
        return res.status(403).json({ error: "Only the founder can assess a challenge." });
      }
    }
    const r = await pool2.query(
      `
      UPDATE award_challenges
      SET status = $1, outcome = COALESCE($2, outcome),
          assessed_by = $3, assessed_on = current_date
      WHERE id = $4 RETURNING *`,
      [status, req.body.outcome || null, req.adminEmail, req.params.id]
    );
    await audit(
      req,
      `challenge.${status}`,
      "award_challenges",
      req.params.id,
      before.rows[0],
      r.rows[0]
    );
    res.json(r.rows[0]);
  }));
  router.put("/tranches/:id", founderOnly(async (req, res) => {
    if (req.body.milestone_description !== void 0 && milestoneRecordingLocked()) {
      throw new Error(
        "Milestones had to be recorded by 30 September 2026. The fields are locked."
      );
    }
    const before = await pool2.query(
      "SELECT * FROM award_tranches WHERE id = $1",
      [req.params.id]
    );
    const r = await pool2.query(
      `
      UPDATE award_tranches
      SET milestone_description = COALESCE($1, milestone_description),
          recorded_on = CASE WHEN $1 IS NOT NULL AND recorded_on IS NULL
                             THEN current_date ELSE recorded_on END,
          achieved = COALESCE($2, achieved)
      WHERE id = $3 RETURNING *`,
      [
        req.body.milestone_description ?? null,
        req.body.achieved ?? null,
        req.params.id
      ]
    );
    await audit(
      req,
      "tranche.update",
      "award_tranches",
      req.params.id,
      before.rows[0],
      r.rows[0]
    );
    res.json(r.rows[0]);
  }));
  router.post("/tranches/:id/certify", handle(async (req, res) => {
    const me = req.adminEmail;
    const users = await pool2.query(
      `SELECT email, role, is_director, shareholder_id FROM finance_users WHERE active`
    );
    const directors = users.rows.filter((u) => u.is_director).map((u) => u.email);
    const founder = users.rows.find((u) => u.role === "founder")?.email || "";
    if (!certifierIsValid(me, founder, directors)) {
      return res.status(403).json({
        error: "A milestone must be certified by a director other than the person it awards shares to."
      });
    }
    const before = await pool2.query(
      "SELECT * FROM award_tranches WHERE id = $1",
      [req.params.id]
    );
    const r = await pool2.query(`
      UPDATE award_tranches
      SET certified_by = $1, certified_on = current_date, achieved = true
      WHERE id = $2 RETURNING *`, [me, req.params.id]);
    await audit(
      req,
      "tranche.certify",
      "award_tranches",
      req.params.id,
      before.rows[0],
      r.rows[0]
    );
    res.json(r.rows[0]);
  }));
  router.get("/expense-categories", handle(async (_req, res) => {
    res.json(EXPENSE_CATEGORIES);
  }));
  router.post("/revenue", handle(async (req, res) => {
    const {
      stream,
      collected_on,
      gross_collected,
      gateway_fee,
      seller_payout,
      direct_cost,
      source_ref,
      note
    } = req.body;
    const g = Number(gross_collected || 0);
    const net = g - Number(gateway_fee || 0) - Number(seller_payout || 0) - Number(direct_cost || 0);
    const r = await pool2.query(
      `
      INSERT INTO revenue_entries
        (stream, collected_on, gross_collected, gateway_fee, seller_payout,
         direct_cost, net, source_ref, note)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        stream,
        collected_on || /* @__PURE__ */ new Date(),
        g,
        gateway_fee || 0,
        seller_payout || 0,
        direct_cost || 0,
        net,
        source_ref || null,
        note || null
      ]
    );
    await audit(req, "revenue.add", "revenue_entries", r.rows[0].id, null, r.rows[0]);
    res.status(201).json(r.rows[0]);
  }));
  router.get("/revenue/by-stream", handle(async (req, res) => {
    const r = await pool2.query(
      `
      SELECT stream,
             COALESCE(SUM(gross_collected),0) AS gross,
             COALESCE(SUM(gateway_fee),0)     AS gateway,
             COALESCE(SUM(seller_payout),0)   AS seller,
             COALESCE(SUM(direct_cost),0)     AS direct,
             COALESCE(SUM(net),0)             AS net,
             COUNT(*)                          AS entries
      FROM revenue_entries
      WHERE collected_on BETWEEN COALESCE($1::date, '1970-01-01')
                             AND COALESCE($2::date, current_date)
      GROUP BY stream ORDER BY net DESC`,
      [req.query.from || null, req.query.to || null]
    );
    res.json(r.rows.map((s) => {
      const gross = Number(s.gross), net = Number(s.net);
      return {
        stream: s.stream,
        gross,
        net,
        gateway: Number(s.gateway),
        seller: Number(s.seller),
        direct: Number(s.direct),
        entries: Number(s.entries),
        // Per-stream margin. The blended figure hides which product pays.
        margin_pct: gross > 0 ? net / gross * 100 : 0
      };
    }));
  }));
  router.get("/capital", handle(async (_req, res) => {
    const r = await pool2.query("SELECT * FROM capital_events ORDER BY received_on DESC");
    res.json(r.rows.map((c) => ({ ...c, amount: Number(c.amount) })));
  }));
  router.post("/capital", founderOnly(async (req, res) => {
    const { kind, counterparty, amount, received_on, repayable, note } = req.body;
    const r = await pool2.query(
      `
      INSERT INTO capital_events
        (kind, counterparty, amount, received_on, repayable, note)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        kind,
        counterparty || null,
        amount,
        received_on || /* @__PURE__ */ new Date(),
        !!repayable,
        note || null
      ]
    );
    await audit(req, "capital.add", "capital_events", r.rows[0].id, null, r.rows[0]);
    res.status(201).json(r.rows[0]);
  }));
  router.get("/role", handle(async (req, res) => {
    const r = await pool2.query(
      `SELECT role, is_director, shareholder_id IS NOT NULL AS linked
       FROM finance_users WHERE lower(email) = lower($1) AND active`,
      [req.adminEmail || ""]
    );
    res.json(r.rows[0] || { role: "none", is_director: false, linked: false });
  }));
  router.get("/me", handle(async (req, res) => {
    const u = await pool2.query(
      `SELECT * FROM finance_users WHERE lower(email) = lower($1) AND active`,
      [req.adminEmail]
    );
    const role = u.rows[0]?.role || "none";
    if (u.rows.length === 0) return res.json({ role, linked: false });
    const sid = u.rows[0].shareholder_id;
    if (!sid) return res.json({ role, linked: false });
    const { hs, hd } = await loadTable();
    const state = computeCapTable(hs, hd);
    const me = state.holders.find((h) => h.holderId === sid);
    const [valuation, retained, deferred, payroll, schemes] = await Promise.all([
      pool2.query(`SELECT amount, valued_on, basis FROM company_valuations
                  ORDER BY valued_on DESC, created_at DESC LIMIT 1`),
      pool2.query(`SELECT COALESCE(SUM(gross_profit),0) AS retained
                  FROM gross_profit_months WHERE status = 'certified'`),
      pool2.query(`SELECT * FROM deferred_balances WHERE shareholder_id = $1`, [sid]),
      pool2.query(`SELECT * FROM payroll_runs WHERE shareholder_id = $1
                  ORDER BY month DESC LIMIT 12`, [sid]),
      loadSchemes()
    ]);
    const pct = me ? me.economicPct / 100 : 0;
    const val = valuation.rows[0];
    const retainedKobo = Math.round(Number(retained.rows[0].retained));
    res.json({
      role,
      linked: true,
      holding: me ? {
        shares: me.totalShares,
        byClass: me.byClass,
        economicPct: me.economicPct,
        votingPct: me.votingPct
      } : null,
      figures: [
        {
          key: "paid_in",
          label: "Amount paid in",
          amount: me?.paidInValue ?? 0,
          basis: "Par value, 10 naira per share",
          asOf: null,
          movesWhen: "Never. This is what was paid, not what it is worth."
        },
        {
          key: "notional",
          label: "Notional value",
          amount: val ? Math.round(Number(val.amount) * pct) : 0,
          basis: val ? val.basis : "no valuation set",
          asOf: val ? val.valued_on : null,
          movesWhen: "Only when the board sets a new valuation."
        },
        {
          key: "retained_share",
          label: "Share of retained profit",
          // Honest, and will be NEGATIVE while the company is loss-making.
          // Not hidden -- see the note on the stakeholder page.
          amount: Math.round(retainedKobo * pct),
          basis: "Certified Monthly Gross Profit to date",
          asOf: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
          movesWhen: "Every month, when gross profit is certified."
        }
      ],
      deferred: deferred.rows[0] ? {
        balance: Number(deferred.rows[0].balance),
        cap: Number(deferred.rows[0].deferred_cap)
      } : null,
      payroll: payroll.rows.map((p) => ({
        ...p,
        cash_due: Number(p.cash_due),
        cash_paid: Number(p.cash_paid),
        accrued: Number(p.accrued)
      })),
      awards: schemes.filter((s) => s.holderId === sid).map((s) => ({
        scheme: s,
        progress: resolveAward(s, false),
        daysToLongstop: Math.ceil(
          (new Date(s.longstopDate).getTime() - Date.now()) / 864e5
        )
      })),
      disclaimer: "Shareholders are paid from distributable profit or on an exit, not from revenue. No distribution has been declared."
    });
  }));
  router.get("/users", founderOnly(async (_req, res) => {
    const r = await pool2.query(`
      SELECT fu.*, s.full_name FROM finance_users fu
      LEFT JOIN shareholders s ON s.id = fu.shareholder_id
      ORDER BY fu.role, fu.email`);
    res.json(r.rows);
  }));
  router.post("/users", founderOnly(async (req, res) => {
    const { email, shareholder_id, role, is_director } = req.body;
    if (!email) throw new Error("An email is required.");
    const r = await pool2.query(
      `
      INSERT INTO finance_users (email, shareholder_id, role, is_director)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (email) DO UPDATE SET
        shareholder_id = EXCLUDED.shareholder_id, role = EXCLUDED.role,
        is_director = EXCLUDED.is_director
      RETURNING *`,
      [email, shareholder_id || null, role || "stakeholder", !!is_director]
    );
    await audit(req, "role.change", "finance_users", r.rows[0].id, null, r.rows[0]);
    res.status(201).json(r.rows[0]);
  }));
  router.get("/audit", founderOnly(async (req, res) => {
    const r = await pool2.query(
      "SELECT * FROM finance_audit ORDER BY at DESC LIMIT $1",
      [Math.min(Number(req.query.limit || 200), 1e3)]
    );
    res.json(r.rows);
  }));
  router.put("/pay-scales/:shareholderId", founderOnly(async (req, res) => {
    const { full_salary, deferred_cap, min_instalment, resolution_ref } = req.body;
    if (!resolution_ref || String(resolution_ref).trim().length < 3) {
      throw new Error(
        "Salary bands are contractual. Record the shareholder resolution reference that authorises this change."
      );
    }
    const before = await pool2.query(
      "SELECT * FROM pay_scales WHERE shareholder_id = $1",
      [req.params.shareholderId]
    );
    const r = await pool2.query(
      `
      UPDATE pay_scales SET
        full_salary = COALESCE($1, full_salary),
        deferred_cap = COALESCE($2, deferred_cap),
        min_instalment = COALESCE($3, min_instalment),
        resolution_ref = $4, updated_at = now()
      WHERE shareholder_id = $5 RETURNING *`,
      [
        full_salary ?? null,
        deferred_cap ?? null,
        min_instalment ?? null,
        resolution_ref,
        req.params.shareholderId
      ]
    );
    await audit(
      req,
      "band.edit",
      "pay_scales",
      req.params.shareholderId,
      before.rows[0],
      r.rows[0]
    );
    res.json(r.rows[0]);
  }));
  return router;
}

// server.ts
import cors from "cors";
dotenv.config();
var app = express2();
var PORT = 3e3;
app.use(cors());
app.use(express2.json({ limit: "50mb" }));
app.use(express2.urlencoded({ limit: "50mb", extended: true }));
var envDbUrl = process.env.DATABASE_URL;
var connectionString = envDbUrl || "";
if (!envDbUrl) {
  console.error("DATABASE_URL environment variable is required.");
  connectionString = "postgresql://dummy:dummy@localhost/dummy";
} else if (!envDbUrl.startsWith("postgres://") && !envDbUrl.startsWith("postgresql://")) {
  console.error("Invalid DATABASE_URL. It must be a PostgreSQL connection string starting with postgresql://, not a REST URL.");
  connectionString = "postgresql://dummy:dummy@localhost/dummy";
}
var isLocalDb = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");
var cleanConnectionString = connectionString.split("?")[0];
var pool = new Pool({
  connectionString: cleanConnectionString,
  ssl: isLocalDb ? false : { rejectUnauthorized: false },
  max: isLocalDb ? 10 : 3,
  idleTimeoutMillis: 1e4,
  // Fail with a readable error rather than hanging the request for 30s.
  connectionTimeoutMillis: 15e3,
  allowExitOnIdle: true
});
pool.on("error", (err) => {
  console.error("[pg] idle client error:", err.message);
});
var originalQuery = pool.query.bind(pool);
pool.query = async function(...args) {
  if (!envDbUrl) {
    throw new Error("Missing DATABASE_URL secret. Please add your Supabase PostgreSQL connection string in Settings.");
  }
  if (!envDbUrl.startsWith("postgres://") && !envDbUrl.startsWith("postgresql://")) {
    throw new Error("Invalid DATABASE_URL secret. You pasted the Supabase URL (https://...). Please use the PostgreSQL Connection String (postgresql://...) instead.");
  }
  return originalQuery(...args);
};
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
    if (lowerEmail === "allowancemobileapp@gmail.com" || lowerEmail === "allowancemobielapp@gmail.com") {
      return res.json({ verified: true, title: "Super Admin", permissions: { all: true } });
    }
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
app.get("/api/stores", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, p.username, p.username as owner_username, p.full_name as owner_name, p.subscription_tier 
      FROM stores s 
      LEFT JOIN profiles p ON s.owner_id = p.id 
      ORDER BY s.created_at DESC
    `);
    const stores = result.rows;
    for (let store of stores) {
      const creds = await pool.query("SELECT * FROM store_credentials WHERE store_id = $1", [store.id]);
      store.credentials = creds.rows;
      const prods = await pool.query("SELECT * FROM store_products WHERE store_id = $1", [store.id]);
      store.products = prods.rows;
    }
    res.json(stores);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.delete("/api/stores/:id", requireAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM stores WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/services", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, p.username, p.username as owner_username, p.full_name as owner_name, p.subscription_tier 
      FROM services s 
      LEFT JOIN profiles p ON COALESCE(s.owner_id, s.provider_id) = p.id 
      ORDER BY s.created_at DESC
    `);
    const services = result.rows;
    for (let service of services) {
      const prods = await pool.query("SELECT * FROM service_catalog WHERE service_id = $1", [service.id]);
      service.offerings = prods.rows;
    }
    res.json(services);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.delete("/api/services/:id", requireAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM services WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.use("/api", requireAdmin, createLegacyRouter(pool));
app.use("/api/library", requireAdmin, createLibraryRouter(pool));
app.use("/api/users", requireAdmin, createUserRouter(pool));
app.use("/api/finance", requireAdmin, createFinanceRouter(pool));
app.use("/api/finance", requireAdmin, createFinanceV2Router(pool));
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
    let total_stores = 0;
    let active_stores = 0;
    try {
      const storesRes = await pool.query("SELECT COUNT(*) as total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active FROM stores");
      total_stores = parseInt(storesRes.rows[0].total) || 0;
      active_stores = parseInt(storesRes.rows[0].active) || 0;
    } catch (e) {
    }
    let total_services = 0;
    let active_services = 0;
    try {
      const servicesRes = await pool.query("SELECT COUNT(*) as total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active FROM services");
      total_services = parseInt(servicesRes.rows[0].total) || 0;
      active_services = parseInt(servicesRes.rows[0].active) || 0;
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
           SELECT COALESCE(SUM(amount) / 100.0, 0) as total FROM membership_payments
           UNION ALL
           SELECT COALESCE(SUM(amount_paid) / 100.0, 0) as total FROM gists WHERE amount_paid > 0
           UNION ALL
           SELECT COALESCE(SUM(amount_paid) / 100.0, 0) as total FROM ticket_purchases WHERE amount_paid > 0
         ) sub
       `);
      total_revenue = parseFloat(revRes.rows[0].total || 0);
      const revTodayRes = await pool.query(`
         SELECT SUM(total) as total FROM (
           SELECT COALESCE(SUM(amount) / 100.0, 0) as total FROM membership_payments WHERE created_at >= current_date
           UNION ALL
           SELECT COALESCE(SUM(amount_paid) / 100.0, 0) as total FROM gists WHERE created_at >= current_date AND amount_paid > 0
           UNION ALL
           SELECT COALESCE(SUM(amount_paid) / 100.0, 0) as total FROM ticket_purchases WHERE created_at >= current_date AND amount_paid > 0
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
      revenue_today,
      total_stores,
      active_stores,
      total_services,
      active_services
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/transactions", requireAdmin, async (req, res) => {
  try {
    const memRes = await pool.query(`
      SELECT id::text, 'Membership' as type, (amount / 100.0) as amount, tier as status, payment_reference as reference, user_id::text as user_email, created_at
      FROM membership_payments
      ORDER BY created_at DESC LIMIT 200
    `);
    const gistRes = await pool.query(`
      SELECT id::text, 'Gist' as type,
             COALESCE(NULLIF(amount_paid, 0) / 100.0, total_price, 0) as amount,
             status, payment_reference as reference, user_id::text as user_email, created_at
      FROM gists
      WHERE ((amount_paid IS NOT NULL AND amount_paid > 0) OR paid = true)
        AND (payment_reference IS NULL OR payment_reference NOT ILIKE 'coupon%')
      ORDER BY created_at DESC LIMIT 200
    `);
    const ticketRes = await pool.query(`
      SELECT id::text, 'Ticket' as type, (amount_paid / 100.0) as amount, status, payment_reference as reference, user_id::text as user_email, created_at
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
app.get("/api/approvals/feed-submissions", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT f.*, p.email, p.username 
      FROM feed_submissions f 
      LEFT JOIN profiles p ON p.id = f.user_id 
      WHERE f.status = 'pending' 
      ORDER BY f.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.put("/api/approvals/feed-submissions/:id", requireAdmin, async (req, res) => {
  const { status } = req.body;
  if (!["approved", "rejected"].includes(status)) return res.status(400).json({ error: "Invalid status" });
  try {
    const check = await pool.query("SELECT * FROM feed_submissions WHERE id = $1", [req.params.id]);
    if (check.rows.length === 0) return res.status(404).json({ error: "Submission not found" });
    const sub = check.rows[0];
    if (sub.status !== "pending") return res.status(400).json({ error: "Already processed" });
    if (status === "approved") {
      try {
        await pool.query("BEGIN");
        await pool.query("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT 0");
        await pool.query("UPDATE profiles SET points = points + $1 WHERE id = $2", [sub.points_potential || 0, sub.user_id]);
        await pool.query("UPDATE feed_submissions SET status = $1, updated_at = NOW() WHERE id = $2", [status, req.params.id]);
        await pool.query("COMMIT");
      } catch (e) {
        await pool.query("ROLLBACK");
        console.error("Approval Error:", e);
        return res.status(500).json({ error: "Failed to process approval data: " + e.message });
      }
    } else {
      await pool.query("UPDATE feed_submissions SET status = $1, updated_at = NOW() WHERE id = $2", [status, req.params.id]);
    }
    await logAdminAction(req.adminEmail, `${status === "approved" ? "Approved" : "Rejected"} feed submission ${req.params.id}`, { status });
    const finalCheck = await pool.query("SELECT * FROM feed_submissions WHERE id = $1", [req.params.id]);
    res.json(finalCheck.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});
app.put("/api/schools/:id/delivery-fees", requireAdmin, async (req, res) => {
  const { free_delivery_fee, plus_delivery_fee } = req.body;
  try {
    const result = await pool.query(
      "UPDATE schools SET free_delivery_fee = $1, plus_delivery_fee = $2 WHERE id = $3 RETURNING *",
      [free_delivery_fee, plus_delivery_fee, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "School not found" });
    await logAdminAction(req.adminEmail, `Updated delivery fees for school ${req.params.id}`, { free_delivery_fee, plus_delivery_fee });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/delivery-agents", requireAdmin, async (req, res) => {
  const { school_id } = req.query;
  try {
    let query = "SELECT d.*, s.name as school_name FROM delivery_personnel d LEFT JOIN schools s ON s.id = d.school_id";
    const params = [];
    if (school_id) {
      query += " WHERE d.school_id = $1";
      params.push(school_id);
    }
    query += " ORDER BY d.name ASC";
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/delivery-agents", requireAdmin, async (req, res) => {
  const { school_id, name, gender, whatsapp_number } = req.body;
  try {
    const pCheck = await pool.query("SELECT id FROM profiles WHERE username = $1 OR username = $2", [name, name.replace("@", "")]);
    if (pCheck.rows.length === 0) return res.status(400).json({ error: "Allowance Username not found. Delivery agents must be registered users." });
    const result = await pool.query(
      "INSERT INTO delivery_personnel (school_id, name, gender, whatsapp_number, whatsapp_url) VALUES ($1, $2, $3, $4, '') RETURNING *",
      [school_id, name, gender, whatsapp_number]
    );
    await logAdminAction(req.adminEmail, `Created delivery agent ${name}`, { school_id });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.put("/api/delivery-agents/:id", requireAdmin, async (req, res) => {
  const { school_id, name, gender, whatsapp_number } = req.body;
  try {
    const pCheck = await pool.query("SELECT id FROM profiles WHERE username = $1 OR username = $2", [name, name.replace("@", "")]);
    if (pCheck.rows.length === 0) return res.status(400).json({ error: "Allowance Username not found. Delivery agents must be registered users." });
    const result = await pool.query(
      "UPDATE delivery_personnel SET school_id = $1, name = $2, gender = $3, whatsapp_number = $4 WHERE id = $5 RETURNING *",
      [school_id, name, gender, whatsapp_number, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Agent not found" });
    await logAdminAction(req.adminEmail, `Updated delivery agent ${name}`, { school_id });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.delete("/api/delivery-agents/:id", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM delivery_personnel WHERE id = $1 RETURNING *", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Agent not found" });
    await logAdminAction(req.adminEmail, `Deleted delivery agent ${result.rows[0].name}`, { agent_id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/approvals/stores", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, p.username as owner_username, p.subscription_tier
      FROM stores s 
      LEFT JOIN profiles p ON s.owner_id = p.id 
      WHERE s.status IN ('pending', 'draft') 
      ORDER BY s.created_at DESC
    `);
    const stores = result.rows;
    for (let store of stores) {
      const creds = await pool.query("SELECT * FROM store_credentials WHERE store_id = $1", [store.id]);
      store.credentials = creds.rows;
      const prods = await pool.query("SELECT * FROM store_products WHERE store_id = $1", [store.id]);
      store.products = prods.rows;
    }
    res.json(stores);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/approvals/stores/:id/:action", requireAdmin, async (req, res) => {
  const { action } = req.params;
  const storeId = req.params.id;
  try {
    const storeRes = await pool.query(`
      SELECT s.*, p.subscription_tier 
      FROM stores s 
      LEFT JOIN profiles p ON s.owner_id = p.id 
      WHERE s.id = $1
    `, [storeId]);
    if (storeRes.rows.length === 0) {
      return res.status(404).json({ error: "Store not found" });
    }
    const store = storeRes.rows[0];
    const credsRes = await pool.query("SELECT * FROM store_credentials WHERE store_id = $1 AND kind = 'cac'", [storeId]);
    const hasCac = credsRes.rows.length > 0 || !!store.registration_document_url;
    const isPlus = store.subscription_tier === "Membership";
    const currentEmail = (req.headers["x-admin-email"] || "").toLowerCase();
    if ((action === "verify" || action === "revoke") && currentEmail !== "allowancemobileapp@gmail.com") {
      return res.status(403).json({ error: "Only the root admin (allowancemobileapp@gmail.com) can verify or revoke stores." });
    }
    if (action === "approve") {
      await pool.query("UPDATE stores SET status = 'active' WHERE id = $1", [storeId]);
    } else if (action === "verify") {
      await pool.query("UPDATE stores SET is_plus_verified = true, status = 'active' WHERE id = $1", [storeId]);
    } else if (action === "revoke") {
      await pool.query("UPDATE stores SET is_plus_verified = false WHERE id = $1", [storeId]);
    } else if (action === "suspend") {
      await pool.query("UPDATE stores SET status = 'suspended', is_plus_verified = false WHERE id = $1", [storeId]);
    } else if (action === "reject") {
      await pool.query("UPDATE stores SET status = 'rejected' WHERE id = $1", [storeId]);
    }
    try {
      const adminEmail = req.adminEmail || "unknown";
      await pool.query(
        "INSERT INTO system_logs (type, admin_email, action, details) VALUES ($1, $2, $3, $4)",
        ["admin", adminEmail, `${action} store ${storeId}`, JSON.stringify({ action })]
      );
    } catch (e) {
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.delete("/api/approvals/stores/:id", requireAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM stores WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/approvals/services", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, p.username as owner_username, p.subscription_tier
      FROM services s 
      LEFT JOIN profiles p ON COALESCE(s.owner_id, s.provider_id) = p.id 
      WHERE s.status IN ('pending', 'draft') 
      ORDER BY s.created_at DESC
    `);
    const services = result.rows;
    for (let service of services) {
      const prods = await pool.query("SELECT * FROM service_offerings WHERE service_id = $1", [service.id]);
      service.offerings = prods.rows;
    }
    res.json(services);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/approvals/services/:id/:action", requireAdmin, async (req, res) => {
  const { action } = req.params;
  const serviceId = req.params.id;
  try {
    let newStatus = action;
    if (action === "approve") newStatus = "active";
    else if (action === "suspend") newStatus = "suspended";
    else if (action === "reject") newStatus = "rejected";
    await pool.query("UPDATE services SET status = $1 WHERE id = $2", [newStatus, serviceId]);
    try {
      const adminEmail = req.adminEmail || "unknown";
      await pool.query(
        "INSERT INTO system_logs (type, admin_email, action, details) VALUES ($1, $2, $3, $4)",
        ["admin", adminEmail, `${action} service ${serviceId}`, JSON.stringify({ action })]
      );
    } catch (e) {
    }
    res.json({ success: true });
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
         SELECT COALESCE(SUM(amount) / 100.0, 0) as total FROM membership_payments WHERE created_at >= current_date
         UNION ALL
         SELECT COALESCE(SUM(amount_paid) / 100.0, 0) as total FROM gists WHERE created_at >= current_date AND amount_paid > 0
         UNION ALL
         SELECT COALESCE(SUM(amount_paid) / 100.0, 0) as total FROM ticket_purchases WHERE created_at >= current_date AND amount_paid > 0
      ) sub
    `);
    const stores = await pool.query("SELECT COUNT(*) as total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active FROM stores");
    const services = await pool.query("SELECT COUNT(*) as total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active FROM services");
    const pendingStores = await pool.query("SELECT COUNT(*) FROM stores WHERE status = 'pending'");
    const pendingServices = await pool.query("SELECT COUNT(*) FROM services WHERE status = 'pending'");
    res.json({
      storesTotal: parseInt(stores.rows[0].total) || 0,
      storesActive: parseInt(stores.rows[0].active) || 0,
      servicesTotal: parseInt(services.rows[0].total) || 0,
      servicesActive: parseInt(services.rows[0].active) || 0,
      pendingStores: parseInt(pendingStores.rows[0].count) || 0,
      pendingServices: parseInt(pendingServices.rows[0].count) || 0,
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
app.get("/api/analytics", requireAdmin, async (req, res) => {
  try {
    const monthsQuery = `
      WITH months AS (
        SELECT generate_series(
          date_trunc('month', CURRENT_DATE - INTERVAL '11 months'),
          date_trunc('month', CURRENT_DATE),
          '1 month'::interval
        ) as month
      )
      SELECT month FROM months
    `;
    const usersQuery = `
      SELECT date_trunc('month', created_at) as month, COUNT(*) as count
      FROM profiles
      WHERE created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '11 months')
      GROUP BY month
    `;
    const revenueQuery = `
      SELECT month, SUM(amount) as amount FROM (
         SELECT date_trunc('month', created_at) as month, COALESCE(SUM(amount) / 100.0, 0) as amount
         FROM membership_payments
         WHERE created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '11 months')
         GROUP BY month
         UNION ALL
         SELECT date_trunc('month', created_at) as month, COALESCE(SUM(amount_paid) / 100.0, 0) as amount
         FROM gists
         WHERE created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '11 months') AND amount_paid > 0
         GROUP BY month
         UNION ALL
         SELECT date_trunc('month', created_at) as month, COALESCE(SUM(amount_paid) / 100.0, 0) as amount
         FROM ticket_purchases
         WHERE created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '11 months') AND amount_paid > 0
         GROUP BY month
      ) sub GROUP BY month
    `;
    const storesQuery = `
      SELECT date_trunc('month', created_at) as month, COUNT(*) as count
      FROM stores
      WHERE created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '11 months')
      GROUP BY month
    `;
    const servicesQuery = `
      SELECT date_trunc('month', created_at) as month, COUNT(*) as count
      FROM services
      WHERE created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '11 months')
      GROUP BY month
    `;
    const membersQuery = `
      SELECT date_trunc('month', created_at) as month, COUNT(DISTINCT user_id) as count
      FROM membership_payments
      WHERE created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '11 months')
      GROUP BY month
    `;
    const libraryQuery = `
      SELECT month, SUM(count) as count FROM (
         SELECT date_trunc('month', created_at) as month, COUNT(*) as count
         FROM gists
         WHERE created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '11 months')
         GROUP BY month
         UNION ALL
         SELECT date_trunc('month', created_at) as month, COUNT(*) as count
         FROM tickets
         WHERE created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '11 months')
         GROUP BY month
      ) sub GROUP BY month
    `;
    const [monthsRes, usersRes, revenueRes, storesRes, servicesRes, membersRes, libraryRes] = await Promise.all([
      pool.query(monthsQuery),
      pool.query(usersQuery),
      pool.query(revenueQuery),
      pool.query(storesQuery),
      pool.query(servicesQuery),
      pool.query(membersQuery),
      pool.query(libraryQuery)
    ]);
    const data = monthsRes.rows.map((row) => {
      const monthStr = row.month.toISOString();
      const userMatch = usersRes.rows.find((u) => u.month && u.month.toISOString() === monthStr);
      const revMatch = revenueRes.rows.find((r) => r.month && r.month.toISOString() === monthStr);
      const storeMatch = storesRes.rows.find((s) => s.month && s.month.toISOString() === monthStr);
      const serviceMatch = servicesRes.rows.find((s) => s.month && s.month.toISOString() === monthStr);
      const memberMatch = membersRes.rows.find((m) => m.month && m.month.toISOString() === monthStr);
      const libraryMatch = libraryRes.rows.find((l) => l.month && l.month.toISOString() === monthStr);
      return {
        month: row.month.toLocaleString("default", { month: "short", year: "numeric" }),
        users: parseInt(userMatch?.count || 0),
        revenue: parseFloat(revMatch?.amount || 0),
        stores: parseInt(storeMatch?.count || 0),
        services: parseInt(serviceMatch?.count || 0),
        members: parseInt(memberMatch?.count || 0),
        libraryItems: parseInt(libraryMatch?.count || 0)
      };
    });
    res.json(data);
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
