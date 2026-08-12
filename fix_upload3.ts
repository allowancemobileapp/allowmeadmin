import fs from 'fs';
let content = fs.readFileSync('src/pages/Library.tsx', 'utf8');

content = content.replace(
  'if (!uploadRes.ok) {\n        const errorData = await uploadRes.json();\n        throw new Error(errorData.error || \'Failed to upload file\');\n      }',
  `if (!uploadRes.ok) {
        let errorMsg = "Failed to upload file";
        const cType = uploadRes.headers.get("content-type");
        if (cType && cType.includes("application/json")) {
           const errorData = await uploadRes.json();
           errorMsg = errorData.error || errorMsg;
        } else {
           errorMsg = await uploadRes.text();
        }
        throw new Error(errorMsg);
      }`
);

fs.writeFileSync('src/pages/Library.tsx', content);
