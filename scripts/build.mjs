import { build } from 'esbuild';
import { mkdir, copyFile, cp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { bundleResumeFonts } from './fonts.mjs';

// Only dist/ is generated. Keep editable HTML and styles in public/.
await rm('dist', { recursive: true, force: true });
await cp('public', 'dist', { recursive: true });
await mkdir('dist/vendor', { recursive: true });
await build({
  entryPoints: ['src/app.js'],
  bundle: true,
  outfile: 'dist/app.js',
  format: 'iife',
  target: 'es2020',
  minify: true,
  legalComments: 'linked',
});
await copyFile('node_modules/pagedjs/dist/paged.polyfill.js', 'dist/vendor/paged.polyfill.js');
await copyFile('node_modules/katex/dist/katex.min.css', 'dist/vendor/katex.min.css');
await cp('node_modules/katex/dist/fonts', 'dist/vendor/fonts', { recursive: true });
await bundleResumeFonts();

// Retain notices for installed runtime dependencies, including transitives used
// by bundled libraries. esbuild also preserves embedded license comments.
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
let notices = 'Third-party open-source notices\n\n';
for (const [path, entry] of Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b))) {
  if (!path.startsWith('node_modules/') || entry.dev) continue;
  const root = resolve(path);
  let pkg;
  try {
    pkg = JSON.parse(await readFile(`${root}/package.json`, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT' && entry.optional) continue;
    throw error;
  }
  const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url || '';
  notices += `${pkg.name} ${pkg.version} — ${pkg.license || 'See package'}\n${repo}\n`;
  const files = (await readdir(root))
    .filter((name) => /^(licen[cs]e|copying|notice)(\.|$)/i.test(name))
    .sort();
  for (const file of files) {
    try {
      notices += `\n--- ${file} ---\n${await readFile(`${root}/${file}`, 'utf8')}\n`;
    } catch (error) {
      if (error.code !== 'EISDIR') throw error;
    }
  }
  notices += '\n\n';
}
await writeFile('dist/THIRD-PARTY-NOTICES.txt', notices);
await copyFile('LICENSE', 'dist/LICENSE.txt');
console.log('Built dist/ with local Markdown, math and pagination dependencies.');
