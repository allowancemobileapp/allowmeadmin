import fs from 'fs';
let content = fs.readFileSync('src/hooks/useApi.ts', 'utf8');

// Replace the response handling to check content-type or fallback to text
content = content.replace(
  /if \(!res\.ok\) \{\s*const err = await res\.json\(\);\s*throw new Error\(err\.error \|\| 'API Error'\);\s*\}/g,
  `if (!res.ok) {
      const contentType = res.headers.get("content-type");
      let errorMessage = "API Error";
      if (contentType && contentType.includes("application/json")) {
        const err = await res.json();
        errorMessage = err.error || "API Error";
      } else {
        errorMessage = await res.text();
      }
      throw new Error(errorMessage);
    }`
);

fs.writeFileSync('src/hooks/useApi.ts', content);
