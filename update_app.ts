import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(
  "import Metadata from './pages/Metadata';",
  "import Metadata from './pages/Metadata';\nimport Analytics from './pages/Analytics';"
);

content = content.replace(
  "{ to: '/metadata', label: 'System Metadata', icon: Package, id: 'metadata' },",
  "{ to: '/metadata', label: 'System Metadata', icon: Package, id: 'metadata' },\n    { to: '/analytics', label: 'Analytics & Growth', icon: LineChart, id: 'analytics' },"
);

content = content.replace(
  "<Route path=\"/metadata\" element={<Metadata />} />",
  "<Route path=\"/metadata\" element={<Metadata />} />\n            <Route path=\"/analytics\" element={<Analytics />} />"
);

// If LineChart is not imported from lucide-react, we should check what's imported.
fs.writeFileSync('src/App.tsx', content);
