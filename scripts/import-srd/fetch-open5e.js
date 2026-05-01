// Fetch SRD content from the Open5e v2 API and snapshot it to vendor/srd/open5e/.
// Snapshots are checked into the repo so the import is reproducible — re-run
// this script only when refreshing from upstream.
//
// Open5e content is published under CC-BY 4.0; see http://open5e.com/legal.
// Each entry in the snapshot retains its `document` field (with .key, e.g.
// 'srd-2014' or 'srd-2024') so the downstream transform can attribute and
// edition-tag correctly.
//
// Usage:
//   node scripts/import-srd/fetch-open5e.js              # all types
//   node scripts/import-srd/fetch-open5e.js spells       # one type
//   node scripts/import-srd/fetch-open5e.js spells items # multiple

const fs = require('node:fs');
const path = require('node:path');

const VENDOR_DIR = path.join(__dirname, '..', '..', 'vendor', 'srd', 'open5e');

// Open5e v2 documents we draw SRD content from. `srd-2014` is the 5.1 SRD
// (the OGL/CC-BY 4.0 SRD released by WotC in 2016); `srd-2024` is the 5.2 SRD
// released October 2024. We pull from both and let the transforms tag each
// entry with the matching srdVersions value.
const DOCUMENTS = ['srd-2014', 'srd-2024'];

// Endpoints we pull from. Each one fans out across all DOCUMENTS so the
// snapshot contains every available edition of the entry.
const ENDPOINTS = [
  'spells',
  // Future per-type imports will add: monsters, items, weapons, armor,
  // conditions, feats, backgrounds, races, classes. Keep this list in sync
  // with the available v2 endpoints.
];

async function fetchAllForDoc(slug, docKey) {
  let url = `https://api.open5e.com/v2/${slug}/?document__key=${docKey}&limit=200`;
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
    ? ENDPOINTS.filter((e) => requested.includes(e))
    : ENDPOINTS;

  if (requested.length > 0 && targets.length === 0) {
    console.error(`No matching endpoints. Available: ${ENDPOINTS.join(', ')}`);
    process.exit(1);
  }

  for (const slug of targets) {
    console.log(`\n=== ${slug} ===`);
    const combined = [];
    for (const doc of DOCUMENTS) {
      try {
        const items = await fetchAllForDoc(slug, doc);
        console.log(`  ${doc}: ${items.length} entries`);
        combined.push(...items);
      } catch (err) {
        console.error(`  ✗ ${doc} failed: ${err.message}`);
      }
    }
    const out = path.join(VENDOR_DIR, `${slug}.json`);
    fs.writeFileSync(out, JSON.stringify(combined, null, 2));
    console.log(`  → wrote ${combined.length} entries to ${path.relative(process.cwd(), out)}`);
  }
}

main();
