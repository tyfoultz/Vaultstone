// Fetch SRD content from the Open5e API and snapshot it to vendor/srd/open5e/.
// Snapshots are checked into the repo so the import is reproducible — re-run
// this script only when refreshing from upstream.
//
// Open5e content is published under CC-BY 4.0; see http://open5e.com/legal.
// Each entry in the snapshot retains its `document__*` fields so the
// downstream transform can attribute correctly.
//
// Usage:
//   node scripts/import-srd/fetch-open5e.js              # fetch all types
//   node scripts/import-srd/fetch-open5e.js spells       # one type
//   node scripts/import-srd/fetch-open5e.js spells items # multiple types

const fs = require('node:fs');
const path = require('node:path');

const VENDOR_DIR = path.join(__dirname, '..', '..', 'vendor', 'srd', 'open5e');

// Endpoints we pull from. `slug` is the path component on the v1 API; we
// always filter to wotc-srd content (the OGL/SRD 5.1 document Open5e ships).
const ENDPOINTS = [
  { slug: 'spells',     filter: 'document__slug=wotc-srd' },
  { slug: 'monsters',   filter: 'document__slug=wotc-srd' },
  { slug: 'magicitems', filter: 'document__slug=wotc-srd' },
  { slug: 'weapons',    filter: 'document__slug=wotc-srd' },
  { slug: 'armor',      filter: 'document__slug=wotc-srd' },
  { slug: 'conditions', filter: 'document__slug=wotc-srd' },
  { slug: 'feats',      filter: 'document__slug=wotc-srd' },
  { slug: 'backgrounds', filter: 'document__slug=wotc-srd' },
  { slug: 'races',      filter: 'document__slug=wotc-srd' },
  { slug: 'classes',    filter: 'document__slug=wotc-srd' },
];

async function fetchAll(slug, filter) {
  let url = `https://api.open5e.com/v1/${slug}/?${filter}&limit=200`;
  const results = [];
  while (url) {
    process.stdout.write(`  fetching ${url}\n`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const json = await res.json();
    results.push(...(json.results ?? []));
    url = json.next ?? null;
  }
  return results;
}

async function main() {
  fs.mkdirSync(VENDOR_DIR, { recursive: true });
  const requested = process.argv.slice(2);
  const targets = requested.length > 0
    ? ENDPOINTS.filter((e) => requested.includes(e.slug))
    : ENDPOINTS;

  if (requested.length > 0 && targets.length === 0) {
    console.error(`No matching endpoints. Available: ${ENDPOINTS.map((e) => e.slug).join(', ')}`);
    process.exit(1);
  }

  for (const ep of targets) {
    console.log(`\n=== ${ep.slug} ===`);
    try {
      const items = await fetchAll(ep.slug, ep.filter);
      const out = path.join(VENDOR_DIR, `${ep.slug}.json`);
      fs.writeFileSync(out, JSON.stringify(items, null, 2));
      console.log(`  → wrote ${items.length} entries to ${path.relative(process.cwd(), out)}`);
    } catch (err) {
      console.error(`  ✗ failed for ${ep.slug}: ${err.message}`);
    }
  }
}

main();
