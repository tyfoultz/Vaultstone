// Transform a snapshot of Open5e v2's /classes endpoint into the
// SubclassResult[] shape consumed by packages/content/src/srd/data/subclasses.json.
//
// Subclasses ride the same /classes/ endpoint as base classes — they're
// distinguished by a non-null `subclass_of: { name, key }` reference. The
// classes import already snapshots the full payload at
// vendor/srd/open5e/classes.json, so this transform reuses that file.
//
// Per-edition entries: SRD 5.1 and 2024 ship the same 12 subclasses (one
// per base class) but their feature levels diverge — e.g. Champion's
// Remarkable Athlete shifts from L7 (5.1) to L3 (2024), and the 2024
// subclass adds Heroic Warrior at L10. We emit one SubclassResult per
// (subclass, edition) with edition-suffixed keys.
//
// `parentClassKey` is intentionally edition-suffixed (`barbarian-srd-2-0`)
// so the class detail page can filter `parentClassKey === c.key` directly
// — without that suffix, a 5.1 subclass would surface under both editions
// of its parent.

const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', '..', '..', 'vendor', 'srd', 'open5e', 'classes.json');
const OUT = path.join(__dirname, '..', '..', '..', 'packages', 'content', 'src', 'srd', 'data', 'subclasses.json');

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

function normalizeDescription(s) {
  if (!s) return '';
  return String(s)
    .replace(/\r\n?/g, '\n')
    .replace(/^[\t ]*[*\-][\t ]+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Build the leveled feature list. Same logic as classes.js but scoped to
 * subclass entries: only CLASS_LEVEL_FEATURE features with non-empty
 * gained_at[] are real features. Multi-level features (e.g. an "ASI"-style
 * subclass feature gained at multiple levels) are expanded one row per
 * (level, feature) pair.
 */
function buildFeatures(features) {
  /** @type {Array<{ level: number; name: string; description: string }>} */
  const out = [];
  for (const f of features) {
    if (f.feature_type !== 'CLASS_LEVEL_FEATURE') continue;
    const levels = (f.gained_at ?? []).map((g) => g.level).filter((l) => typeof l === 'number');
    if (levels.length === 0) continue;
    for (const lvl of levels) {
      out.push({
        level: lvl,
        name: f.name,
        description: normalizeDescription(f.desc),
      });
    }
  }
  out.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  return out.length > 0 ? out : undefined;
}

/** Lowest level at which the subclass grants a feature → unlock level. */
function detectUnlockLevel(features) {
  const levels = features
    .filter((f) => f.feature_type === 'CLASS_LEVEL_FEATURE')
    .flatMap((f) => (f.gained_at ?? []).map((g) => g.level))
    .filter((l) => typeof l === 'number');
  return levels.length > 0 ? Math.min(...levels) : 3;
}

function transformOne(sub) {
  if (!sub.subclass_of) return null;

  const docKey = sub.document?.key;
  const srdVersion = DOC_TO_VERSION[docKey];
  if (!srdVersion) return null;

  const parentName = sub.subclass_of.name;
  if (!parentName) return null;

  // parentClassKey: must match the edition-suffixed class key produced by
  // transforms/classes.js — `barbarian-srd-5-1`, `wizard-srd-2-0`, etc.
  const parentSlug = slugify(parentName);
  const parentClassKey = `${parentSlug}-srd-${VERSION_TO_SLUG[srdVersion]}`;

  const slug = slugify(sub.name);
  const features = buildFeatures(sub.features);
  const unlockLevel = features?.[0]?.level ?? detectUnlockLevel(sub.features);

  return {
    key: `${slug}-srd-${VERSION_TO_SLUG[srdVersion]}`,
    name: sub.name,
    type: 'subclass',
    tier: 'srd',
    system: 'dnd5e',
    srdVersions: [srdVersion],
    parentClassKey,
    parentClassName: parentName,
    unlockLevel,
    description: normalizeDescription(sub.desc),
    features,
    data: {},
  };
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`Snapshot missing: ${SRC}`);
    console.error(`Run \`node scripts/import-srd/fetch-open5e.js classes\` first.`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const out = raw.map(transformOne).filter(Boolean);

  // Stable sort: by parent class name, then subclass name, then edition.
  out.sort((a, b) =>
    (a.parentClassName ?? '').localeCompare(b.parentClassName ?? '') ||
    a.name.localeCompare(b.name) ||
    a.srdVersions[0].localeCompare(b.srdVersions[0]),
  );

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`Wrote ${out.length} subclasses → ${path.relative(process.cwd(), OUT)}`);

  const byVersion = out.reduce((acc, s) => {
    const k = s.srdVersions[0];
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  console.log('  By edition:', byVersion);
  console.log(`  Distinct names: ${new Set(out.map((s) => s.name)).size}`);

  // Surface unlock-level distribution — useful for sanity-checking against
  // the canonical 3rd-level subclass introduction in 2024 (subclass unlock
  // moved to level 3 across all classes in 2024; 5.1 had Cleric/Sorcerer/
  // Warlock/Wizard at 1 or 2).
  const byUnlock = out.reduce((acc, s) => {
    const k = `${s.srdVersions[0]} L${s.unlockLevel}`;
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  console.log('  By unlock level:', byUnlock);
}

main();
