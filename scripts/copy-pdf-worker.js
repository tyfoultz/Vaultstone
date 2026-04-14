#!/usr/bin/env node
// Copies the pdfjs worker file to public/ so Expo Web / Netlify serves it at
// the site root (/pdf.worker.min.mjs). We do this instead of bundling the
// worker through Metro because pdfjs needs to load the worker via a URL at
// runtime, and Metro doesn't support the `new URL(specifier, import.meta.url)`
// pattern that pdfjs's modern build expects.

const fs = require('fs');
const path = require('path');

const src = path.resolve(
  __dirname,
  '../node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
);
const destDir = path.resolve(__dirname, '../public');
const dest = path.join(destDir, 'pdf.worker.min.mjs');

if (!fs.existsSync(src)) {
  console.log('copy-pdf-worker: pdfjs-dist not installed, skipping.');
  process.exit(0);
}

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

fs.copyFileSync(src, dest);
console.log(`copy-pdf-worker: copied to public/pdf.worker.min.mjs`);
