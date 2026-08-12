import fs from 'fs';
import path from 'path';

function walkDir(dir: string, callback: (file: string) => void) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(dirPath);
  });
}

const replacements = [
  { from: /(["' ])bg-white(["' ])/g, to: '$1bg-white dark:bg-slate-900$2' },
  { from: /(["' ])bg-slate-50(["' ])/g, to: '$1bg-slate-50 dark:bg-slate-950$2' },
  { from: /(["' ])bg-slate-100(["' ])/g, to: '$1bg-slate-100 dark:bg-slate-800$2' },
  { from: /(["' ])text-slate-900(["' ])/g, to: '$1text-slate-900 dark:text-slate-100$2' },
  { from: /(["' ])text-slate-800(["' ])/g, to: '$1text-slate-800 dark:text-slate-200$2' },
  { from: /(["' ])text-slate-700(["' ])/g, to: '$1text-slate-700 dark:text-slate-300$2' },
  { from: /(["' ])text-slate-600(["' ])/g, to: '$1text-slate-600 dark:text-slate-400$2' },
  { from: /(["' ])border-slate-200(["' ])/g, to: '$1border-slate-200 dark:border-slate-800$2' },
  { from: /(["' ])border-slate-300(["' ])/g, to: '$1border-slate-300 dark:border-slate-700$2' },
  { from: /(["' ])divide-slate-200(["' ])/g, to: '$1divide-slate-200 dark:divide-slate-800$2' },
  { from: /(["' ])hover:bg-slate-50(["' ])/g, to: '$1hover:bg-slate-50 dark:hover:bg-slate-800$2' },
  { from: /(["' ])hover:bg-slate-100(["' ])/g, to: '$1hover:bg-slate-100 dark:hover:bg-slate-800$2' },
];

walkDir('./src', (filePath) => {
  if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;
    
    // Prevent double replacing if already has dark:
    replacements.forEach(r => {
      content = content.replace(r.from, (match, p1, p2) => {
        // if it already has dark:bg-slate-900 right after, don't replace
        // simpler: we'll just do it, and if it duplicates we can fix, but regex matches exactly the class.
        // Wait, the regex `bg-white ` (with space) won't match if it's already `bg-white dark:bg-slate-900 ` ? 
        // It actually might. Let's do a quick split by spaces and rebuild.
        return match; // fallback for now
      });
    });

    // better approach: use regex carefully or just string replace where safe
    let tokens = content.split(/(["'`\s])/);
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i] === 'bg-white') tokens[i] = 'bg-white dark:bg-slate-900';
      else if (tokens[i] === 'bg-slate-50') tokens[i] = 'bg-slate-50 dark:bg-slate-950';
      else if (tokens[i] === 'bg-slate-100') tokens[i] = 'bg-slate-100 dark:bg-slate-800/50';
      else if (tokens[i] === 'text-slate-900') tokens[i] = 'text-slate-900 dark:text-slate-100';
      else if (tokens[i] === 'text-slate-800') tokens[i] = 'text-slate-800 dark:text-slate-200';
      else if (tokens[i] === 'text-slate-700') tokens[i] = 'text-slate-700 dark:text-slate-300';
      else if (tokens[i] === 'text-slate-600') tokens[i] = 'text-slate-600 dark:text-slate-400';
      else if (tokens[i] === 'border-slate-200') tokens[i] = 'border-slate-200 dark:border-slate-800';
      else if (tokens[i] === 'border-slate-300') tokens[i] = 'border-slate-300 dark:border-slate-700';
      else if (tokens[i] === 'divide-slate-200') tokens[i] = 'divide-slate-200 dark:divide-slate-800';
      else if (tokens[i] === 'hover:bg-slate-50') tokens[i] = 'hover:bg-slate-50 dark:hover:bg-slate-800/50';
      else if (tokens[i] === 'hover:bg-slate-100') tokens[i] = 'hover:bg-slate-100 dark:hover:bg-slate-800/50';
      else if (tokens[i] === 'bg-white/50') tokens[i] = 'bg-white/50 dark:bg-slate-900/50';
    }
    
    // De-duplicate if needed
    let newContent = tokens.join('');
    newContent = newContent.replace(/dark:bg-slate-900 dark:bg-slate-900/g, 'dark:bg-slate-900');
    // ...
    
    if (newContent !== original) {
      fs.writeFileSync(filePath, newContent);
    }
  }
});
