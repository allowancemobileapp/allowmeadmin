import fs from 'fs';
let content = fs.readFileSync('src/App.tsx', 'utf8');

if (!content.includes('import { ThemeProvider }')) {
  content = `import { ThemeProvider } from "./components/ThemeProvider";\nimport { ThemeToggle } from "./components/ThemeToggle";\n` + content;
  fs.writeFileSync('src/App.tsx', content);
}
