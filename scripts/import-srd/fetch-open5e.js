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
// released October 2024.
const DOCUMENTS = ['srd-2014', 'srd-2024'];

/**
 * Endpoint configurations. Some endpoints are partitioned per-document
 * upstream (spells live in srd-2014 vs srd-2024 separately) — we fan out
 * across DOCUMENTS for those. Other endpoints (conditions, e.g.) ship a
 * single entry per item with a `descriptions` array tagged per-edition;
 * for those we fetch once with no document filter.
 */
const ENDPOINTS = [
  { slug: 'spells',      filterByDocument: true },
  { slug: 'conditions',  filterByDocument: false },
  { slug: 'feats',       filterByDocument: true },
  { slug: 'backgrounds', filterByDocument: true },
  { slug: 'species',     filterByDocument: true },
  { slug: 'items',       filterByDocument: true },
  { slug: 'creatures',   filterByDocument: true },
  { slug: 'classes',     filterByDocument: true },
  { slug: 'magicitems',  filterByDocument: true },
  // /weapons and
  // /armor are sub-views of /items — the weapon{} and armor{} sub-objects
  // on each item carry the mechanical detail, so we pull only /items/.
];

async function fetchAll(slug, queryString) {
  let url = `https://api.open5e.com/v2/${slug}/?${queryString}limit=200`;
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
    const combined = [];
    if (ep.filterByDocument) {
      // Fan out across editions; each query returns the entries published
      // in that document.
      for (const doc of DOCUMENTS) {
        try {
          const items = await fetchAll(ep.slug, `document__key=${doc}&`);
          console.log(`  ${doc}: ${items.length} entries`);
          combined.push(...items);
        } catch (err) {
          console.error(`  ✗ ${doc} failed: ${err.message}`);
        }
      }
    } else {
      // Single query — entries are deduped upstream and carry per-edition
      // tags inside their own structure (e.g. conditions.descriptions[]).
      try {
        const items = await fetchAll(ep.slug, '');
        console.log(`  all: ${items.length} entries`);
        combined.push(...items);
      } catch (err) {
        console.error(`  ✗ failed: ${err.message}`);
      }
    }
    const out = path.join(VENDOR_DIR, `${ep.slug}.json`);
    fs.writeFileSync(out, JSON.stringify(combined, null, 2));
    console.log(`  → wrote ${combined.length} entries to ${path.relative(process.cwd(), out)}`);
  }
}

main();
