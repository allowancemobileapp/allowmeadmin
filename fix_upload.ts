import fs from 'fs';
let content = fs.readFileSync('server/libraryRoutes.ts', 'utf8');

// wrap upload.single to catch multer errors
content = content.replace(
  'router.post(\'/upload\', upload.single(\'file\'), handleReq(async (req, res) => {',
  `router.post('/upload', (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: "Upload error: " + err.message });
      }
      next();
    });
  }, handleReq(async (req, res) => {`
);

fs.writeFileSync('server/libraryRoutes.ts', content);
