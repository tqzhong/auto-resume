import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';

// Unicode-range subsets keep initial requests small while covering the full family.
// Every font is served by the app itself; no Google Fonts/CDN requests at runtime.
export async function bundleResumeFonts() {
  let css = '';
  for (const family of ['noto-serif-sc', 'noto-sans-sc']) {
    const source = `node_modules/@fontsource-variable/${family}`;
    const target = `dist/vendor/${family}`;
    await mkdir(target, { recursive: true });
    await cp(`${source}/files`, `${target}/files`, { recursive: true });
    await cp(`${source}/LICENSE`, `${target}/LICENSE.txt`);
    css += (await readFile(`${source}/index.css`, 'utf8')).replaceAll(
      './files/',
      `./${family}/files/`,
    );
    css += '\n';
  }
  await writeFile('dist/vendor/resume-fonts.css', css);
}
