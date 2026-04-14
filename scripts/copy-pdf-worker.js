#!/usr/bin/env node
// Copies both the pdfjs main module and its worker to public/ so Expo Web /
// Netlify serves them at the site root.
//
// We do this because Metro bundles everything as a classic script (not an ES
// module), which means pdfjs's `import.meta.url` becomes a syntax error when
// bundled. By self-hosting both files and loading them with the browser's
// native dynamic import at runtime (see pdf-parser.web.ts), we bypass Metro
// entirely for pdfjs — the browser treats them as proper ES modules.

const fs = require('fs');
const path = require('path');

const files = [
  { src: 'pdf.min.mjs', dest: 'pdf.min.mjs' },
  { src: 'pdf.worker.min.mjs', dest: 'pdf.worker.min.mjs' },
];

const srcDir = path.resolve(__dirname, '../node_modules/pdfjs-dist/legacy/build');
const destDir = path.resolve(__dirname, '../public');

if (!fs.existsSync(srcDir)) {
  console.log('copy-pdf-worker: pdfjs-dist not installed, skipping.');
  process.exit(0);
}

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

for (const { src, dest } of files) {
  const from = path.join(srcDir, src);
  const to = path.join(destDir, dest);
  if (!fs.existsSync(from)) {
    console.warn(`copy-pdf-worker: missing ${from}, skipping.`);
    continue;
  }
  fs.copyFileSync(from, to);
  console.log(`copy-pdf-worker: copied to public/${dest}`);
}
