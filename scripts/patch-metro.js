#!/usr/bin/env node
// Patches metro's package.json to expose internal paths that @expo/cli needs
// but that Node 22's strict module exports enforcement blocks.
// See: https://github.com/expo/expo/issues/xxxxx

const fs = require('fs');
const path = require('path');

const metroPkgPath = path.resolve(__dirname, '../node_modules/metro/package.json');

if (!fs.existsSync(metroPkgPath)) {
  console.log('patch-metro: metro not found, skipping.');
  process.exit(0);
}

const pkg = JSON.parse(fs.readFileSync(metroPkgPath, 'utf8'));

const pathsToExpose = [
  './src/lib/TerminalReporter',
  './src/lib/terminal',
  './src/Server',
  './src/DeltaBundler',
];

let patched = false;
for (const p of pathsToExpose) {
  if (!pkg.exports[p]) {
    pkg.exports[p] = p + '.js';
    patched = true;
  }
}

if (patched) {
  fs.writeFileSync(metroPkgPath, JSON.stringify(pkg, null, 2));
  console.log('patch-metro: patched metro/package.json exports for Node 22 compatibility.');
} else {
  console.log('patch-metro: already patched, nothing to do.');
}
