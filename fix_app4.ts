import fs from 'fs';
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(
  'return (\n    <AuthContext.Provider',
  'return (\n    <ThemeProvider defaultTheme="system" storageKey="allowance-theme">\n    <AuthContext.Provider'
);

content = content.replace(
  '</AuthContext.Provider>\n  );\n}',
  '</AuthContext.Provider>\n    </ThemeProvider>\n  );\n}'
);

fs.writeFileSync('src/App.tsx', content);
