import fs from 'fs';
import path from 'path';

const out = 'dist';
const seen = new Set();

function walk(file) {
  const full = path.normalize(file);
  if (seen.has(full)) return;
  seen.add(full);
  const text = fs.readFileSync(full, 'utf8');
  for (const m of text.matchAll(/(?:import|export)[^'"]*?from\s*['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
    walk(path.join(path.dirname(full), m[1] || m[2]));
  }
}

walk('src/main.js');
fs.rmSync(out, { recursive: true, force: true });
for (const f of ['index.html', ...seen]) {
  fs.mkdirSync(path.join(out, path.dirname(f)), { recursive: true });
  fs.copyFileSync(f, path.join(out, f));
}
console.log(`dist/: index.html + ${seen.size} modules`);
