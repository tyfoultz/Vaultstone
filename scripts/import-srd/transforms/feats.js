// Transform a snapshot of Open5e v2's /feats endpoint into the FeatResult[]
// shape consumed by packages/content/src/srd/data/feats.json.
//
// SRD 5.1 ships only one feat (Grappler — most 5.1 PHB feats aren't SRD).
// SRD 5.2 ships ~17 (the unified 2024 origin / general / fighting style /
// epic boon set). Where the same-named feat appears in both editions
// (only Grappler) the mechanical text differs meaningfully, so we emit
// one FeatResult per (name, edition) pair — same per-edition strategy
// used for conditions.

const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', '..', '..', 'vendor', 'srd', 'open5e', 'feats.json');
const OUT = path.join(__dirname, '..', '..', '..', 'packages', 'content', 'src', 'srd', 'data', 'feats.json');

const DOC_TO_VERSION = {
  'srd-2014': 'SRD_5.1',
  'srd-2024': 'SRD_2.0',
};

const VERSION_TO_SLUG = {
  'SRD_5.1': '5-1',
  'SRD_2.0': '2-0',
};

function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** "GENERAL" / "General" → "general"; "Fighting Style" → "fighting-style". */
function normalizeCategory(rawType) {
  if (!rawType) return 'general';
  return String(rawType).toLowerCase().replace(/\s+/g, '-');
}

/** Reuse the same description normalizer used for conditions. */
function normalizeDescription(s) {
  if (!s) return '';
  return String(s)
    .replace(/\r\n?/g, '\n')
    .replace(/^[\t ]*[*\-][\t ]+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function transformOne(feat) {
  const docKey = feat.document?.key;
  const srdVersion = DOC_TO_VERSION[docKey];
  if (!srdVersion) return null;

  const slug = slugify(feat.name);
  const benefits = Array.isArray(feat.benefits)
    ? feat.benefits.map((b) => normalizeDescription(b.desc)).filter(Boolean)
    : [];

  return {
    key: `${slug}-srd-${VERSION_TO_SLUG[srdVersion]}`,
    name: feat.name,
    type: 'feat',
    tier: 'srd',
    system: 'dnd5e',
    srdVersions: [srdVersion],
    category: normalizeCategory(feat.type),
    prerequisites: feat.prerequisite ? String(feat.prerequisite).trim() : '',
    benefits,
    description: normalizeDescription(feat.desc),
    data: {},
  };
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`Snapshot missing: ${SRC}`);
    console.error(`Run \`node scripts/import-srd/fetch-open5e.js feats\` first.`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const out = raw.map(transformOne).filter(Boolean);

  // Stable sort: by category, then name, then edition (5.1 before 2.0).
  const categoryOrder = { 'origin': 0, 'general': 1, 'fighting-style': 2, 'epic-boon': 3 };
  out.sort((a, b) =>
    ((categoryOrder[a.category] ?? 9) - (categoryOrder[b.category] ?? 9)) ||
    a.name.localeCompare(b.name) ||
    a.srdVersions[0].localeCompare(b.srdVersions[0]),
  );

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`Wrote ${out.length} feats → ${path.relative(process.cwd(), OUT)}`);

  const byVersion = out.reduce((acc, f) => {
    const k = f.srdVersions[0];
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  const byCategory = out.reduce((acc, f) => {
    acc[f.category] = (acc[f.category] ?? 0) + 1;
    return acc;
  }, {});
  console.log('  By edition:', byVersion);
  console.log('  By category:', byCategory);
  const distinctNames = new Set(out.map((f) => f.name)).size;
  console.log(`  Distinct names: ${distinctNames}`);
}

main();
