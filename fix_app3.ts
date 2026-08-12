import fs from 'fs';
let content = fs.readFileSync('src/App.tsx', 'utf8');

// Sidebar
content = content.replace('bg-slate-900 text-slate-300', 'bg-slate-900 dark:bg-slate-950 text-slate-300 dark:text-slate-400 border-r dark:border-slate-800');
content = content.replace('bg-indigo-500 rounded-lg', 'bg-indigo-500 dark:bg-indigo-600 rounded-lg');
content = content.replace('text-white tracking-tight', 'text-white tracking-tight');

// Layout
content = content.replace('className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden text-sm"', 'className="flex h-screen bg-slate-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 overflow-hidden text-sm"');
content = content.replace('header className="h-16 bg-white border-b border-slate-200', 'header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800');
content = content.replace('h1 className="text-lg font-semibold text-slate-800', 'h1 className="text-lg font-semibold text-slate-800 dark:text-slate-200');

// Login
content = content.replace('className="flex h-screen items-center justify-center bg-slate-50 font-sans text-slate-900"', 'className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100"');
content = content.replace('className="w-full max-w-sm p-8 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col items-center"', 'className="w-full max-w-sm p-8 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center"');
content = content.replace('span className="font-bold text-slate-900 tracking-tight text-xl"', 'span className="font-bold text-slate-900 dark:text-white tracking-tight text-xl"');

fs.writeFileSync('src/App.tsx', content);
