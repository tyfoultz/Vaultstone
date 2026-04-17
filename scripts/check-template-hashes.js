#!/usr/bin/env node
/**
 * World-template hash drift check.
 *
 * Reads every packages/content/src/world-templates/*.vN.json, computes a
 * stable SHA-256 over each (keys sorted, no whitespace), and compares to
 * template-hashes.json. Published <key>@<version> entries whose hash no
 * longer matches fail CI.
 *
 * First run (or any time a new <key>.vN.json file appears) appends the
 * new hash to the manifest. This is the "one-time write" path — anything
 * after that is read-and-verify.
 *
 * Chained into `npm run typecheck` so Tier 1 catches drift before push
 * and Netlify catches it on deploy. No test runner needed.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TEMPLATES_DIR = path.join(
  __dirname,
  '..',
  'packages',
  'content',
  'src',
  'world-templates',
);
const MANIFEST_PATH = path.join(TEMPLATES_DIR, 'template-hashes.json');

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  return (
    '{' +
    keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') +
    '}'
  );
}

function hashTemplate(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  const canonical = stableStringify(parsed);
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch (err) {
    console.error(`[check-template-hashes] could not parse manifest: ${err.message}`);
    process.exit(1);
  }
}

function saveManifest(manifest) {
  const sorted = Object.keys(manifest)
    .sort()
    .reduce((acc, k) => {
      acc[k] = manifest[k];
      return acc;
    }, {});
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(sorted, null, 2) + '\n');
}

function main() {
  if (!fs.existsSync(TEMPLATES_DIR)) {
    console.error(`[check-template-hashes] templates dir missing: ${TEMPLATES_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(TEMPLATES_DIR)
    .filter((f) => /^[a-z_]+\.v\d+\.json$/.test(f))
    .sort();

  if (files.length === 0) {
    console.error('[check-template-hashes] no template files found — cannot enforce drift.');
    process.exit(1);
  }

  const manifest = loadManifest();
  const drifted = [];
  const added = [];
  const current = {};

  for (const file of files) {
    const match = file.match(/^([a-z_]+)\.v(\d+)\.json$/);
    const key = match[1];
    const version = Number(match[2]);
    const identifier = `${key}@${version}`;
    const hash = hashTemplate(path.join(TEMPLATES_DIR, file));

    current[identifier] = hash;

    if (manifest[identifier] === undefined) {
      manifest[identifier] = hash;
      added.push(identifier);
    } else if (manifest[identifier] !== hash) {
      drifted.push({
        identifier,
        expected: manifest[identifier],
        actual: hash,
      });
    }
  }

  if (drifted.length > 0) {
    console.error(
      '\n[check-template-hashes] FAIL — published template(s) changed without a version bump:',
    );
    for (const d of drifted) {
      console.error(`  • ${d.identifier}`);
      console.error(`      expected ${d.expected}`);
      console.error(`      actual   ${d.actual}`);
    }
    console.error(
      '\n  Published templates are immutable. Create a new <key>.vN+1.json instead.',
    );
    process.exit(1);
  }

  if (added.length > 0) {
    saveManifest(manifest);
    console.log(
      `[check-template-hashes] registered ${added.length} new template hash(es): ${added.join(', ')}`,
    );
  } else {
    console.log(`[check-template-hashes] ok — ${files.length} template(s) verified.`);
  }
}

main();
