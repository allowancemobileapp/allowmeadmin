import fs from 'fs';
let content = fs.readFileSync('src/hooks/useApi.ts', 'utf8');

content = content.replace(
  /errorMessage = await res\.text\(\);/g,
  `let rawText = await res.text();
        if (rawText.includes('413') || rawText.includes('Too Large')) {
          errorMessage = "Payload too large. Please reduce the size of your request (Max 30MB).";
        } else if (rawText.includes('<html')) {
          errorMessage = "Server returned an unexpected error. Please try again.";
        } else {
          errorMessage = rawText;
        }`
);

fs.writeFileSync('src/hooks/useApi.ts', content);
