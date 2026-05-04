// Transform a snapshot of Open5e v2's /conditions endpoint into the
// ConditionResult[] shape consumed by packages/content/src/srd/data/conditions.json.
//
// Conditions are a mixed case in v2: a single upstream entry per condition
// carries a `descriptions` array, and each description is tagged with
// document + gamesystem. The 5.1 and 2024 editions of Exhaustion (and
// some others) have meaningfully different mechanical text, so we emit
// one ConditionResult per (name, edition) pair rather than collapsing
// them into a single entry. The version filter naturally shows the right
// one per system. Catalog browsing without a system filter sees both,
// which is acceptable since the list is short (~15 conditions × 2 editions).

const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', '..', '..', 'vendor', 'srd', 'open5e', 'conditions.json');
const OUT = path.join(__dirname, '..', '..', '..', 'packages', 'content', 'src', 'srd', 'data', 'conditions.json');

const DOC_TO_VERSION = {
  'srd-2014': 'SRD_5.1',
  'srd-2024': 'SRD_2.0',
};

const VERSION_TO_SLUG = {
  'SRD_5.1': '5-1',
  'SRD_2.0': '2-0',
};

/** Slugify a condition name for our `key`. */
function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Normalize Open5e description text for plain-Text rendering:
 *  - unify line endings to `\n`
 *  - convert markdown bullet markers (`* ` or `- ` at line start) to `• `
 *  - collapse runs of 3+ blank lines to a single blank line
 *  - trim leading/trailing whitespace
 *
 * Tables and other rich markdown stay untouched — those are rare (mostly
 * the 5.1 Exhaustion table) and can be addressed when the renderer learns
 * markdown.
 */
function normalizeDescription(s) {
  if (!s) return '';
  return String(s)
    .replace(/\r\n?/g, '\n')
    .replace(/^[\t ]*[*\-][\t ]+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`Snapshot missing: ${SRC}`);
    console.error(`Run \`node scripts/import-srd/fetch-open5e.js conditions\` first.`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));

  /** @type {Array<{key: string; name: string; type: string; tier: string; system: string; srdVersions: string[]; description: string; effects: string[]; data: object}>} */
  const out = [];

  for (const cond of raw) {
    if (!Array.isArray(cond.descriptions) || cond.descriptions.length === 0) continue;

    for (const desc of cond.descriptions) {
      const srdVersion = DOC_TO_VERSION[desc.document];
      if (!srdVersion) continue; // skip non-SRD descriptions (e.g. a5e variants)

      const slug = slugify(cond.name);
      out.push({
        key: `${slug}-srd-${VERSION_TO_SLUG[srdVersion]}`,
        name: cond.name,
        type: 'condition',
        tier: 'srd',
        system: 'dnd5e',
        srdVersions: [srdVersion],
        description: normalizeDescription(desc.desc),
        // Open5e doesn't ship structured effect bullets; keep empty so the
        // UI's effects-bullet section hides cleanly. The full mechanical
        // text lives in `description` instead.
        effects: [],
        data: {},
      });
    }
  }

  // Stable sort: by name, then by edition (5.1 before 2.0). Matches the
  // common reading order ("show me 5.1 then 2024" if both appear).
  out.sort((a, b) =>
    a.name.localeCompare(b.name) ||
    a.srdVersions[0].localeCompare(b.srdVersions[0]),
  );

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`Wrote ${out.length} conditions → ${path.relative(process.cwd(), OUT)}`);

  const byVersion = out.reduce((acc, c) => {
    const k = c.srdVersions[0];
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  console.log('  By edition:', byVersion);
  const distinctNames = new Set(out.map((c) => c.name)).size;
  console.log(`  Distinct names: ${distinctNames}`);
}

main();
