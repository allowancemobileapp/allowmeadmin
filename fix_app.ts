import fs from 'fs';
let content = fs.readFileSync('src/App.tsx', 'utf8');

if (!content.includes('ThemeProvider')) {
  content = content.replace(
    'import { LayoutDashboard',
    'import { ThemeProvider } from "./components/ThemeProvider";\nimport { ThemeToggle } from "./components/ThemeToggle";\nimport { LayoutDashboard'
  );
  
  content = content.replace(
    '<AuthContext.Provider value={{ email, permissions, title, login, logout }}>',
    '<ThemeProvider defaultTheme="system" storageKey="allowance-theme">\n    <AuthContext.Provider value={{ email, permissions, title, login, logout }}>'
  );
  
  content = content.replace(
    '</AuthContext.Provider>',
    '</AuthContext.Provider>\n    </ThemeProvider>'
  );

  // also the other <AuthContext.Provider> inside if (!email)
  content = content.replace(
    '<AuthContext.Provider value={{ email, permissions, title, login, logout }}><Login /></AuthContext.Provider>;',
    '<ThemeProvider defaultTheme="system" storageKey="allowance-theme"><AuthContext.Provider value={{ email, permissions, title, login, logout }}><Login /></AuthContext.Provider></ThemeProvider>;'
  );
  
  fs.writeFileSync('src/App.tsx', content);
}
