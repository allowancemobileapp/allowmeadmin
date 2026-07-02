import { Router } from "express";
import { Pool } from "pg";
import multer from "multer";

const storage = multer.memoryStorage();
const upload = multer({ storage });

export function createLibraryRouter(pool: Pool) {
  const router = Router();

  const handleReq = (handler: any) => async (req: any, res: any) => {
    try {
      await handler(req, res);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  };

  router.post('/upload', upload.single('file'), handleReq(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = 'https://quuazutreaitqoquzolg.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1dWF6dXRyZWFpdHFvcXV6b2xnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDA4OTYxOCwiZXhwIjoyMDU5NjY1NjE4fQ.pQoriaaK_dG1Z9nQUWdCYvFtugulM7ir9OjTukIhDGs';
    const supabase = createClient(supabaseUrl, supabaseKey);

    const fileName = `${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const { data, error } = await supabase.storage
      .from('library-materials')
      .upload(fileName, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true
      });

    if (error) {
      throw new Error(`Failed to upload to Supabase: ${error.message}`);
    }

    const { data: publicUrlData } = supabase.storage
      .from('library-materials')
      .getPublicUrl(fileName);

    res.json({ url: publicUrlData.publicUrl });
  }));

  // --- Colleges ---
  router.get('/colleges', handleReq(async (req, res) => {
    const { school_id } = req.query;
    let query = 'SELECT c.*, s.name as school_name FROM colleges c JOIN schools s ON c.school_id = s.id';
    const params: any[] = [];
    if (school_id) {
      query += ' WHERE c.school_id = $1';
      params.push(school_id);
    }
    const result = await pool.query(query, params);
    res.json(result.rows);
  }));

  router.post('/colleges', handleReq(async (req, res) => {
    const { school_id, name } = req.body;
    const result = await pool.query(
      'INSERT INTO colleges (school_id, name) VALUES ($1, $2) RETURNING *',
      [school_id, name]
    );
    res.json(result.rows[0]);
  }));

  router.put('/colleges/:id', handleReq(async (req, res) => {
    const { school_id, name } = req.body;
    const result = await pool.query(
      'UPDATE colleges SET school_id = $1, name = $2 WHERE id = $3 RETURNING *',
      [school_id, name, req.params.id]
    );
    res.json(result.rows[0]);
  }));

  router.delete('/colleges/:id', handleReq(async (req, res) => {
    await pool.query('DELETE FROM colleges WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  }));

  // --- Courses ---
  router.get('/courses', handleReq(async (req, res) => {
    const { college_id } = req.query;
    let query = 'SELECT c.*, col.name as college_name, s.name as school_name FROM courses c JOIN colleges col ON c.college_id = col.id JOIN schools s ON col.school_id = s.id';
    const params: any[] = [];
    if (college_id) {
      query += ' WHERE c.college_id = $1';
      params.push(college_id);
    }
    const result = await pool.query(query, params);
    res.json(result.rows);
  }));

  router.post('/courses', handleReq(async (req, res) => {
    const { college_id, course_code, course_title, course_description } = req.body;
    const result = await pool.query(
      'INSERT INTO courses (college_id, course_code, course_title, course_description) VALUES ($1, $2, $3, $4) RETURNING *',
      [college_id, course_code, course_title, course_description]
    );
    res.json(result.rows[0]);
  }));

  router.put('/courses/:id', handleReq(async (req, res) => {
    const { college_id, course_code, course_title, course_description } = req.body;
    const result = await pool.query(
      'UPDATE courses SET college_id = $1, course_code = $2, course_title = $3, course_description = $4 WHERE id = $5 RETURNING *',
      [college_id, course_code, course_title, course_description, req.params.id]
    );
    res.json(result.rows[0]);
  }));

  router.delete('/courses/:id', handleReq(async (req, res) => {
    await pool.query('DELETE FROM courses WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  }));

  // --- Library Materials ---
  router.get('/library_materials', handleReq(async (req, res) => {
    const { course_id } = req.query;
    let query = 'SELECT m.*, c.course_code FROM library_materials m JOIN courses c ON m.course_id = c.id';
    const params: any[] = [];
    if (course_id) {
      query += ' WHERE m.course_id = $1';
      params.push(course_id);
    }
    const result = await pool.query(query, params);
    res.json(result.rows);
  }));

  router.post('/library_materials', handleReq(async (req, res) => {
    const { course_id, material_type, title, academic_year, semester, file_url, price } = req.body;
    const result = await pool.query(
      'INSERT INTO library_materials (course_id, material_type, title, academic_year, semester, file_url, price) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [course_id, material_type, title, academic_year, semester, file_url, price || 0]
    );
    res.json(result.rows[0]);
  }));

  router.put('/library_materials/:id', handleReq(async (req, res) => {
    const { course_id, material_type, title, academic_year, semester, file_url, price } = req.body;
    const result = await pool.query(
      'UPDATE library_materials SET course_id = $1, material_type = $2, title = $3, academic_year = $4, semester = $5, file_url = $6, price = $7 WHERE id = $8 RETURNING *',
      [course_id, material_type, title, academic_year, semester, file_url, price || 0, req.params.id]
    );
    res.json(result.rows[0]);
  }));

  router.delete('/library_materials/:id', handleReq(async (req, res) => {
    await pool.query('DELETE FROM library_materials WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  }));

  // --- Quiz Questions ---
  router.get('/quiz_questions', handleReq(async (req, res) => {
    const { material_id, course_id } = req.query;
    let query = 'SELECT * FROM quiz_questions WHERE 1=1';
    const params: any[] = [];
    if (material_id) {
      params.push(material_id);
      query += ` AND material_id = $${params.length}`;
    }
    if (course_id) {
      params.push(course_id);
      query += ` AND course_id = $${params.length}`;
    }
    const result = await pool.query(query, params);
    res.json(result.rows);
  }));

  router.post('/quiz_questions/generate', handleReq(async (req, res) => {
    const { course_id, material_id, file_url } = req.body;
    
    // Dynamically import genai inside the handler to avoid startup crashes if key is missing
    const { GoogleGenAI, Type } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    let contents: any[] = [
      { text: `You are an expert professor. Generate a 50-question pop quiz based on the course material provided. For each question provide exactly 3 options (option_a, option_b, option_c) and one correct_option ('A', 'B', or 'C').` }
    ];
    
    if (file_url) {
      const fileResponse = await fetch(file_url);
      const arrayBuffer = await fileResponse.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64 = buffer.toString('base64');
      const mimeType = fileResponse.headers.get('content-type') || 'application/pdf';
      
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
            required: ['question_text', 'option_a', 'option_b', 'option_c', 'correct_option']
          }
        }
      }
    });
    
    const questionsText = response.text || "[]";
    const questions = JSON.parse(questionsText.trim());
    
    if (questions.length > 0) {
      // Clear existing questions for this material first
      await pool.query('DELETE FROM quiz_questions WHERE material_id = $1', [material_id]);

      // Bulk insert
      const values = questions.map((q: any) => 
        `(${course_id}, ${material_id}, '${q.question_text.replace(/'/g, "''")}', '${q.option_a.replace(/'/g, "''")}', '${q.option_b.replace(/'/g, "''")}', '${q.option_c.replace(/'/g, "''")}', '${q.correct_option}')`
      ).join(',');

      const result = await pool.query(`INSERT INTO quiz_questions (course_id, material_id, question_text, option_a, option_b, option_c, correct_option) VALUES ${values} RETURNING *`);
      return res.json(result.rows);
    }
    
    res.json([]);
  }));
  
  router.delete('/quiz_questions/:id', handleReq(async (req, res) => {
    await pool.query('DELETE FROM quiz_questions WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  }));

  router.delete('/quiz_questions/material/:material_id', handleReq(async (req, res) => {
    await pool.query('DELETE FROM quiz_questions WHERE material_id = $1', [req.params.material_id]);
    res.json({ success: true });
  }));

  return router;
}
