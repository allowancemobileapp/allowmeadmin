import fs from 'fs';
let content = fs.readFileSync('server.ts', 'utf8');

// add error handler before app.listen
content = content.replace(
  'if (process.env.NODE_ENV !== \'production\') {',
  'app.use((err: any, req: any, res: any, next: any) => {\n  console.error("Global error:", err);\n  res.status(500).json({ error: err.message || "Internal Server Error" });\n});\n\nif (process.env.NODE_ENV !== \'production\') {'
);

fs.writeFileSync('server.ts', content);
