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
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        "File storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment."
      );
    }
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
        const cols = 7;
        const placeholders = questions.map(
          (_, i) => `(${Array.from({ length: cols }, (_2, c) => `$${i * cols + c + 1}`).join(",")})`
        ).join(",");
        const params = questions.flatMap((q) => [
          course_id,
          material_id,
          String(q.question_text ?? ""),
          String(q.option_a ?? ""),
          String(q.option_b ?? ""),
          String(q.option_c ?? ""),
          String(q.correct_option ?? "")
        ]);
        const result = await pool2.query(
          `INSERT INTO quiz_questions (course_id, material_id, question_text,
             option_a, option_b, option_c, correct_option)
           VALUES ${placeholders} RETURNING *`,
          params
        );
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
  router.get("/bootstrap", handleReq(async (req, res) => {
    const { from, to, label } = range(req.query);
    const client = await pool2.connect();
    try {
      const q = (text, params = []) => client.query(text, params);
      const income = await q(`
        SELECT stream, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS payments
        FROM company_income WHERE received_at::date BETWEEN $1 AND $2
        GROUP BY stream ORDER BY total DESC`, [from, to]);
      const expenses = await q(`
        SELECT COALESCE(reason, 'Uncategorised') AS category,
               COALESCE(SUM(amount), 0) AS total, COUNT(*) AS entries
        FROM company_expenses WHERE expense_date::date BETWEEN $1 AND $2
        GROUP BY reason ORDER BY total DESC`, [from, to]);
      const totals = await q(`
        SELECT
          (SELECT COALESCE(SUM(amount), 0) FROM company_investments
            WHERE invested_on BETWEEN $1 AND $2 AND disposed_on IS NULL) AS invested,
          (SELECT COALESCE(SUM(COALESCE(current_value, amount)), 0)
             FROM company_investments WHERE disposed_on IS NULL) AS assets_worth,
          (SELECT COALESCE(SUM(amount), 0) FROM company_liabilities
            WHERE settled_on IS NULL) AS liabilities,
          (SELECT COALESCE(SUM(monthly_gross), 0) FROM staff_salaries
            WHERE ended_on IS NULL) AS payroll_monthly,
          (SELECT row_to_json(v) FROM (
              SELECT amount, valued_on, method, basis FROM company_valuations
              ORDER BY valued_on DESC, created_at DESC LIMIT 1) v) AS valuation,
          (SELECT COALESCE(SUM(amount), 0) FROM company_income
            WHERE received_at::date >= ($1::date - ($2::date - $1::date) - 1)
              AND received_at::date < $1::date) AS prior_income`, [from, to]);
      const series = await q(`
        WITH days AS (SELECT generate_series($1::date, $2::date, '1 day')::date AS day)
        SELECT d.day,
          COALESCE((SELECT SUM(amount) FROM company_income
                     WHERE received_at::date = d.day), 0) AS income,
          COALESCE((SELECT SUM(amount) FROM company_expenses
                     WHERE expense_date::date = d.day), 0) AS expenses
        FROM days d ORDER BY d.day`, [from, to]);
      const cap = await q("SELECT * FROM cap_table");
      const roleRow = await q(
        `SELECT role FROM finance_users
          WHERE lower(email) = lower($1) AND active`,
        [req.adminEmail || ""]
      );
      const agg = totals.rows[0];
      const totalIncome = income.rows.reduce((a, r) => a + Number(r.total), 0);
      const totalExpense = expenses.rows.reduce((a, r) => a + Number(r.total), 0);
      const priorIncome = Number(agg.prior_income || 0);
      res.json({
        role: roleRow.rows[0]?.role || "none",
        summary: {
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
        },
        series: series.rows.map((r) => ({
          day: r.day,
          income: Number(r.income),
          expenses: Number(r.expenses),
          profit: Number(r.income) - Number(r.expenses)
        })),
        capTable: {
          holders: cap.rows.map((r) => ({
            ...r,
            shares: Number(r.shares),
            votes: Number(r.votes),
            ownership_pct: Number(r.ownership_pct),
            voting_pct: Number(r.voting_pct),
            all_shares: Number(r.all_shares),
            all_votes: Number(r.all_votes)
          }))
        }
      });
    } finally {
      client.release();
    }
  }));
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
  router.put("/expenses/:id", handleReq(async (req, res) => {
    const { category, title, reason, amount, expense_date } = req.body;
    const before = await pool2.query(
      "SELECT * FROM company_expenses WHERE id = $1",
      [req.params.id]
    );
    if (!before.rows[0]) throw new Error("No such expense.");
    const r = await pool2.query(
      `UPDATE company_expenses SET
         category = COALESCE($1, category),
         title = COALESCE($2, title),
         reason = COALESCE($3, reason),
         amount = COALESCE($4, amount),
         expense_date = COALESCE($5, expense_date)
       WHERE id = $6 RETURNING *`,
      [
        category ?? null,
        title ?? null,
        reason ?? null,
        amount ?? null,
        expense_date ?? null,
        req.params.id
      ]
    );
    try {
      await pool2.query(
        `INSERT INTO finance_audit (actor, action, entity, entity_id, before, after)
         VALUES ($1,'expense.retag','company_expenses',$2,$3,$4)`,
        [
          req.adminEmail || "unknown",
          String(req.params.id),
          JSON.stringify(before.rows[0]),
          JSON.stringify(r.rows[0])
        ]
      );
    } catch (e) {
    }
    res.json(r.rows[0]);
  }));
  router.post("/expenses", handleReq(async (req, res) => {
    const {
      title,
      reason,
      category,
      amount,
      expense_date,
      vendor,
      person_id
    } = req.body;
    if (!title || !amount) {
      return res.status(400).json({ error: "A title and an amount are required." });
    }
    if (category === "payroll" && person_id) {
      const open = await pool2.query(
        `SELECT payroll_run_id, month, outstanding
           FROM payroll_outstanding WHERE shareholder_id = $1
           ORDER BY month`,
        [person_id]
      );
      if (open.rows.length > 0) {
        const months = open.rows.map((o) => new Date(o.month).toLocaleDateString(
          "en-NG",
          { month: "long", year: "numeric" }
        )).join(", ");
        return res.status(409).json({
          error: `That person still has unpaid payroll for ${months}. Record it against the month so the payroll register clears too -- logging it here would take the money out of the books and still show them as owed.`,
          code: "USE_PAYROLL",
          outstanding: open.rows.map((o) => ({
            payroll_run_id: o.payroll_run_id,
            month: o.month,
            outstanding: Number(o.outstanding)
          }))
        });
      }
    }
    const r = await pool2.query(
      `INSERT INTO company_expenses
         (title, reason, category, amount, expense_date, vendor, person_id,
          approved_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        title,
        reason || category || "Uncategorised",
        category || "other",
        amount,
        expense_date || (/* @__PURE__ */ new Date()).toISOString(),
        vendor || null,
        person_id || null,
        req.adminEmail
      ]
    );
    await logAdminAction2(req, "finance.expense.add", { title, amount, person_id });
    res.status(201).json(r.rows[0]);
  }));
  router.get("/payroll/people", handleReq(async (_req, res) => {
    const [people, outstanding] = await Promise.all([
      pool2.query(`
        SELECT s.id, s.full_name, s.role_title, s.staff_role,
               s.is_founder, s.employment_status,
               (ps.shareholder_id IS NOT NULL) AS on_payroll
        FROM shareholders s
        LEFT JOIN pay_scales ps ON ps.shareholder_id = s.id
        WHERE s.exited_on IS NULL
        ORDER BY s.full_name`),
      pool2.query("SELECT * FROM payroll_outstanding")
    ]);
    const byPerson = {};
    for (const o of outstanding.rows) {
      (byPerson[o.shareholder_id] ||= []).push({
        payroll_run_id: o.payroll_run_id,
        month: o.month,
        cash_due: Number(o.cash_due),
        cash_paid: Number(o.cash_paid),
        outstanding: Number(o.outstanding),
        overdue: o.overdue
      });
    }
    res.json(people.rows.map((p) => ({
      id: p.id,
      full_name: p.full_name,
      role_title: p.role_title || p.staff_role || null,
      on_payroll: p.on_payroll,
      is_founder: p.is_founder,
      outstanding: byPerson[p.id] || [],
      total_outstanding: (byPerson[p.id] || []).reduce((a, m) => a + m.outstanding, 0)
    })));
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
  router.get("/share-price", handleReq(async (_req, res) => {
    const [now, history, par] = await Promise.all([
      pool2.query(`SELECT public.shares_issued()      AS shares_issued,
                         public.current_share_price() AS price_per_share`),
      pool2.query(`SELECT id, valued_on, company_value, shares_then,
                         price_per_share, basis, note, created_by
                    FROM public.share_price_history LIMIT 24`),
      pool2.query(`SELECT MAX(nominal_value) AS par FROM public.share_classes`)
    ]);
    const sharesIssued = Number(now.rows[0]?.shares_issued || 0);
    const price = now.rows[0]?.price_per_share;
    const parValue = Number(par.rows[0]?.par || 0);
    res.json({
      shares_issued: sharesIssued,
      price_per_share: price === null || price === void 0 ? null : Number(price),
      company_value: price ? Number(price) * sharesIssued : 0,
      par_value: parValue,
      // What the register says was paid in, so the page can say plainly
      // whether the price on screen is above or below it.
      share_capital: parValue * sharesIssued,
      history: history.rows.map((h) => ({
        id: h.id,
        valued_on: h.valued_on,
        company_value: Number(h.company_value),
        shares_then: Number(h.shares_then),
        price_per_share: h.price_per_share === null ? null : Number(h.price_per_share),
        basis: h.basis,
        note: h.note,
        created_by: h.created_by
      }))
    });
  }));
  router.post("/share-price", handleReq(async (req, res) => {
    const { price_per_share, basis, valued_on, note } = req.body;
    const price = Number(price_per_share);
    if (!Number.isFinite(price) || price <= 0) {
      return res.status(400).json({ error: "A share price has to be a positive number." });
    }
    try {
      const r = await pool2.query(
        `SELECT * FROM public.set_share_price($1, $2, $3, $4, $5)`,
        [
          price,
          basis || "founder_estimate",
          valued_on || /* @__PURE__ */ new Date(),
          note || null,
          req.adminEmail
        ]
      );
      await logAdminAction2(
        req,
        "finance.share_price.set",
        { price_per_share: price, basis, amount: r.rows[0]?.amount }
      );
      const shares = await pool2.query(
        `SELECT public.shares_issued($1::date) AS n`,
        [r.rows[0].valued_on]
      );
      return res.status(201).json({
        ...r.rows[0],
        amount: Number(r.rows[0].amount),
        price_per_share: price,
        shares_issued: Number(shares.rows[0]?.n || 0)
      });
    } catch (e) {
      if (e.code === "P0001" || e.code === "23514") {
        return res.status(400).json({ error: e.message });
      }
      if (e.code === "42883") {
        return res.status(400).json({
          error: "set_share_price does not exist yet. Run migrations/0089_share_price.sql."
        });
      }
      throw e;
    }
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
    const investorPct = r * 100;
    if (poolPreMoney && r + poolFrac >= 1) {
      return res.status(400).json({
        error: `That round cannot exist. At a pre-money valuation of N${preMoney.toLocaleString("en-NG")} a raise of N${raise.toLocaleString("en-NG")} already buys ${investorPct.toFixed(1)}% of the company, and a ${poolPct}% pool carved out before the round needs ${((r + poolFrac) * 100).toFixed(1)}% in total. Raise less, put the valuation higher, or move the pool to after the round.`
      });
    }
    if (r >= 1) {
      return res.status(400).json({
        error: `A raise of N${raise.toLocaleString("en-NG")} against a pre-money of N${preMoney.toLocaleString("en-NG")} would sell more than the whole company. The investor would own ${investorPct.toFixed(1)}%.`
      });
    }
    const controlWarning = investorPct > 50 ? `This sells ${investorPct.toFixed(1)}% of the company. Above 50% the investor controls an ordinary resolution.` : null;
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
      // Guarded: investorShares is zero on a degenerate round, and
      // Infinity renders as N0.00 -- which is what made the bug above
      // look like a display problem rather than an arithmetic one.
      share_price: investorShares > 0 ? raise / investorShares : 0,
      control_warning: controlWarning,
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
        before_pct: startingShares > 0 ? h.before / startingShares * 100 : 0,
        after_pct: finalTotal > 0 ? h.after / finalTotal * 100 : 0,
        dilution_pct: (startingShares > 0 ? h.before / startingShares * 100 : 0) - (finalTotal > 0 ? h.after / finalTotal * 100 : 0),
        value_after: finalTotal > 0 ? h.after / finalTotal * postMoney : 0
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
import multer2 from "multer";

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
var receiptUpload = multer2({
  storage: multer2.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});
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
  const receipts = async () => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "Receipt storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your Vercel environment variables."
      );
    }
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(url, key).storage.from("payroll-receipts");
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
  const draftFor = async (month, client) => {
    const q = (text, params = []) => (client ?? pool2).query(text, params);
    const auto = await q(
      "SELECT * FROM month_collections_kobo($1::date)",
      [month]
    );
    const rev = await q(`
      SELECT stream,
             COALESCE(SUM(gross_collected),0) AS gross,
             COALESCE(SUM(gateway_fee),0)     AS gateway,
             COALESCE(SUM(seller_payout),0)   AS seller,
             COALESCE(SUM(direct_cost),0)     AS direct
      FROM revenue_entries
      WHERE date_trunc('month', collected_on) = date_trunc('month', $1::date)
      GROUP BY stream`, [month]);
    const exp = await q(`
      SELECT category, COALESCE(SUM(amount),0) AS amount
      FROM company_expenses
      WHERE date_trunc('month', expense_date) = date_trunc('month', $1::date)
      GROUP BY category`, [month]);
    const autoStreams = auto.rows.map((r) => ({
      stream: r.stream,
      slug: r.slug,
      collected: Number(r.collected_kobo),
      // The organiser's / vendor's share. On tickets the company keeps a flat
      // N500 and the rest of the ticket price was never its money.
      thirdParty: Number(r.third_party_kobo),
      company: Number(r.company_kobo),
      payments: Number(r.payments),
      feeBasis: r.fee_basis,
      source: "automatic"
    }));
    const manualStreams = rev.rows.map((r) => ({
      stream: r.stream,
      slug: r.stream,
      collected: Number(r.gross),
      gateway: Number(r.gateway),
      seller: Number(r.seller),
      direct: Number(r.direct),
      source: "manual"
    }));
    const sumBy = (rows, k) => rows.reduce((a, x) => a + Number(x[k] || 0), 0);
    const expenseBucket = (cat) => Math.round(Number(exp.rows.find((r) => r.category === cat)?.amount || 0) * 100);
    const inputs = {
      collections: sumBy(autoStreams, "collected") + sumBy(manualStreams, "collected"),
      // A fee can be recorded per transaction OR as an expense line. Both are
      // counted, because a company will do one or the other, and missing
      // either would overstate gross profit and overpay.
      gatewayFees: sumBy(manualStreams, "gateway") + expenseBucket("payment_processing"),
      // Third-party share, counted the way clause 7.1(b) requires: the full
      // amount collected is revenue, and what belongs to somebody else comes
      // straight back off.
      sellerPayouts: sumBy(autoStreams, "thirdParty") + sumBy(manualStreams, "seller") + expenseBucket("seller_payouts"),
      directInfrastructure: sumBy(manualStreams, "direct") + expenseBucket("infrastructure"),
      refunds: expenseBucket("refunds")
    };
    const result = computeGrossProfit(inputs);
    return {
      result,
      breakdown: {
        // Kept apart on purpose: if the same money were ever entered by hand
        // as well as settled through the app, it shows up as two lines rather
        // than silently doubling the total.
        automatic: autoStreams,
        manual: manualStreams,
        expenses: exp.rows,
        inputs
      }
    };
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
      const { result, breakdown } = await draftFor(month, client);
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
    const counts = await pool2.query(`
      SELECT payroll_run_id, COUNT(*) AS n, MAX(paid_on) AS last_paid
      FROM payroll_payments
      WHERE voided_at IS NULL
      GROUP BY payroll_run_id`);
    const byRun = new Map(
      counts.rows.map((c) => [c.payroll_run_id, { n: Number(c.n), last_paid: c.last_paid }])
    );
    const rows = r.rows.map((p) => {
      const paid = Number(p.cash_paid);
      const due = Number(p.cash_due);
      const seen = byRun.get(p.id);
      return {
        ...p,
        full_salary: Number(p.full_salary),
        cash_due: due,
        cash_paid: paid,
        accrued: Number(p.accrued),
        extinguished: Number(p.extinguished),
        // What is still owed for the month, so the form can default to it and
        // the row can say so without the client re-deriving it.
        outstanding: Math.max(0, due - paid),
        payment_count: seen?.n || 0,
        last_paid_on: seen?.last_paid || null,
        // Part-paid is its own state. Before this it was indistinguishable
        // from unpaid, because paid_on only flips when the month settles.
        part_paid: paid > 0 && paid < due,
        overdue: !p.paid_on && new Date(p.due_on) < /* @__PURE__ */ new Date()
      };
    });
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
    const amount = Math.round(Number(req.body.amount ?? line.cash_due));
    try {
      const r = await pool2.query(
        `SELECT * FROM record_payroll_payment($1, $2, $3, $4, $5, $6, $7)`,
        [
          req.params.id,
          amount,
          req.body.paid_on || null,
          req.body.method || "bank_transfer",
          req.body.reference || null,
          req.body.note || null,
          req.adminEmail
        ]
      );
      const run = await pool2.query(
        "SELECT * FROM payroll_runs WHERE id = $1",
        [req.params.id]
      );
      await audit(
        req,
        "salary.pay",
        "payroll_runs",
        req.params.id,
        line,
        { payment: r.rows[0], run: run.rows[0] }
      );
      return res.status(201).json({
        payment: { ...r.rows[0], amount: Number(r.rows[0].amount) },
        run: {
          ...run.rows[0],
          cash_paid: Number(run.rows[0].cash_paid),
          cash_due: Number(run.rows[0].cash_due)
        }
      });
    } catch (e) {
      if (e.code === "42883") {
        return res.status(400).json({
          error: "record_payroll_payment does not exist yet. Run migrations/0090_payroll_payments.sql."
        });
      }
      throw e;
    }
  }));
  router.get("/payroll/:id/payments", handle(async (req, res) => {
    const own = await pool2.query(`
      SELECT pr.shareholder_id, fu.email AS login_email
      FROM payroll_runs pr
      LEFT JOIN finance_users fu ON fu.shareholder_id = pr.shareholder_id
                                AND fu.active
      WHERE pr.id = $1`, [req.params.id]);
    if (!own.rows[0]) throw new Error("No such payroll line.");
    const isFounder = await roleOf(req.adminEmail) === "founder";
    const isSelf = (own.rows[0].login_email || "").toLowerCase() === (req.adminEmail || "").toLowerCase();
    if (!isFounder && !isSelf) {
      return res.status(403).json({
        error: "You can only see your own payment history."
      });
    }
    const r = await pool2.query(`
      SELECT id, amount, paid_on, method, reference, note,
             file_name, mime_type, size_bytes,
             storage_path IS NOT NULL AS has_receipt,
             expense_id, voided_at, voided_by, void_reason,
             created_at, created_by
      FROM payroll_payments
      WHERE payroll_run_id = $1
      ORDER BY paid_on DESC, created_at DESC`, [req.params.id]);
    res.json(r.rows.map((p) => ({
      ...p,
      amount: Number(p.amount),
      size_bytes: p.size_bytes === null ? null : Number(p.size_bytes)
    })));
  }));
  router.post(
    "/payroll/payments/:paymentId/receipt",
    (req, res, next) => {
      receiptUpload.single("file")(req, res, (err) => {
        if (err) return res.status(400).json({ error: "Upload failed: " + err.message });
        next();
      });
    },
    handle(async (req, res) => {
      if (await roleOf(req.adminEmail) !== "founder") {
        return res.status(403).json({ error: "Only the founder can attach receipts." });
      }
      if (!req.file) throw new Error("No file was attached.");
      const existing = await pool2.query(
        "SELECT id, storage_path, voided_at FROM payroll_payments WHERE id = $1",
        [req.params.paymentId]
      );
      if (!existing.rows[0]) throw new Error("No such payment.");
      if (existing.rows[0].voided_at) {
        throw new Error("That payment was reversed. Record a new one instead.");
      }
      const bucket = await receipts();
      const safe = req.file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");
      const path2 = `${req.params.paymentId}/${Date.now()}_${safe}`;
      const { error } = await bucket.upload(path2, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false
      });
      if (error) throw new Error("Could not store the file: " + error.message);
      const r = await pool2.query(
        `
        UPDATE payroll_payments
        SET storage_path = $1, file_name = $2, mime_type = $3, size_bytes = $4
        WHERE id = $5
        RETURNING id, file_name, mime_type, size_bytes`,
        [
          path2,
          req.file.originalname,
          req.file.mimetype,
          req.file.size,
          req.params.paymentId
        ]
      );
      await audit(
        req,
        "salary.receipt.upload",
        "payroll_payments",
        req.params.paymentId,
        null,
        { file: req.file.originalname }
      );
      res.status(201).json(r.rows[0]);
    })
  );
  router.get("/payroll/payments/:paymentId/receipt", handle(async (req, res) => {
    const r = await pool2.query(`
      SELECT pp.storage_path, pp.file_name, fu.email AS login_email
      FROM payroll_payments pp
      LEFT JOIN finance_users fu ON fu.shareholder_id = pp.shareholder_id
                                AND fu.active
      WHERE pp.id = $1`, [req.params.paymentId]);
    if (!r.rows[0]) throw new Error("No such payment.");
    if (!r.rows[0].storage_path) throw new Error("No receipt was attached to that payment.");
    const isFounder = await roleOf(req.adminEmail) === "founder";
    const isSelf = (r.rows[0].login_email || "").toLowerCase() === (req.adminEmail || "").toLowerCase();
    if (!isFounder && !isSelf) {
      return res.status(403).json({ error: "You can only open your own receipt." });
    }
    const bucket = await receipts();
    const { data, error } = await bucket.createSignedUrl(r.rows[0].storage_path, 300);
    if (error) throw new Error("Could not create a link: " + error.message);
    await audit(
      req,
      "salary.receipt.view",
      "payroll_payments",
      req.params.paymentId,
      null,
      null
    );
    res.json({ url: data.signedUrl, file_name: r.rows[0].file_name, expires_in: 300 });
  }));
  router.post(
    "/payroll/payments/:paymentId/void",
    founderOnly(async (req, res) => {
      const r = await pool2.query(
        "SELECT * FROM void_payroll_payment($1, $2, $3)",
        [req.params.paymentId, req.body.reason || "", req.adminEmail]
      );
      await audit(
        req,
        "salary.pay.void",
        "payroll_payments",
        req.params.paymentId,
        null,
        { reason: req.body.reason }
      );
      res.json({ ...r.rows[0], amount: Number(r.rows[0].amount) });
    })
  );
  router.get("/reconciliation", handle(async (req, res) => {
    const asOf = req.query.as_of ? String(req.query.as_of) : null;
    try {
      const [position, history, unrecorded] = await Promise.all([
        pool2.query(
          "SELECT * FROM cash_position(COALESCE($1::date, current_date))",
          [asOf]
        ),
        pool2.query("SELECT * FROM bank_reconciliation LIMIT 24"),
        // Payroll that has been certified as due but never paid. It is the
        // most common reason the two figures differ, so the page can say so
        // instead of leaving the founder to work it out.
        pool2.query(`
          SELECT COALESCE(SUM(cash_due - cash_paid), 0) AS unpaid_payroll
          FROM payroll_runs WHERE cash_paid < cash_due`)
      ]);
      const p = position.rows[0] || {};
      res.json({
        as_of: asOf || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
        // NAIRA throughout -- company_income and company_expenses are naira,
        // and cash_position() already divides capital_events out of kobo.
        income_in: Number(p.income_in || 0),
        capital_in: Number(p.capital_in || 0),
        expenses_out: Number(p.expenses_out || 0),
        app_says: Number(p.net_position || 0),
        // KOBO, because payroll_runs is kobo. Named so nobody has to guess.
        unpaid_payroll_kobo: Number(unrecorded.rows[0]?.unpaid_payroll || 0),
        history: history.rows.map((h) => ({
          as_of: h.as_of,
          account: h.account,
          bank_says: Number(h.bank_says),
          app_says: Number(h.app_says),
          difference: Number(h.difference),
          note: h.note
        }))
      });
    } catch (e) {
      if (e.code === "42883" || e.code === "42P01") {
        return res.status(400).json({
          error: "The reconciliation views do not exist yet. Run migrations/0090_payroll_payments.sql."
        });
      }
      throw e;
    }
  }));
  router.post("/reconciliation", founderOnly(async (req, res) => {
    const { as_of, balance, account, note } = req.body;
    if (!as_of) throw new Error("Which date is this balance as at?");
    if (balance === void 0 || balance === null || balance === "") {
      throw new Error("What does the statement say?");
    }
    const r = await pool2.query(
      `
      INSERT INTO bank_balances (as_of, balance, account, note, created_by)
      VALUES ($1, $2, COALESCE($3, 'main'), $4, $5)
      ON CONFLICT (as_of, account) DO UPDATE
        SET balance = EXCLUDED.balance, note = EXCLUDED.note,
            created_by = EXCLUDED.created_by
      RETURNING *`,
      [as_of, Number(balance), account || "main", note || null, req.adminEmail]
    );
    await audit(
      req,
      "bank.balance.record",
      "bank_balances",
      r.rows[0].id,
      null,
      r.rows[0]
    );
    res.status(201).json({ ...r.rows[0], balance: Number(r.rows[0].balance) });
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

// server/peopleRoutes.ts
import { Router as Router5 } from "express";
import multer3 from "multer";
var upload2 = multer3({
  storage: multer3.memoryStorage(),
  // A contract is a document, not a video. 15MB is generous and stops a
  // mis-drop filling the bucket.
  limits: { fileSize: 15 * 1024 * 1024 }
});
function createPeopleRouter(pool2) {
  const router = Router5();
  const handle = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      console.error("[people]", e);
      res.status(400).json({ error: e.message });
    }
  };
  const audit = async (req, action, entity, id, before, after) => {
    try {
      await pool2.query(
        `INSERT INTO finance_audit (actor, action, entity, entity_id, before, after)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          req.adminEmail || "unknown",
          action,
          entity,
          id,
          before ? JSON.stringify(before) : null,
          after ? JSON.stringify(after) : null
        ]
      );
    } catch (e) {
      console.error("audit write failed", e);
    }
  };
  const roleOf = async (email) => {
    const r = await pool2.query(
      `SELECT role FROM finance_users WHERE lower(email) = lower($1) AND active`,
      [email || ""]
    );
    return r.rows[0]?.role || "none";
  };
  const founderOnly = (fn) => handle(async (req, res) => {
    if (await roleOf(req.adminEmail) !== "founder") {
      return res.status(403).json({
        error: "Only the founder can change people, pay or contracts."
      });
    }
    await fn(req, res);
  });
  const storage2 = async () => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "Contract storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your Vercel environment variables."
      );
    }
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(url, key).storage.from("staff-contracts");
  };
  router.get("/", handle(async (req, res) => {
    const role = await roleOf(req.adminEmail);
    const r = await pool2.query("SELECT * FROM people");
    const rows = r.rows.map((p) => ({
      ...p,
      shares: Number(p.shares || 0),
      full_salary: p.full_salary === null ? null : Number(p.full_salary),
      deferred_balance: Number(p.deferred_balance || 0),
      rewards_total: Number(p.rewards_total || 0),
      contract_count: Number(p.contract_count || 0)
    }));
    if (role !== "founder") {
      const me = rows.find(
        (p) => (p.login_email || "").toLowerCase() === (req.adminEmail || "").toLowerCase()
      );
      return res.json(rows.map((p) => p.id === me?.id ? p : {
        id: p.id,
        full_name: p.full_name,
        role_title: p.role_title,
        is_founder: p.is_founder,
        is_staff: p.is_staff,
        employment_status: p.employment_status,
        shares: p.shares,
        access_role: p.access_role,
        full_salary: null,
        deferred_balance: null,
        rewards_total: null,
        contract_count: 0,
        restricted: true
      }));
    }
    res.json(rows);
  }));
  router.post("/", founderOnly(async (req, res) => {
    const {
      full_name,
      email,
      role_title,
      phone,
      is_staff,
      is_founding_team,
      is_cofounder,
      is_director,
      staff_role,
      is_investor,
      is_external,
      notes
    } = req.body;
    if (!full_name?.trim()) throw new Error("A full name is required.");
    const r = await pool2.query(
      `INSERT INTO shareholders
         (full_name, email, role_title, phone, is_staff, is_founding_team,
          is_cofounder, is_director, staff_role, is_investor, is_external, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        full_name.trim(),
        email || null,
        role_title || null,
        phone || null,
        is_staff !== false,
        !!is_founding_team,
        !!is_cofounder,
        !!is_director,
        staff_role || role_title || null,
        !!is_investor,
        !!is_external,
        notes || null
      ]
    );
    await audit(req, "person.add", "shareholders", r.rows[0].id, null, r.rows[0]);
    res.status(201).json(r.rows[0]);
  }));
  router.put("/:id", founderOnly(async (req, res) => {
    const {
      full_name,
      email,
      role_title,
      phone,
      employment_status,
      is_staff,
      is_founding_team,
      is_cofounder,
      is_director,
      staff_role,
      is_investor,
      is_external,
      notes
    } = req.body;
    const before = await pool2.query(
      "SELECT * FROM shareholders WHERE id = $1",
      [req.params.id]
    );
    const r = await pool2.query(
      `UPDATE shareholders SET
         full_name = COALESCE($1, full_name),
         email = COALESCE($2, email),
         role_title = COALESCE($3, role_title),
         phone = COALESCE($4, phone),
         employment_status = COALESCE($5, employment_status),
         is_staff = COALESCE($6, is_staff),
         is_founding_team = COALESCE($7, is_founding_team),
         is_cofounder = COALESCE($8, is_cofounder),
         is_director = COALESCE($9, is_director),
         staff_role = COALESCE($10, staff_role),
         is_investor = COALESCE($11, is_investor),
         is_external = COALESCE($12, is_external),
         notes = COALESCE($13, notes)
       WHERE id = $14 RETURNING *`,
      [
        full_name ?? null,
        email ?? null,
        role_title ?? null,
        phone ?? null,
        employment_status ?? null,
        is_staff ?? null,
        is_founding_team ?? null,
        is_cofounder ?? null,
        is_director ?? null,
        staff_role ?? null,
        is_investor ?? null,
        is_external ?? null,
        notes ?? null,
        req.params.id
      ]
    );
    if (!r.rows[0]) throw new Error("No such person.");
    await audit(
      req,
      "person.update",
      "shareholders",
      req.params.id,
      before.rows[0],
      r.rows[0]
    );
    res.json(r.rows[0]);
  }));
  router.post("/:id/access", founderOnly(async (req, res) => {
    const { email, role, is_director, active } = req.body;
    if (!email?.trim()) throw new Error("An email is required to give access.");
    const valid = ["founder", "director", "stakeholder"];
    if (role && !valid.includes(role)) {
      throw new Error(`Role must be one of: ${valid.join(", ")}.`);
    }
    const before = await pool2.query(
      "SELECT * FROM finance_users WHERE shareholder_id = $1",
      [req.params.id]
    );
    const r = await pool2.query(
      `INSERT INTO finance_users (email, shareholder_id, role, is_director, active)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (email) DO UPDATE SET
         shareholder_id = EXCLUDED.shareholder_id,
         role = EXCLUDED.role,
         is_director = EXCLUDED.is_director,
         active = EXCLUDED.active
       RETURNING *`,
      [
        email.trim().toLowerCase(),
        req.params.id,
        role || "stakeholder",
        !!is_director,
        active !== false
      ]
    );
    await audit(
      req,
      "access.grant",
      "finance_users",
      r.rows[0].id,
      before.rows[0] || null,
      r.rows[0]
    );
    res.status(201).json(r.rows[0]);
  }));
  router.delete("/:id/access", founderOnly(async (req, res) => {
    const before = await pool2.query(
      "SELECT * FROM finance_users WHERE shareholder_id = $1",
      [req.params.id]
    );
    await pool2.query(
      "UPDATE finance_users SET active = false WHERE shareholder_id = $1",
      [req.params.id]
    );
    await audit(
      req,
      "access.revoke",
      "finance_users",
      before.rows[0]?.id || null,
      before.rows[0] || null,
      null
    );
    res.json({ ok: true });
  }));
  router.put("/:id/salary", founderOnly(async (req, res) => {
    const { scale, monthly_salary, resolution_ref } = req.body;
    const kobo = Math.round(Number(monthly_salary || 0) * 100);
    if (kobo < 0) throw new Error("A salary cannot be negative.");
    const before = await pool2.query(
      "SELECT * FROM pay_scales WHERE shareholder_id = $1",
      [req.params.id]
    );
    const banded = ["officer", "founder"];
    const wasBanded = banded.includes(before.rows[0]?.scale);
    const willBeBanded = banded.includes(scale);
    if ((wasBanded || willBeBanded) && !String(resolution_ref || "").trim()) {
      throw new Error(
        "Officer and founder salaries are set by contract. Record the shareholder resolution reference that authorises this change."
      );
    }
    const cap = scale === "flat" ? 0 : scale === "founder" ? 15e6 : 1e7;
    const inst = scale === "flat" ? 0 : scale === "founder" ? 15e5 : 1e6;
    const r = await pool2.query(
      `INSERT INTO pay_scales
         (shareholder_id, scale, full_salary, deferred_cap, min_instalment,
          resolution_ref, active)
       VALUES ($1,$2,$3,$4,$5,$6,true)
       ON CONFLICT (shareholder_id) DO UPDATE SET
         scale = EXCLUDED.scale,
         full_salary = EXCLUDED.full_salary,
         deferred_cap = EXCLUDED.deferred_cap,
         min_instalment = EXCLUDED.min_instalment,
         resolution_ref = EXCLUDED.resolution_ref,
         updated_at = now()
       RETURNING *`,
      [
        req.params.id,
        scale || "flat",
        kobo,
        cap,
        inst,
        resolution_ref || null
      ]
    );
    await audit(
      req,
      "salary.set",
      "pay_scales",
      req.params.id,
      before.rows[0] || null,
      r.rows[0]
    );
    res.json(r.rows[0]);
  }));
  router.get("/:id/rewards", handle(async (req, res) => {
    const role = await roleOf(req.adminEmail);
    const owner = await pool2.query(
      `SELECT 1 FROM finance_users WHERE shareholder_id = $1
         AND lower(email) = lower($2) AND active`,
      [req.params.id, req.adminEmail || ""]
    );
    if (role !== "founder" && owner.rows.length === 0) {
      return res.status(403).json({ error: "You can only see your own rewards." });
    }
    const r = await pool2.query(
      `SELECT r.*, sc.name AS class_name FROM staff_rewards r
       LEFT JOIN share_classes sc ON sc.id = r.share_class_id
       WHERE r.person_id = $1 ORDER BY r.awarded_on DESC`,
      [req.params.id]
    );
    res.json(r.rows.map((x) => ({
      ...x,
      amount: x.amount === null ? null : Number(x.amount),
      shares: x.shares === null ? null : Number(x.shares)
    })));
  }));
  router.post("/:id/rewards", founderOnly(async (req, res) => {
    const { kind, amount, shares, share_class_id, reason, awarded_on } = req.body;
    if (!reason?.trim()) throw new Error("Say what the reward is for.");
    const kobo = amount ? Math.round(Number(amount) * 100) : null;
    const shareCount = shares ? Math.floor(Number(shares)) : null;
    if (!kobo && !shareCount) throw new Error("Enter an amount or a number of shares.");
    const client = await pool2.connect();
    try {
      await client.query("BEGIN");
      const r = await client.query(
        `INSERT INTO staff_rewards
           (person_id, kind, amount, shares, share_class_id, reason,
            awarded_on, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [
          req.params.id,
          kind || "bonus",
          kobo,
          shareCount,
          share_class_id || null,
          reason.trim(),
          awarded_on || /* @__PURE__ */ new Date(),
          req.adminEmail
        ]
      );
      if (shareCount) {
        if (!share_class_id) throw new Error("Choose a share class for a share award.");
        const cls = await client.query(
          "SELECT founder_only, name FROM share_classes WHERE id = $1",
          [share_class_id]
        );
        const person = await client.query(
          "SELECT is_founder, full_name FROM shareholders WHERE id = $1",
          [req.params.id]
        );
        if (cls.rows[0]?.founder_only && !person.rows[0]?.is_founder) {
          throw new Error(
            `${cls.rows[0].name} cannot be issued to ${person.rows[0]?.full_name}. Under Article 3 it only reaches a Founding Team Member by transfer from the founder \u2014 record it on the Ownership tab.`
          );
        }
        await client.query(
          `INSERT INTO share_transactions
             (shareholder_id, class_id, shares, kind, price_per_share,
              txn_date, note, created_by)
           VALUES ($1,$2,$3,'issue',0,$4,$5,$6)`,
          [
            req.params.id,
            share_class_id,
            shareCount,
            awarded_on || /* @__PURE__ */ new Date(),
            `Reward: ${reason.trim()}`,
            req.adminEmail
          ]
        );
      }
      await client.query("COMMIT");
      await audit(req, "reward.add", "staff_rewards", r.rows[0].id, null, r.rows[0]);
      res.status(201).json(r.rows[0]);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }));
  router.post("/rewards/:rewardId/paid", founderOnly(async (req, res) => {
    const r = await pool2.query(
      `UPDATE staff_rewards SET paid_on = COALESCE($1, current_date)
       WHERE id = $2 RETURNING *`,
      [req.body.paid_on || null, req.params.rewardId]
    );
    if (!r.rows[0]) throw new Error("No such reward.");
    await audit(
      req,
      "reward.paid",
      "staff_rewards",
      req.params.rewardId,
      null,
      r.rows[0]
    );
    res.json(r.rows[0]);
  }));
  const canSeeContracts = async (req, personId) => {
    if (await roleOf(req.adminEmail) === "founder") return true;
    const own = await pool2.query(
      `SELECT 1 FROM finance_users WHERE shareholder_id = $1
         AND lower(email) = lower($2) AND active`,
      [personId, req.adminEmail || ""]
    );
    return own.rows.length > 0;
  };
  router.get("/:id/profile", handle(async (req, res) => {
    const privileged = await canSeeContracts(req, req.params.id);
    const [person, profile, bank] = await Promise.all([
      pool2.query(
        `SELECT id, full_name, email, phone, role_title, staff_role,
                employment_status, joined_on, exited_on, notes
           FROM shareholders WHERE id = $1`,
        [req.params.id]
      ),
      pool2.query(
        "SELECT * FROM staff_profiles WHERE person_id = $1",
        [req.params.id]
      ),
      privileged ? pool2.query(
        "SELECT * FROM staff_bank_details WHERE person_id = $1",
        [req.params.id]
      ) : pool2.query(
        "SELECT * FROM staff_bank_masked WHERE person_id = $1",
        [req.params.id]
      )
    ]);
    if (!person.rows[0]) throw new Error("No such person.");
    if (privileged && bank.rows[0]?.account_number && await roleOf(req.adminEmail) === "founder") {
      const self = await pool2.query(
        `SELECT 1 FROM finance_users WHERE shareholder_id = $1
           AND lower(email) = lower($2)`,
        [req.params.id, req.adminEmail || ""]
      );
      if (self.rows.length === 0) {
        await audit(
          req,
          "bank.details.view",
          "staff_bank_details",
          req.params.id,
          null,
          null
        );
      }
    }
    res.json({
      person: person.rows[0],
      profile: profile.rows[0] || null,
      bank: bank.rows[0] || null,
      // The client renders differently rather than guessing from whether a
      // field happens to be present.
      bank_visible: privileged
    });
  }));
  router.put("/:id/profile", founderOnly(async (req, res) => {
    const FIELDS = [
      "address_line1",
      "address_line2",
      "city",
      "state",
      "country",
      "date_of_birth",
      "gender",
      "personal_email",
      "alternate_phone",
      "emergency_name",
      "emergency_relationship",
      "emergency_phone",
      "next_of_kin_name",
      "next_of_kin_relationship",
      "next_of_kin_phone",
      "employment_type",
      "work_location",
      "reports_to",
      "probation_ends",
      "notes"
    ];
    const given = FIELDS.filter((f) => f in req.body);
    if (given.length === 0) {
      return res.status(400).json({ error: "Nothing to change." });
    }
    const clean = (f) => {
      const v = req.body[f];
      return v === "" || v === void 0 ? null : v;
    };
    const before = await pool2.query(
      "SELECT * FROM staff_profiles WHERE person_id = $1",
      [req.params.id]
    );
    const cols = ["person_id", ...given, "updated_by"];
    const values = [req.params.id, ...given.map(clean), req.adminEmail];
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
    const updates = [...given, "updated_by"].map((f) => `${f} = EXCLUDED.${f}`).join(", ");
    const r = await pool2.query(
      `INSERT INTO staff_profiles (${cols.join(", ")})
       VALUES (${placeholders})
       ON CONFLICT (person_id) DO UPDATE SET ${updates}
       RETURNING *`,
      values
    );
    await audit(
      req,
      "profile.update",
      "staff_profiles",
      req.params.id,
      before.rows[0] || null,
      r.rows[0]
    );
    res.json(r.rows[0]);
  }));
  router.put("/:id/bank", founderOnly(async (req, res) => {
    const {
      bank_name,
      account_number,
      account_name,
      bank_code,
      verified
    } = req.body;
    const digits = String(account_number || "").replace(/\s/g, "");
    if (digits && !/^\d{6,20}$/.test(digits)) {
      return res.status(400).json({
        error: "An account number should be between 6 and 20 digits, and digits only."
      });
    }
    const r = await pool2.query(
      `INSERT INTO staff_bank_details
         (person_id, bank_name, account_number, account_name, bank_code,
          verified_at, verified_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (person_id) DO UPDATE SET
         bank_name = EXCLUDED.bank_name,
         account_number = EXCLUDED.account_number,
         account_name = EXCLUDED.account_name,
         bank_code = EXCLUDED.bank_code,
         verified_at = EXCLUDED.verified_at,
         verified_by = EXCLUDED.verified_by,
         updated_by = EXCLUDED.updated_by
       RETURNING *`,
      [
        req.params.id,
        bank_name || null,
        digits || null,
        account_name || null,
        bank_code || null,
        verified ? /* @__PURE__ */ new Date() : null,
        verified ? req.adminEmail : null,
        req.adminEmail
      ]
    );
    res.json(r.rows[0]);
  }));
  router.get("/:id/contracts", handle(async (req, res) => {
    if (!await canSeeContracts(req, req.params.id)) {
      return res.status(403).json({ error: "You can only see your own contract." });
    }
    const r = await pool2.query(
      `SELECT id, title, kind, file_name, mime_type, size_bytes, signed_on,
              uploaded_by, uploaded_at, superseded_by
       FROM staff_contracts WHERE person_id = $1
       ORDER BY uploaded_at DESC`,
      [req.params.id]
    );
    res.json(r.rows.map((c) => ({ ...c, size_bytes: Number(c.size_bytes || 0) })));
  }));
  router.post(
    "/:id/contracts",
    (req, res, next) => {
      upload2.single("file")(req, res, (err) => {
        if (err) return res.status(400).json({ error: "Upload failed: " + err.message });
        next();
      });
    },
    handle(async (req, res) => {
      if (await roleOf(req.adminEmail) !== "founder") {
        return res.status(403).json({ error: "Only the founder can upload contracts." });
      }
      if (!req.file) throw new Error("No file was attached.");
      const bucket = await storage2();
      const safe = req.file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");
      const path2 = `${req.params.id}/${Date.now()}_${safe}`;
      const { error } = await bucket.upload(path2, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false
      });
      if (error) throw new Error("Could not store the file: " + error.message);
      const r = await pool2.query(
        `INSERT INTO staff_contracts
           (person_id, title, storage_path, file_name, mime_type, size_bytes,
            kind, signed_on, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, title, kind,
                  file_name, uploaded_at`,
        [
          req.params.id,
          req.body.title || req.file.originalname,
          path2,
          req.file.originalname,
          req.file.mimetype,
          req.file.size,
          req.body.kind || "employment",
          req.body.signed_on || null,
          req.adminEmail
        ]
      );
      await audit(
        req,
        "contract.upload",
        "staff_contracts",
        r.rows[0].id,
        null,
        { person: req.params.id, file: req.file.originalname }
      );
      res.status(201).json(r.rows[0]);
    })
  );
  router.get("/:id/contracts/:contractId/link", handle(async (req, res) => {
    if (!await canSeeContracts(req, req.params.id)) {
      return res.status(403).json({ error: "You can only open your own contract." });
    }
    const c = await pool2.query(
      "SELECT storage_path, file_name FROM staff_contracts WHERE id = $1 AND person_id = $2",
      [req.params.contractId, req.params.id]
    );
    if (!c.rows[0]) throw new Error("No such contract.");
    const bucket = await storage2();
    const { data, error } = await bucket.createSignedUrl(c.rows[0].storage_path, 300);
    if (error) throw new Error("Could not create a link: " + error.message);
    await audit(
      req,
      "contract.view",
      "staff_contracts",
      req.params.contractId,
      null,
      { person: req.params.id }
    );
    res.json({ url: data.signedUrl, file_name: c.rows[0].file_name, expires_in: 300 });
  }));
  router.get("/me/summary", handle(async (req, res) => {
    const r = await pool2.query(
      `SELECT * FROM people WHERE lower(login_email) = lower($1)`,
      [req.adminEmail || ""]
    );
    if (!r.rows[0]) return res.json({ linked: false });
    const p = r.rows[0];
    res.json({
      linked: true,
      ...p,
      shares: Number(p.shares || 0),
      full_salary: p.full_salary === null ? null : Number(p.full_salary),
      deferred_balance: Number(p.deferred_balance || 0),
      rewards_total: Number(p.rewards_total || 0)
    });
  }));
  return router;
}

// server/liveRoutes.ts
import { Router as Router6 } from "express";
function createLiveRouter(pool2) {
  const router = Router6();
  const handle = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      console.error("[live]", e);
      res.status(400).json({ error: e.message });
    }
  };
  const roleOf = async (email) => {
    const r = await pool2.query(
      `SELECT role FROM finance_users WHERE lower(email) = lower($1) AND active`,
      [email || ""]
    );
    return r.rows[0]?.role || "none";
  };
  const founderOnly = (fn) => handle(async (req, res) => {
    if (await roleOf(req.adminEmail) !== "founder") {
      return res.status(403).json({ error: "Only the founder can change this." });
    }
    await fn(req, res);
  });
  const range = (q) => {
    const today = /* @__PURE__ */ new Date();
    const iso = (d) => d.toISOString().slice(0, 10);
    const p = String(q.period || "month");
    if (p === "custom") {
      return {
        from: String(q.from || "1970-01-01"),
        to: String(q.to || iso(today)),
        label: `${q.from} to ${q.to}`
      };
    }
    const start = new Date(today);
    let label = "This month";
    if (p === "today") {
      label = "Today";
    } else if (p === "week") {
      start.setDate(today.getDate() - 6);
      label = "Last 7 days";
    } else if (p === "month") {
      start.setDate(1);
      label = "This month";
    } else if (p === "quarter") {
      start.setMonth(Math.floor(today.getMonth() / 3) * 3, 1);
      label = "This quarter";
    } else if (p === "year") {
      start.setMonth(0, 1);
      label = "This year";
    } else if (p === "all") {
      return { from: "1970-01-01", to: iso(today), label: "All time" };
    }
    return { from: iso(start), to: iso(today), label };
  };
  router.get("/split", handle(async (req, res) => {
    const { from, to, label } = range(req.query);
    const role = await roleOf(req.adminEmail);
    const client = await pool2.connect();
    try {
      const holders = await client.query(
        "SELECT * FROM stakeholder_earnings($1::date, $2::date)",
        [from, to]
      );
      const totals = await client.query(
        `
        SELECT
          COALESCE((SELECT SUM(amount) FROM company_income
                     WHERE received_at::date BETWEEN $1 AND $2), 0) AS income,
          COALESCE((SELECT COUNT(*) FROM company_income
                     WHERE received_at::date BETWEEN $1 AND $2), 0) AS payments,
          COALESCE((SELECT SUM(amount) FROM company_expenses
                     WHERE expense_date::date BETWEEN $1 AND $2), 0) AS spend`,
        [from, to]
      );
      const streams = await client.query(`
        SELECT stream, COALESCE(SUM(amount),0) AS total, COUNT(*) AS payments
        FROM company_income WHERE received_at::date BETWEEN $1 AND $2
        GROUP BY stream ORDER BY total DESC`, [from, to]);
      const campus = await client.query(`
        SELECT COALESCE(SUM(pe.earned), 0) AS owed
        FROM school_stakeholders ss
        LEFT JOIN LATERAL partner_earned(ss.id, $1::date, $2::date) pe ON true
        WHERE ss.active`, [from, to]);
      const t = totals.rows[0];
      const income = Number(t.income || 0);
      const spend = Number(t.spend || 0);
      const owed = Number(campus.rows[0]?.owed || 0);
      res.json({
        period: { from, to, label },
        totals: {
          income,
          spend,
          retained: income - spend,
          payments: Number(t.payments || 0),
          campus_liability: owed,
          per_naira_note: "Each holder receives this fraction of every naira."
        },
        streams: streams.rows.map((s) => ({
          stream: s.stream,
          total: Number(s.total),
          payments: Number(s.payments)
        })),
        holders: holders.rows.map((h) => ({
          holder_id: h.holder_id,
          full_name: h.full_name,
          role_title: h.role_title,
          shares: Number(h.shares),
          ownership_pct: Number(h.ownership_pct),
          share_of_income: Number(h.share_of_income),
          share_of_profit: Number(h.share_of_profit),
          // Their slice of the next naira through the door.
          per_naira: Number(h.ownership_pct) / 100
        })),
        // Everyone may see the split -- that is the point of it. Only the
        // founder sees what the company spent to get there.
        viewer_role: role
      });
    } finally {
      client.release();
    }
  }));
  router.get("/schools", handle(async (req, res) => {
    const { from, to, label } = range(req.query);
    const client = await pool2.connect();
    try {
      const rows = await client.query(
        "SELECT * FROM school_earnings($1::date, $2::date)",
        [from, to]
      );
      const partners = await client.query(`
        SELECT ss.*,
               sh.full_name AS person_name,
               s.name AS school_name,
               partner_status(ss.active, ss.starts_on, ss.ends_on) AS status,
               COALESCE(pe.earned, 0)      AS earned_this_period,
               COALESCE(pb.earned_total, 0) AS earned_total,
               COALESCE(pb.paid_total, 0)   AS paid_total,
               COALESCE(pb.outstanding, 0)  AS outstanding,
               pb.last_paid_on
        FROM school_stakeholders ss
        LEFT JOIN shareholders sh ON sh.id = ss.person_id
        LEFT JOIN schools s ON s.id = ss.school_id
        LEFT JOIN LATERAL partner_earned(ss.id, $1::date, $2::date) pe ON true
        LEFT JOIN LATERAL partner_balance(ss.id) pb ON true
        ORDER BY ss.active DESC, ss.created_at DESC`, [from, to]);
      const byId = /* @__PURE__ */ new Map();
      for (const p of partners.rows) {
        const k = String(p.school_id);
        if (!byId.has(k)) byId.set(k, []);
        byId.get(k).push({
          ...p,
          percent: Number(p.percent),
          earned_this_period: Number(p.earned_this_period),
          earned_total: Number(p.earned_total),
          paid_total: Number(p.paid_total),
          outstanding: Number(p.outstanding)
        });
      }
      res.json({
        period: { from, to, label },
        schools: rows.rows.map((r) => {
          const share = byId.get(String(r.school_id)) || [];
          const companyShare = Number(r.company_share || 0);
          const owed = share.reduce((a, p) => a + p.earned_this_period, 0);
          return {
            school_id: r.school_id,
            school_name: r.school_name,
            payments: Number(r.payments),
            collected: Number(r.collected),
            company_share: companyShare,
            partners: share,
            owed_to_partners: owed,
            company_keeps: companyShare - owed,
            outstanding: share.reduce((a, p) => a + p.outstanding, 0)
          };
        }),
        unassigned_partners: partners.rows.filter((p) => p.school_id === null).map((p) => ({ ...p, percent: Number(p.percent) }))
      });
    } finally {
      client.release();
    }
  }));
  router.get("/schools/:id/breakdown", handle(async (req, res) => {
    const { from, to, label } = range(req.query);
    const id = req.params.id === "null" ? null : Number(req.params.id);
    const r = await pool2.query(
      "SELECT * FROM school_payment_breakdown($1::bigint, $2::date, $3::date)",
      [id, from, to]
    );
    res.json({
      period: { from, to, label },
      payments: r.rows.map((x) => ({
        ...x,
        amount: Number(x.amount),
        company_share: Number(x.company_share)
      }))
    });
  }));
  router.get("/schools/partners/:id/payouts", handle(async (req, res) => {
    const [bal, rows] = await Promise.all([
      pool2.query("SELECT * FROM partner_balance($1)", [req.params.id]),
      pool2.query(
        `SELECT * FROM school_partner_payouts
         WHERE agreement_id = $1 ORDER BY paid_on DESC`,
        [req.params.id]
      )
    ]);
    res.json({
      balance: bal.rows[0] || null,
      payouts: rows.rows.map((p) => ({
        ...p,
        amount: Number(p.amount),
        campus_share: Number(p.campus_share),
        percent: Number(p.percent)
      }))
    });
  }));
  router.post("/schools/partners/:id/pay", founderOnly(async (req, res) => {
    const { period_from, period_to, amount, method, reference, note } = req.body;
    if (!(Number(amount) >= 0)) throw new Error("Enter the amount paid.");
    if (!period_from || !period_to) {
      throw new Error("Say which period this payment covers.");
    }
    const r = await pool2.query(
      `SELECT record_partner_payout($1,$2::date,$3::date,$4::numeric,$5,$6,$7,$8) AS id`,
      [
        req.params.id,
        period_from,
        period_to,
        Number(amount),
        method || null,
        reference || null,
        note || null,
        req.adminEmail
      ]
    );
    res.status(201).json({ id: r.rows[0].id });
  }));
  router.post("/schools/partners/:id/renew", founderOnly(async (req, res) => {
    const { ends_on, percent } = req.body;
    if (!ends_on) throw new Error("Choose a new end date.");
    await pool2.query(
      "SELECT renew_partner_agreement($1,$2::date,$3::numeric,$4)",
      [
        req.params.id,
        ends_on,
        percent === void 0 || percent === null ? null : Number(percent),
        req.adminEmail
      ]
    );
    res.json({ ok: true });
  }));
  router.post("/schools/partners/:id/restore", founderOnly(async (req, res) => {
    const r = await pool2.query(
      "SELECT restore_partner_agreement($1,$2) AS status",
      [req.params.id, req.adminEmail]
    );
    res.json({ ok: true, status: r.rows[0].status });
  }));
  router.post("/schools/partners", founderOnly(async (req, res) => {
    const {
      school_id,
      person_id,
      body_name,
      contact,
      kind,
      percent,
      starts_on,
      ends_on,
      note
    } = req.body;
    if (!person_id && !body_name?.trim()) {
      throw new Error("Name the person or the body this agreement is with.");
    }
    const pct = Number(percent);
    if (!(pct > 0 && pct <= 100)) throw new Error("Percent must be between 0 and 100.");
    const r = await pool2.query(
      `INSERT INTO school_stakeholders
         (school_id, person_id, body_name, contact, kind, percent,
          starts_on, ends_on, note, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,current_date),$8,$9,$10)
       RETURNING *`,
      [
        school_id || null,
        person_id || null,
        body_name || null,
        contact || null,
        kind || "student_association",
        pct,
        starts_on || null,
        ends_on || null,
        note || null,
        req.adminEmail
      ]
    );
    res.status(201).json(r.rows[0]);
  }));
  router.put("/schools/partners/:id", founderOnly(async (req, res) => {
    const { percent, ends_on, active, note, kind, contact } = req.body;
    const r = await pool2.query(
      `UPDATE school_stakeholders SET
         percent = COALESCE($1, percent),
         ends_on = COALESCE($2, ends_on),
         active  = COALESCE($3, active),
         note    = COALESCE($4, note),
         kind    = COALESCE($5, kind),
         contact = COALESCE($6, contact)
       WHERE id = $7 RETURNING *`,
      [
        percent ?? null,
        ends_on ?? null,
        active ?? null,
        note ?? null,
        kind ?? null,
        contact ?? null,
        req.params.id
      ]
    );
    if (!r.rows[0]) throw new Error("No such agreement.");
    res.json(r.rows[0]);
  }));
  router.delete("/schools/partners/:id", founderOnly(async (req, res) => {
    await pool2.query(
      `UPDATE school_stakeholders
       SET active = false, ends_on = COALESCE(ends_on, current_date)
       WHERE id = $1`,
      [req.params.id]
    );
    res.json({ ok: true });
  }));
  router.get("/schools/list", handle(async (_req, res) => {
    const r = await pool2.query("SELECT id, name FROM schools ORDER BY name");
    res.json(r.rows);
  }));
  router.get("/investors", handle(async (_req, res) => {
    const r = await pool2.query(`
      SELECT mi.*, sh.full_name AS person_name, sh.role_title
      FROM model_investors mi
      LEFT JOIN shareholders sh ON sh.id = mi.person_id
      ORDER BY mi.created_at`);
    res.json(r.rows.map((i) => ({ ...i, amount: Number(i.amount) })));
  }));
  router.post("/investors", founderOnly(async (req, res) => {
    const { name, person_id, amount, is_test, note } = req.body;
    if (!name?.trim() && !person_id) throw new Error("Give the investor a name.");
    const r = await pool2.query(
      `INSERT INTO model_investors (name, person_id, amount, is_test, note, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        name?.trim() || "Test investor",
        person_id || null,
        Math.round(Number(amount || 0)),
        is_test !== false,
        note || null,
        req.adminEmail
      ]
    );
    res.status(201).json({ ...r.rows[0], amount: Number(r.rows[0].amount) });
  }));
  router.put("/investors/:id", founderOnly(async (req, res) => {
    const { name, amount, note, person_id } = req.body;
    const r = await pool2.query(
      `UPDATE model_investors SET
         name = COALESCE($1, name),
         amount = COALESCE($2, amount),
         note = COALESCE($3, note),
         person_id = COALESCE($4, person_id)
       WHERE id = $5 RETURNING *`,
      [
        name ?? null,
        amount === void 0 ? null : Math.round(Number(amount)),
        note ?? null,
        person_id ?? null,
        req.params.id
      ]
    );
    if (!r.rows[0]) throw new Error("No such investor.");
    res.json({ ...r.rows[0], amount: Number(r.rows[0].amount) });
  }));
  router.delete("/investors/:id", founderOnly(async (req, res) => {
    await pool2.query("DELETE FROM model_investors WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  }));
  return router;
}

// server/financeAccess.ts
var SHELL = /^\/(role|bootstrap|settings|expense-categories)(\/|$)/;
var FINANCE_RULES = [
  // -- Money in & out ------------------------------------------------------
  { test: /^\/(summary|timeseries)(\/|$)/, screens: ["overview"] },
  { test: /^\/revenue(\/|$)/, screens: ["overview", "reports"] },
  { test: /^\/income(\/|$)/, screens: ["overview", "record"] },
  {
    test: /^\/expenses(\/|$)/,
    screens: ["overview", "grossprofit", "record"]
  },
  // -- Gross profit --------------------------------------------------------
  { test: /^\/gross-profit(\/|$)/, screens: ["grossprofit"] },
  // -- Payroll -------------------------------------------------------------
  //
  // THESE TWO COME FIRST, and the order matters -- the first matching rule
  // wins, so the broad /payroll rule below would otherwise swallow them.
  //
  // Recording a salary payment is a Record-screen job as much as a Payroll
  // one: the Record tab is where somebody logging the day's spending goes,
  // and sending them anywhere else is what produced the loose untagged salary
  // expenses in the first place. Both screens can reach the person list and
  // the payment endpoint; neither can read the register without 'payroll'.
  { test: /^\/payroll\/people(\/|$)/, screens: ["payroll", "record"] },
  { test: /^\/payroll\/[^/]+\/pay(\/|$)/, screens: ["payroll", "record"] },
  // /reconciliation lives here because the bank comparison is only meaningful
  // to somebody who can already see what left the account in wages.
  {
    test: /^\/(payroll|deferred|pay-scales|salaries|reconciliation)(\/|$)/,
    screens: ["payroll"]
  },
  // -- Ownership and the share price ---------------------------------------
  {
    test: /^\/(cap-table|share-price|share-transactions|shareholders|valuations)(\/|$)/,
    screens: ["captable", "record"]
  },
  // Everyone's stake side by side. The Live split screen is built on it, and
  // so is Ownership.
  {
    test: /^\/(stakeholders|snapshot)(\/|$)/,
    screens: ["captable", "live", "reports"]
  },
  // -- Milestones ----------------------------------------------------------
  { test: /^\/(awards|challenges|tranches)(\/|$)/, screens: ["milestones"] },
  // -- Round modelling -----------------------------------------------------
  { test: /^\/(model-round|safes)(\/|$)/, screens: ["round"] },
  { test: /^\/capital(\/|$)/, screens: ["round", "record"] },
  // -- My own stake --------------------------------------------------------
  // Always allowed. It returns the signed-in person's own holding and
  // nothing else, so there is nobody it could expose them to.
  { test: /^\/me(\/|$)/, screens: ["*"] },
  // -- Investments and liabilities -----------------------------------------
  {
    test: /^\/(investments|liabilities)(\/|$)/,
    screens: ["record", "overview", "reports"]
  },
  // -- Reports -------------------------------------------------------------
  { test: /^\/(balance-sheet|audit)(\/|$)/, screens: ["reports"] },
  // -- The Access tab ------------------------------------------------------
  // Finance roles are handed out here, so anyone who could reach it could
  // grant themselves everything else. Founder-only inside the router already;
  // this makes it unreachable rather than merely refused.
  { test: /^\/users(\/|$)/, screens: ["__founder_only__"] }
];
var LIVE_RULES = [
  { test: /^\/split(\/|$)/, screens: ["live"] },
  { test: /^\/schools(\/|$)/, screens: ["schools"] },
  // The named investors are the dropdown on Round modelling, and the same
  // list names people on the Live split.
  { test: /^\/investors(\/|$)/, screens: ["round", "live"] }
];
var PEOPLE_RULES = [
  { test: /^\/me(\/|$)/, screens: ["*"] },
  { test: /.*/, screens: ["people"] }
];
var SUPER_ADMINS = [
  "allowancemobileapp@gmail.com",
  "allowancemobielapp@gmail.com"
];
function financeScreenGuard(rules, label) {
  return function guard(req, res, next) {
    const email = String(req.adminEmail || "").toLowerCase();
    if (SUPER_ADMINS.includes(email)) return next();
    const perms = req.adminPermissions || {};
    if (perms.all) return next();
    const granted = Array.isArray(perms.finance_tabs) ? perms.finance_tabs : [];
    const pages = Array.isArray(perms.pages) ? perms.pages : [];
    if (!pages.includes("finance")) {
      return res.status(403).json({
        error: "This account has not been granted Company Finance. It can be turned on from Account Permissions."
      });
    }
    const path2 = req.path || "/";
    if (label === "finance" && SHELL.test(path2)) return next();
    const rule = rules.find((r) => r.test.test(path2));
    if (!rule) {
      console.warn(`[finance-access] unmapped ${label} path: ${path2}`);
      return res.status(403).json({
        error: `This part of Company Finance (${path2}) has no permission rule, so it is refused by default. If you are seeing this on a screen you were granted, it needs a rule adding in server/financeAccess.ts.`
      });
    }
    if (rule.screens.includes("*")) return next();
    if (rule.screens.includes("__founder_only__")) {
      return res.status(403).json({
        error: "Only the founder can open the Access screen."
      });
    }
    if (rule.screens.some((sc) => granted.includes(sc))) return next();
    return res.status(403).json({
      error: `This account has not been granted that Company Finance screen. It needs one of: ${rule.screens.join(", ")}.`
    });
  };
}
var financeGuard = financeScreenGuard(FINANCE_RULES, "finance");
var liveGuard = financeScreenGuard(LIVE_RULES, "live");
var peopleGuard = financeScreenGuard(PEOPLE_RULES, "people");

// server/auth.ts
import crypto from "crypto";
var CERT_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
var PROJECT_ID = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || "allowance-001";
var CLOCK_SKEW_SECONDS = 60;
var certCache = null;
async function googlePublicKeys() {
  if (certCache && certCache.expiresAt > Date.now()) return certCache.certs;
  const res = await fetch(CERT_URL);
  if (!res.ok) {
    throw new Error(`Could not fetch Google's signing keys (${res.status}).`);
  }
  const certs = await res.json();
  const cc = res.headers.get("cache-control") || "";
  const maxAge = Number(/max-age=(\d+)/.exec(cc)?.[1] || 3600);
  certCache = { certs, expiresAt: Date.now() + maxAge * 1e3 };
  return certs;
}
function b64urlToBuffer(s) {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}
function decodeSegment(s) {
  return JSON.parse(b64urlToBuffer(s).toString("utf8"));
}
async function verifyIdToken(token) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed token.");
  const [headerB64, payloadB64, signatureB64] = parts;
  let header;
  let payload;
  try {
    header = decodeSegment(headerB64);
    payload = decodeSegment(payloadB64);
  } catch {
    throw new Error("Token could not be read.");
  }
  if (header.alg !== "RS256") {
    throw new Error(`Unexpected token algorithm: ${header.alg}.`);
  }
  if (!header.kid) throw new Error("Token has no key id.");
  let certs = await googlePublicKeys();
  if (!certs[header.kid]) {
    certCache = null;
    certs = await googlePublicKeys();
    if (!certs[header.kid]) {
      throw new Error("Token was signed with an unknown key.");
    }
  }
  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();
  const publicKey = crypto.createPublicKey(certs[header.kid]);
  if (!verifier.verify(publicKey, b64urlToBuffer(signatureB64))) {
    throw new Error("Token signature is not valid.");
  }
  const now = Math.floor(Date.now() / 1e3);
  if (payload.aud !== PROJECT_ID) {
    throw new Error("Token was issued for a different application.");
  }
  if (payload.iss !== `https://securetoken.google.com/${PROJECT_ID}`) {
    throw new Error("Token came from an unexpected issuer.");
  }
  if (typeof payload.exp !== "number" || payload.exp + CLOCK_SKEW_SECONDS < now) {
    throw new Error("Session has expired. Sign in again.");
  }
  if (typeof payload.iat !== "number" || payload.iat - CLOCK_SKEW_SECONDS > now) {
    throw new Error("Token is dated in the future.");
  }
  if (typeof payload.auth_time === "number" && payload.auth_time - CLOCK_SKEW_SECONDS > now) {
    throw new Error("Token reports a sign-in that has not happened yet.");
  }
  if (!payload.sub || typeof payload.sub !== "string") {
    throw new Error("Token has no subject.");
  }
  if (!payload.email || typeof payload.email !== "string") {
    throw new Error("Token carries no email address.");
  }
  const provider = payload.firebase?.sign_in_provider || "unknown";
  if (payload.email_verified !== true && provider !== "google.com") {
    throw new Error(
      "That email address has not been verified with its provider."
    );
  }
  return {
    uid: payload.sub,
    email: String(payload.email).toLowerCase(),
    emailVerified: payload.email_verified === true,
    signInProvider: provider,
    // Falls back to iat rather than to 0: a token with no auth_time is not
    // evidence of a sign-in an infinite time ago, it is just a token that did
    // not carry the claim.
    authTime: typeof payload.auth_time === "number" ? payload.auth_time : payload.iat
  };
}
function bearerToken(req) {
  const raw = req.headers?.authorization || req.headers?.Authorization;
  if (!raw || typeof raw !== "string") return null;
  const m = /^Bearer\s+(.+)$/i.exec(raw.trim());
  return m ? m[1].trim() : null;
}

// server/undoRoutes.ts
import { Router as Router7 } from "express";
function createUndoRouter(pool2) {
  const router = Router7();
  const SUPER_ADMINS2 = [
    "allowancemobileapp@gmail.com",
    "allowancemobielapp@gmail.com"
  ];
  const REAUTH_WINDOW_SECONDS = 5 * 60;
  const handle = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      console.error("[undo]", e);
      res.status(400).json({ error: e.message });
    }
  };
  const ENTITIES = {
    expense: {
      table: "company_expenses",
      label: "Expense",
      idType: "int",
      describe: (r) => `${r.title} \u2014 N${Number(r.amount).toLocaleString("en-NG")}`
    },
    revenue: {
      table: "revenue_entries",
      label: "Revenue",
      idType: "uuid",
      describe: (r) => `${r.stream} \u2014 N${(Number(r.gross_collected) / 100).toLocaleString("en-NG")}`
    },
    capital: {
      table: "capital_events",
      label: "Capital in",
      idType: "uuid",
      describe: (r) => `${r.kind} from ${r.counterparty || "unnamed"} \u2014 N${(Number(r.amount) / 100).toLocaleString("en-NG")}`
    },
    investment: {
      table: "company_investments",
      label: "Investment",
      idType: "uuid",
      describe: (r) => `${r.title} \u2014 N${Number(r.amount).toLocaleString("en-NG")}`
    },
    liability: {
      table: "company_liabilities",
      label: "Money owed",
      idType: "uuid",
      describe: (r) => `${r.title} \u2014 N${Number(r.amount).toLocaleString("en-NG")}`
    },
    valuation: {
      table: "company_valuations",
      label: "Valuation",
      idType: "uuid",
      describe: (r) => `N${Number(r.amount).toLocaleString("en-NG")} on ${r.valued_on}`
    }
  };
  const audit = async (req, action, entity, id, before, after) => {
    try {
      await pool2.query(
        `INSERT INTO finance_audit (actor, action, entity, entity_id, before, after)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          req.adminEmail || "unknown",
          action,
          entity,
          id,
          before ? JSON.stringify(before) : null,
          after ? JSON.stringify(after) : null
        ]
      );
    } catch (e) {
      console.error("audit write failed", e);
    }
  };
  const superAdminReauthed = (fn) => handle(async (req, res) => {
    const email = String(req.adminEmail || "").toLowerCase();
    if (!SUPER_ADMINS2.includes(email)) {
      return res.status(403).json({
        error: "Only the super admin can delete or restore a record. Everyone else can add one and ask for it to be reversed.",
        code: "NOT_SUPER_ADMIN"
      });
    }
    const authTime = Number(req.authTime || 0);
    const age = Math.floor(Date.now() / 1e3) - authTime;
    if (!authTime || age > REAUTH_WINDOW_SECONDS) {
      return res.status(401).json({
        error: "Confirm it is you before deleting anything. This needs a sign-in from the last five minutes.",
        code: "REAUTH_REQUIRED",
        // The client uses this to say how stale the session is rather than
        // just asserting that it is.
        signed_in_seconds_ago: authTime ? age : null
      });
    }
    await fn(req, res);
  });
  router.get("/entities", handle(async (_req, res) => {
    res.json(Object.entries(ENTITIES).map(([id, e]) => ({
      id,
      label: e.label
    })));
  }));
  router.delete("/:entity/:id", superAdminReauthed(async (req, res) => {
    const meta = ENTITIES[req.params.entity];
    if (!meta) {
      return res.status(400).json({ error: "That kind of record cannot be deleted here." });
    }
    const id = req.params.id;
    if (meta.idType === "int" && !/^\d+$/.test(id)) {
      return res.status(400).json({ error: "Not a valid record id." });
    }
    if (meta.idType === "uuid" && !/^[0-9a-f-]{36}$/i.test(id)) {
      return res.status(400).json({ error: "Not a valid record id." });
    }
    const client = await pool2.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query(
        `SELECT * FROM public.${meta.table} WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (found.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "That record no longer exists." });
      }
      const row = found.rows[0];
      if (meta.table === "company_expenses") {
        const linked = await client.query(
          "SELECT id FROM payroll_payments WHERE expense_id = $1 AND voided_at IS NULL",
          [id]
        );
        if (linked.rows.length > 0) {
          await client.query("ROLLBACK");
          return res.status(409).json({
            error: "That expense was created by a payroll payment. Reverse the payment on the Payroll screen instead \u2014 that puts back what the person is owed as well as the money.",
            code: "LINKED_TO_PAYROLL"
          });
        }
      }
      const kept = await client.query(
        `INSERT INTO deleted_records
           (entity, entity_id, payload, description, deleted_by, reason)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [
          req.params.entity,
          String(id),
          JSON.stringify(row),
          meta.describe(row),
          req.adminEmail,
          req.body?.reason || null
        ]
      );
      await client.query(`DELETE FROM public.${meta.table} WHERE id = $1`, [id]);
      await client.query("COMMIT");
      await audit(req, "record.delete", meta.table, String(id), row, null);
      res.json({
        deleted: true,
        entity: req.params.entity,
        description: meta.describe(row),
        undo_id: kept.rows[0].id
      });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {
      });
      throw e;
    } finally {
      client.release();
    }
  }));
  router.get("/deleted", handle(async (req, res) => {
    const email = String(req.adminEmail || "").toLowerCase();
    if (!SUPER_ADMINS2.includes(email)) {
      return res.status(403).json({
        error: "Only the super admin can see deleted records."
      });
    }
    const r = await pool2.query(`
      SELECT id, entity, entity_id, description, deleted_by, deleted_at,
             reason, restored_by, restored_at
      FROM deleted_records
      ORDER BY deleted_at DESC LIMIT 100`);
    res.json(r.rows.map((d) => ({
      ...d,
      label: ENTITIES[d.entity]?.label || d.entity
    })));
  }));
  router.post(
    "/deleted/:id/restore",
    superAdminReauthed(async (req, res) => {
      const found = await pool2.query(
        "SELECT * FROM deleted_records WHERE id = $1",
        [req.params.id]
      );
      if (!found.rows[0]) throw new Error("No such deleted record.");
      const rec = found.rows[0];
      if (rec.restored_at) {
        return res.status(409).json({
          error: `That was already restored on ${new Date(rec.restored_at).toLocaleDateString("en-NG")}.`
        });
      }
      const meta = ENTITIES[rec.entity];
      if (!meta) throw new Error("That kind of record can no longer be restored.");
      const payload = rec.payload || {};
      const cols = Object.keys(payload);
      if (cols.length === 0) throw new Error("Nothing was stored to restore.");
      const columnList = cols.map((c) => `"${c.replace(/"/g, '""')}"`).join(", ");
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
      const values = cols.map((c) => payload[c]);
      const client = await pool2.connect();
      try {
        await client.query("BEGIN");
        const back = await client.query(
          `INSERT INTO public.${meta.table} (${columnList})
           VALUES (${placeholders}) RETURNING *`,
          values
        );
        await client.query(
          `UPDATE deleted_records SET restored_by = $1, restored_at = now()
           WHERE id = $2`,
          [req.adminEmail, req.params.id]
        );
        await client.query("COMMIT");
        await audit(
          req,
          "record.restore",
          meta.table,
          String(rec.entity_id),
          null,
          back.rows[0]
        );
        res.json({ restored: true, description: rec.description });
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {
        });
        if (e.code === "23505") {
          throw new Error(
            "A record with that id already exists \u2014 it looks like this was already put back another way."
          );
        }
        throw e;
      } finally {
        client.release();
      }
    })
  );
  return router;
}

// server/rolesRoutes.ts
import { Router as Router8 } from "express";
function createRolesRouter(pool2) {
  const router = Router8();
  const handle = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      console.error("[roles]", e);
      if (e.code === "42883" || e.code === "42P01") {
        return res.status(400).json({
          error: "The role review tables are not there yet. Run the app's 0087_role_applications.sql, then migrations/0093_role_application_review.sql."
        });
      }
      res.status(400).json({ error: e.message });
    }
  };
  const logAdminAction2 = async (req, action, details) => {
    try {
      await pool2.query(
        `INSERT INTO system_logs (type, admin_email, action, details)
         VALUES ($1, $2, $3, $4)`,
        ["admin", req.adminEmail || "unknown", action, JSON.stringify(details)]
      );
    } catch (e) {
      console.error("log failed", e);
    }
  };
  router.get("/applications", handle(async (req, res) => {
    const status = String(req.query.status || "pending");
    const kind = req.query.kind ? String(req.query.kind) : null;
    const r = await pool2.query(`
      SELECT * FROM role_application_queue
      WHERE ($1 = 'all' OR status = $1)
        AND ($2::text IS NULL OR kind = $2)
      ORDER BY
        -- Pending at the top whatever else is being shown.
        CASE WHEN status = 'pending' THEN 0 ELSE 1 END,
        CASE WHEN status = 'pending' THEN created_at END ASC,
        reviewed_at DESC NULLS LAST
      LIMIT 200`, [status, kind]);
    const counts = await pool2.query(`
      SELECT kind, status, COUNT(*)::int AS n
      FROM role_applications GROUP BY kind, status`);
    res.json({
      applications: r.rows.map((a) => ({
        ...a,
        previous_rejections: Number(a.previous_rejections || 0)
      })),
      counts: counts.rows
    });
  }));
  router.get("/applications/:userId/history", handle(async (req, res) => {
    const r = await pool2.query(`
      SELECT id, kind, status, note, review_note, reviewer_email,
             reviewed_at, created_at
      FROM role_applications
      WHERE user_id = $1
      ORDER BY created_at DESC`, [req.params.userId]);
    res.json(r.rows);
  }));
  router.post("/applications/:id/review", handle(async (req, res) => {
    const { decision, note } = req.body;
    if (decision !== "approved" && decision !== "rejected") {
      return res.status(400).json({
        error: "A decision is either approved or rejected."
      });
    }
    if (decision === "rejected" && !String(note || "").trim()) {
      return res.status(400).json({
        error: "Say why it is being turned down \u2014 the applicant is told this."
      });
    }
    const r = await pool2.query(
      "SELECT * FROM review_role_application($1, $2, $3, $4)",
      [req.params.id, decision, req.adminEmail, note || null]
    );
    await logAdminAction2(req, `role.application.${decision}`, {
      application_id: req.params.id,
      kind: r.rows[0]?.kind,
      user_id: r.rows[0]?.user_id,
      note: note || null
    });
    res.json(r.rows[0]);
  }));
  router.post("/revoke", handle(async (req, res) => {
    const { user_id, kind, reason } = req.body;
    if (!user_id || !kind) {
      return res.status(400).json({ error: "Which person, and which role?" });
    }
    if (!String(reason || "").trim()) {
      return res.status(400).json({
        error: "Say why this role is being taken away. It goes on the record."
      });
    }
    await pool2.query(
      "SELECT revoke_role($1, $2, $3, $4)",
      [user_id, kind, req.adminEmail, reason]
    );
    await logAdminAction2(req, "role.revoked", { user_id, kind, reason });
    res.json({ revoked: true, user_id, kind });
  }));
  router.get("/holders", handle(async (req, res) => {
    const kind = String(req.query.kind || "delivery_agent");
    const column = kind === "transport_vendor" ? "is_transport_vendor" : "is_delivery_agent";
    const r = await pool2.query(`
      SELECT id AS user_id, full_name, username, avatar_url, phone_number,
             school_name, created_at AS joined_at,
             COALESCE(is_available_for_delivery, false) AS available
      FROM profiles
      WHERE ${column} = true
      ORDER BY full_name NULLS LAST
      LIMIT 500`);
    res.json(r.rows);
  }));
  return router;
}

// server.ts
import cors from "cors";
dotenv.config();
var app = express2();
var PORT = 3e3;
var ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").map((o) => o.trim()).filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Origin not allowed."));
  },
  credentials: true
}));
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
  const token = bearerToken(req);
  if (!token) {
    res.status(401).json({
      error: "Not signed in. This request carried no authentication token.",
      code: "NO_TOKEN"
    });
    return;
  }
  verifyIdToken(token).then(async (user) => {
    const claimed = String(req.headers["x-admin-email"] || "").toLowerCase();
    if (claimed && claimed !== user.email) {
      res.status(403).json({
        error: "This request is signed in as one account and asking to act as another. Sign out and back in.",
        code: "IDENTITY_MISMATCH"
      });
      return;
    }
    const email = user.email;
    if (email === "allowancemobileapp@gmail.com" || email === "allowancemobielapp@gmail.com") {
      req.adminEmail = email;
      req.adminPermissions = { all: true };
      req.authUid = user.uid;
      req.authTime = user.authTime;
      next();
      return;
    }
    const result = await pool.query(
      "SELECT permissions FROM admin_users WHERE lower(email) = $1",
      [email]
    );
    if (result.rows.length === 0) {
      res.status(403).json({
        error: "This Google account is signed in but is not an admin here.",
        code: "NOT_AN_ADMIN"
      });
      return;
    }
    req.adminEmail = email;
    req.adminPermissions = result.rows[0].permissions;
    req.authUid = user.uid;
    req.authTime = user.authTime;
    next();
  }).catch((err) => {
    const expired = /expired/i.test(err.message || "");
    console.warn("[auth] rejected:", err.message);
    res.status(401).json({
      error: err.message || "Could not verify this session.",
      code: expired ? "TOKEN_EXPIRED" : "BAD_TOKEN"
    });
  });
}
app.post("/api/auth/verify", async (req, res) => {
  try {
    const token = bearerToken(req);
    if (!token) {
      return res.status(401).json({
        error: "No sign-in token was sent.",
        code: "NO_TOKEN"
      });
    }
    let user;
    try {
      user = await verifyIdToken(token);
    } catch (e) {
      return res.status(401).json({
        error: e.message || "Could not verify that sign-in.",
        code: "BAD_TOKEN"
      });
    }
    const email = user.email;
    if (email === "allowancemobileapp@gmail.com" || email === "allowancemobielapp@gmail.com") {
      return res.json({
        verified: true,
        email,
        title: "Super Admin",
        permissions: { all: true }
      });
    }
    const result = await pool.query(
      "SELECT title, permissions FROM admin_users WHERE lower(email) = $1",
      [email]
    );
    if (result.rows.length > 0) {
      return res.json({
        verified: true,
        email,
        title: result.rows[0].title,
        permissions: result.rows[0].permissions
      });
    }
    return res.status(403).json({
      error: "That Google account is not an admin here.",
      code: "NOT_AN_ADMIN"
    });
  } catch (e) {
    console.error("[auth/verify]", e);
    res.status(500).json({ error: "Could not complete sign-in." });
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
app.use("/api/finance", requireAdmin, financeGuard, createFinanceRouter(pool));
app.use("/api/finance", requireAdmin, financeGuard, createFinanceV2Router(pool));
app.use("/api/people", requireAdmin, peopleGuard, createPeopleRouter(pool));
app.use("/api/live", requireAdmin, liveGuard, createLiveRouter(pool));
app.use("/api/undo", requireAdmin, createUndoRouter(pool));
app.use("/api/roles", requireAdmin, createRolesRouter(pool));
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
var logRate = /* @__PURE__ */ new Map();
var LOG_WINDOW_MS = 6e4;
var LOG_MAX_PER_WINDOW = 60;
function logRateLimited(key) {
  const now = Date.now();
  const entry = logRate.get(key);
  if (!entry || entry.resetAt < now) {
    logRate.set(key, { count: 1, resetAt: now + LOG_WINDOW_MS });
    if (logRate.size > 5e3) {
      for (const [k, v] of logRate) if (v.resetAt < now) logRate.delete(k);
    }
    return false;
  }
  entry.count += 1;
  return entry.count > LOG_MAX_PER_WINDOW;
}
var clip = (v, max) => typeof v === "string" ? v.slice(0, max) : "";
app.post("/api/logs/app", async (req, res) => {
  try {
    const ip = String(req.headers["x-forwarded-for"] || req.ip || "unknown").split(",")[0].trim();
    if (logRateLimited(ip)) {
      return res.status(429).json({ error: "Too many log writes. Slow down." });
    }
    const user_email = clip(req.body?.user_email, 320);
    const action_summary = clip(req.body?.action_summary, 500);
    if (!user_email || !action_summary) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    let details = req.body?.details;
    if (details === null || typeof details !== "object" || Array.isArray(details)) {
      details = {};
    }
    if (JSON.stringify(details).length > 8e3) {
      details = { truncated: true };
    }
    const result = await pool.query(
      `INSERT INTO system_logs (type, user_email, action_summary, details)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [
        "app",
        user_email,
        action_summary,
        // The stamp is the point: this row was not authenticated, and the
        // address on it is whatever the caller typed.
        { ...details, _unverified: true }
      ]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error("[logs/app]", err);
    res.status(500).json({ error: "Could not write the log entry." });
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
           SELECT COALESCE(SUM(amount_paid), 0) as total FROM gists WHERE amount_paid > 0
           UNION ALL
           SELECT COALESCE(SUM(amount_paid), 0) as total FROM ticket_purchases WHERE amount_paid > 0
         ) sub
       `);
      total_revenue = parseFloat(revRes.rows[0].total || 0);
      const revTodayRes = await pool.query(`
         SELECT SUM(total) as total FROM (
           SELECT COALESCE(SUM(amount) / 100.0, 0) as total FROM membership_payments WHERE created_at >= current_date
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
             COALESCE(NULLIF(amount_paid, 0), total_price, 0) as amount,
             status, payment_reference as reference, user_id::text as user_email, created_at
      FROM gists
      WHERE ((amount_paid IS NOT NULL AND amount_paid > 0) OR paid = true)
        AND (payment_reference IS NULL OR payment_reference NOT ILIKE 'coupon%')
      ORDER BY created_at DESC LIMIT 200
    `);
    const ticketRes = await pool.query(`
      SELECT id::text, 'Ticket' as type, amount_paid as amount, status, payment_reference as reference, user_id::text as user_email, created_at
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
    const currentEmail = String(req.adminEmail || "").toLowerCase();
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
         SELECT COALESCE(SUM(amount_paid), 0) as total FROM gists WHERE created_at >= current_date AND amount_paid > 0
         UNION ALL
         SELECT COALESCE(SUM(amount_paid), 0) as total FROM ticket_purchases WHERE created_at >= current_date AND amount_paid > 0
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
         SELECT date_trunc('month', created_at) as month, COALESCE(SUM(amount_paid), 0) as amount
         FROM gists
         WHERE created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '11 months') AND amount_paid > 0
         GROUP BY month
         UNION ALL
         SELECT date_trunc('month', created_at) as month, COALESCE(SUM(amount_paid), 0) as amount
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
