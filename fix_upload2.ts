import fs from 'fs';
let content = fs.readFileSync('src/pages/Library.tsx', 'utf8');

// Replace uploadData = await uploadRes.json();
content = content.replace(
  'const uploadData = await uploadRes.json();',
  `let uploadData;
      const contentType = uploadRes.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        uploadData = await uploadRes.json();
      } else {
        throw new Error(await uploadRes.text());
      }`
);

fs.writeFileSync('src/pages/Library.tsx', content);
