const fs = require('fs');
let sm = fs.readFileSync('src/pages/SchoolManagement.tsx', 'utf8');
sm = sm.replace(/function FeeCard\(\{ school, onSave \}: \{ school: any, onSave: any \}\) \{/, 'function FeeCard({ school, onSave }: { key?: any, school: any, onSave: any }) {');
fs.writeFileSync('src/pages/SchoolManagement.tsx', sm);
console.log('Fixed');
