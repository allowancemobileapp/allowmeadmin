import fs from 'fs';
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(
  '<span className="bg-slate-100 px-2 py-1 rounded text-slate-600 hidden sm:block">Uptime: 99.9%</span>',
  '<ThemeToggle />\n            <span className="bg-slate-100 px-2 py-1 rounded text-slate-600 hidden sm:block">Uptime: 99.9%</span>'
);

fs.writeFileSync('src/App.tsx', content);
