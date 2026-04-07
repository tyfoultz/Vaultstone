#!/usr/bin/env node
// Removes the `exports` field from metro packages so Node falls back to
// allowing all internal path imports. Required for Expo 53 + Node 20.

const fs = require('fs');
const path = require('path');

function removeExports(packageName) {
  const pkgPath = path.resolve(__dirname, `../node_modules/${packageName}/package.json`);

  if (!fs.existsSync(pkgPath)) {
    console.log(`patch-metro: ${packageName} not found, skipping.`);
    return;
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  if (!pkg.exports) {
    console.log(`patch-metro: ${packageName} has no exports field, skipping.`);
    return;
  }

  delete pkg.exports;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  console.log(`patch-metro: removed exports from ${packageName}`);
}

removeExports('metro');
removeExports('metro-cache');
removeExports('metro-config');
removeExports('metro-runtime');
removeExports('metro-source-map');
removeExports('metro-transform-plugins');
