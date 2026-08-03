import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(
  "  X\n} from 'lucide-react';",
  "  X,\n  LineChart\n} from 'lucide-react';"
);

fs.writeFileSync('src/App.tsx', content);
