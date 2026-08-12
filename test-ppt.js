const ppt2text = await import('ppt-to-text');
console.log(ppt2text.default ? "HAS DEFAULT" : "NO DEFAULT");
console.log(typeof ppt2text.extractText);
console.log(typeof ppt2text.default?.extractText);
