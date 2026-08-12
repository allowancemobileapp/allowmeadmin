import fs from 'fs';
import path from 'path';

function walkDir(dir: string, callback: (file: string) => void) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(dirPath);
  });
}

walkDir('./src', (filePath) => {
  if (filePath.endsWith('.tsx')) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;
    
    // Replace <input ... className="..."> 
    content = content.replace(/(<(input|textarea|select)[^>]*?className=["'])([^"']*)(["'])/g, (match, p1, p2, p3, p4) => {
      // Don't apply to checkboxes or radios which might be ruined by background classes, wait, input type="checkbox" has its own styles usually, but bg-white might mess it up? 
      // It's mostly fine in tailwind with appearance-none. Let's just avoid if it has type="checkbox" or type="radio" in the match?
      // Actually we can check if it matches type="checkbox" in the full tag.
      if (match.includes('type="checkbox"') || match.includes('type="radio"')) return match;
      if (match.includes('type="file"')) return match; // File inputs might be weird, but let's allow it, wait no, let's just do it
      
      let classes = p3.split(' ').filter(Boolean);
      
      // if it has bg-transparent, leave it alone
      if (!classes.includes('bg-transparent')) {
         if (!classes.includes('bg-white') && !classes.find(c => c.startsWith('bg-') && !c.startsWith('dark:'))) {
             classes.push('bg-white');
         }
         if (!classes.includes('dark:bg-slate-900') && !classes.find(c => c.startsWith('dark:bg-'))) {
             classes.push('dark:bg-slate-900');
         }
      }
      
      return p1 + classes.join(' ').trim() + p4;
    });

    if (content !== original) {
      fs.writeFileSync(filePath, content);
    }
  }
});
