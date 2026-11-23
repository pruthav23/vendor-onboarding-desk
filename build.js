// Bundles src/ into a single self-contained index.html (no dependencies).
const fs = require('fs'), path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const html = read('template.html')
  .replace('{{ENGINE}}', () => read('engine.js'))
  .replace('{{DATA}}', () => read('data.js'))
  .replace('{{APP}}', () => read('app.js'));
fs.writeFileSync(path.join(__dirname, 'index.html'), html);
console.log('built index.html', (html.length / 1024).toFixed(1) + ' KB');
