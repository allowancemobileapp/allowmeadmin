import fs from 'fs';
let content = fs.readFileSync('src/pages/Library.tsx', 'utf8');
content = content.replace(
  'type: materialType,',
  'material_type: materialType,'
);
content = content.replace(
  'year: materialYear,',
  'academic_year: materialYear,'
);
fs.writeFileSync('src/pages/Library.tsx', content);
