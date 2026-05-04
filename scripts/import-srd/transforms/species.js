// Transform a snapshot of Open5e v2's /species endpoint (combined across
// the srd-2014 and srd-2024 documents) into the SpeciesResult[] shape
// consumed by packages/content/src/srd/data/species.json.
//
// Open5e v2 calls them "species" rather than "races" — the 2024 SRD
// renamed the concept and Open5e adopted the new name for both editions.
//
// SRD 5.1 ships 13 species (9 base + 4 subspecies: High Elf, Hill Dwarf,
// Lightfoot, Rock Gnome). SRD 5.2 ships 9 base species and dropped the
// subspecies model in favor of in-species choices.
//
// Per-edition entries (same as conditions/feats/backgrounds): species
// shapes diverge meaningfully across editions, so we emit one entry per
// (name, edition).

const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', '..', '..', 'vendor', 'srd', 'open5e', 'species.json');
const OUT = path.join(__dirname, '..', '..', '..', 'packages', 'content', 'src', 'srd', 'data', 'species.json');

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
 * Parse a Size trait's desc into one of 'Small' | 'Medium' | 'Large'.
 * Handles both 2024 ("Medium (about 5–7 feet tall)") and 5.1 formats
 * ("Halflings average about 3 feet tall… Your size is Small.") by
 * matching on word boundary anywhere in the text.
 */
function parseSize(desc) {
  if (!desc) return 'Medium';
  const m = String(desc).match(/\b(Tiny|Small|Medium|Large|Huge|Gargantuan)\b/i);
  if (!m) return 'Medium';
  const cap = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
  // Our SpeciesResult.size only allows 'Small' | 'Medium' | 'Large'.
  // Coerce anything outside that union to 'Medium' for now.
  return ['Small', 'Medium', 'Large'].includes(cap) ? cap : 'Medium';
}

/** Parse "30 feet" → 30. Fallback 30. */
function parseSpeed(desc) {
  if (!desc) return 30;
  const m = String(desc).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 30;
}

/**
 * Subspecies entries in Open5e v2 don't repeat the parent's Size/Speed
 * traits — they only ship the subspecies-specific traits (e.g. Lightfoot
 * has just Ability Score Increase + Naturally Stealthy). Build a lookup
 * keyed by (edition, slug) so subspecies can inherit size/speed from
 * their parent.
 */
function buildParentLookup(allSpecies) {
  /** @type {Map<string, any>} */
  const map = new Map();
  for (const sp of allSpecies) {
    const ed = DOC_TO_VERSION[sp.document?.key];
    if (!ed) continue;
    map.set(`${ed}::${slugify(sp.name)}`, sp);
  }
  return map;
}

/** Parse the slug suffix from a subspecies_of value like 'srd_halfling' or 'srd-2014_halfling'. */
function parentSlugFrom(subspeciesOf) {
  if (!subspeciesOf) return null;
  const parts = String(subspeciesOf).split('_');
  return parts[parts.length - 1] || null;
}

function transformOne(species, parentLookup) {
  const docKey = species.document?.key;
  const srdVersion = DOC_TO_VERSION[docKey];
  if (!srdVersion) return null;

  const traits = Array.isArray(species.traits) ? species.traits : [];
  let sizeTrait = traits.find((t) => t.type === 'SIZE') ?? traits.find((t) => t.name === 'Size');
  let speedTrait = traits.find((t) => t.type === 'SPEED') ?? traits.find((t) => t.name === 'Speed');

  // Subspecies inherit size/speed from their parent when the trait is
  // missing on the subspecies entry itself.
  if ((!sizeTrait || !speedTrait) && species.is_subspecies && species.subspecies_of) {
    const parentSlug = parentSlugFrom(species.subspecies_of);
    const parent = parentSlug ? parentLookup.get(`${srdVersion}::${parentSlug}`) : null;
    if (parent) {
      const parentTraits = Array.isArray(parent.traits) ? parent.traits : [];
      if (!sizeTrait) {
        sizeTrait = parentTraits.find((t) => t.type === 'SIZE') ?? parentTraits.find((t) => t.name === 'Size');
      }
      if (!speedTrait) {
        speedTrait = parentTraits.find((t) => t.type === 'SPEED') ?? parentTraits.find((t) => t.name === 'Speed');
      }
    }
  }

  // Other traits — drop SIZE/SPEED since they're hoisted to top-level
  // size/speed fields.
  const otherTraits = traits
    .filter((t) => t.type !== 'SIZE' && t.type !== 'SPEED' && t.name !== 'Size' && t.name !== 'Speed')
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
    .map((t) => ({
      name: t.name,
      description: normalizeDescription(t.desc),
    }));

  const slug = slugify(species.name);
  return {
    key: `${slug}-srd-${VERSION_TO_SLUG[srdVersion]}`,
    name: species.name,
    type: 'species',
    tier: 'srd',
    system: 'dnd5e',
    srdVersions: [srdVersion],
    size: parseSize(sizeTrait?.desc),
    speed: parseSpeed(speedTrait?.desc),
    traits: otherTraits,
    // 5.1 species had fixed ASIs baked in (e.g. "+2 STR"); 2024 species
    // dropped them in favor of background-driven ASIs. The mechanical text
    // for 5.1 ASIs lives in the traits array (under "Ability Score
    // Increase"). Leaving the structured field empty for now — UI consumers
    // can render the trait if they need to surface it.
    abilityScoreIncreases: [],
    description: normalizeDescription(species.desc),
    data: {},
  };
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`Snapshot missing: ${SRC}`);
    console.error(`Run \`node scripts/import-srd/fetch-open5e.js species\` first.`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const parentLookup = buildParentLookup(raw);
  const out = raw.map((sp) => transformOne(sp, parentLookup)).filter(Boolean);

  // Stable sort: by name, then edition (5.1 before 2.0).
  out.sort((a, b) =>
    a.name.localeCompare(b.name) ||
    a.srdVersions[0].localeCompare(b.srdVersions[0]),
  );

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`Wrote ${out.length} species → ${path.relative(process.cwd(), OUT)}`);

  const byVersion = out.reduce((acc, s) => {
    const k = s.srdVersions[0];
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  console.log('  By edition:', byVersion);
  console.log(`  Distinct names: ${new Set(out.map((s) => s.name)).size}`);
  const counts = out.reduce((acc, s) => {
    acc[s.size] = (acc[s.size] ?? 0) + 1;
    return acc;
  }, {});
  console.log('  By size:', counts);
}

main();
