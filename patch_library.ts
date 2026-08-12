import fs from 'fs';
let content = fs.readFileSync('src/pages/Library.tsx', 'utf8');

// Replace the modal title
content = content.replace(
  "{notification.type === 'error' ? 'Failed to Generate' : 'Success!'}",
  "{notification.type === 'error' ? 'Error' : 'Success!'}"
);

// Replace the upload fetch error handling
content = content.replace(
  'errorMsg = await uploadRes.text();',
  `let rawText = await uploadRes.text();
           if (rawText.includes('413') || rawText.includes('Too Large')) {
             errorMsg = "The file is too large to be uploaded (Maximum size is 30MB).";
           } else if (rawText.includes('<html')) {
             errorMsg = "Server error occurred during upload. Please try a different file.";
           } else {
             errorMsg = rawText;
           }`
);

fs.writeFileSync('src/pages/Library.tsx', content);
