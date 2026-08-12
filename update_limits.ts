import fs from 'fs';

// Update Library.tsx
let libContent = fs.readFileSync('src/pages/Library.tsx', 'utf8');
libContent = libContent.replace(/Maximum size is 30MB/g, 'Maximum size is 50MB');
fs.writeFileSync('src/pages/Library.tsx', libContent);

// Update useApi.ts
let apiContent = fs.readFileSync('src/hooks/useApi.ts', 'utf8');
apiContent = apiContent.replace(/Max 30MB/g, 'Max 50MB');
fs.writeFileSync('src/hooks/useApi.ts', apiContent);

// Update multer config
let routesContent = fs.readFileSync('server/libraryRoutes.ts', 'utf8');
routesContent = routesContent.replace(
  'const upload = multer({ storage });',
  'const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });'
);
fs.writeFileSync('server/libraryRoutes.ts', routesContent);

console.log("Limits updated.");
