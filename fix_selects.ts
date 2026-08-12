import fs from 'fs';
import path from 'path';

function walkDir(dir: string, callback: (file: string) => void) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(dirPath);
  });
}

walkDir('./src/pages', (filePath) => {
  if (filePath.endsWith('.tsx')) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;
    
    // Replace <select ... className="..."> with <select ... className="... bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
    // To do this reliably, we can use a regex that finds className attribute in a select tag.
    
    content = content.replace(/(<select[^>]*?className=["'])([^"']*)(["'])/g, (match, p1, p2, p3) => {
      let classes = p2.split(' ');
      if (!classes.includes('bg-white')) classes.push('bg-white');
      if (!classes.includes('dark:bg-slate-900')) classes.push('dark:bg-slate-900');
      // maybe add text colors explicitly just in case
      // if (!classes.includes('text-slate-900')) classes.push('text-slate-900');
      // if (!classes.includes('dark:text-slate-100')) classes.push('dark:text-slate-100');
      
      return p1 + classes.join(' ').trim() + p3;
    });

    if (content !== original) {
      fs.writeFileSync(filePath, content);
    }
  }
});
