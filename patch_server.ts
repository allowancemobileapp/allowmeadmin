import fs from 'fs';
let content = fs.readFileSync('server.ts', 'utf8');

content = content.replace(
  'app.use(express.json());',
  'app.use(express.json({ limit: "50mb" }));\napp.use(express.urlencoded({ limit: "50mb", extended: true }));'
);

fs.writeFileSync('server.ts', content);
