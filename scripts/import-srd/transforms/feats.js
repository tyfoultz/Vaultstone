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

const ABILITY_NAMES = {
  strength: 'strength', dexterity: 'dexterity', constitution: 'constitution',
  intelligence: 'intelligence', wisdom: 'wisdom', charisma: 'charisma',
};

/**
 * Parse Open5e's free-form prereq prose into structured FeatPrerequisite[].
 *
 * Known surface across the SRD 5.1 + 5.2 feat snapshots (6 unique strings):
 *
 *   "Strength 13 or higher"           → ability-score (str ≥ 13)
 *   "Level 4+"                        → character-level ≥ 4
 *   "Level 19+"                       → character-level ≥ 19
 *   "Fighting Style Feature"          → class-feature "Fighting Style"
 *   "Level 4+, Strength or Dexterity 13+"
 *                                     → AND of [character-level ≥ 4,
 *                                               ability-score (str|dex ≥ 13)]
 *   "Level 19+, Spellcasting Feature" → AND of [character-level ≥ 19,
 *                                               class-feature "Spellcasting"]
 *
 * Anything else falls through to a single { kind: 'prose' } clause so the
 * gate stays informational rather than dropping the requirement.
 *
 * Returns [] when there's no prereq, otherwise an array of structured
 * clauses that AND together.
 */
function parsePrerequisite(raw) {
  if (!raw) return [];
  const text = String(raw).trim();
  if (!text) return [];

  // Split on commas to get AND-conjoined clauses. The SRD prose is
  // simple enough that comma reliably separates clauses; if a future
  // prereq form needs richer punctuation we extend here.
  const parts = text.split(',').map((p) => p.trim()).filter(Boolean);
  const clauses = [];
  let unrecognized = false;

  for (const part of parts) {
    const clause = parseClause(part);
    if (clause) clauses.push(clause);
    else { unrecognized = true; break; }
  }

  if (unrecognized || clauses.length === 0) {
    return [{ kind: 'prose', text }];
  }
  return clauses;
}

function parseClause(part) {
  // "Level N+" or "Level N or higher"
  const lvl = /^level\s+(\d+)\s*(?:\+|or higher)?$/i.exec(part);
  if (lvl) {
    return { kind: 'character-level', minimum: Number(lvl[1]) };
  }

  // "<Ability> N+" / "<Ability> N or higher" / "<A1> or <A2> N+"
  const abil = /^([a-z][a-z\s]*?)\s+(\d+)\s*(?:\+|or higher)?$/i.exec(part);
  if (abil) {
    const abilities = parseAbilityList(abil[1]);
    if (abilities.length > 0) {
      return { kind: 'ability-score', abilities, minimum: Number(abil[2]) };
    }
  }

  // "<Name> Feature" — class feature gating.
  const feat = /^(.+?)\s+feature$/i.exec(part);
  if (feat) {
    return { kind: 'class-feature', featureName: feat[1].trim() };
  }

  return null;
}

function parseAbilityList(s) {
  // "Strength" → ['strength']; "Strength or Dexterity" → ['strength', 'dexterity'].
  const tokens = s.split(/\s+or\s+|\s*\/\s*|\s+and\s+/i)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const out = [];
  for (const t of tokens) {
    if (ABILITY_NAMES[t]) out.push(ABILITY_NAMES[t]);
    else return [];
  }
  return out;
}

function transformOne(feat) {
  const docKey = feat.document?.key;
  const srdVersion = DOC_TO_VERSION[docKey];
  if (!srdVersion) return null;

  const slug = slugify(feat.name);
  const benefits = Array.isArray(feat.benefits)
    ? feat.benefits.map((b) => normalizeDescription(b.desc)).filter(Boolean)
    : [];

  const prereqProse = feat.prerequisite ? String(feat.prerequisite).trim() : '';
  const prereqRaw = parsePrerequisite(prereqProse);

  const out = {
    key: `${slug}-srd-${VERSION_TO_SLUG[srdVersion]}`,
    name: feat.name,
    type: 'feat',
    tier: 'srd',
    system: 'dnd5e',
    srdVersions: [srdVersion],
    category: normalizeCategory(feat.type),
    prerequisites: prereqProse,
    benefits,
    description: normalizeDescription(feat.desc),
    data: {},
  };
  if (prereqRaw.length > 0) out.prerequisitesRaw = prereqRaw;
  const grants = grantsForFeat(slug);
  if (grants) out.grants = grants;
  return out;
}

/**
 * Structured grants for feats that ask the player to pick something
 * at acquisition (skill / tool / language proficiencies, cantrips,
 * etc.). The SRD prose is too varied to parse generically; we
 * hardcode the known cases by slug. Returns undefined when the feat
 * grants nothing player-driven (the common case).
 *
 * v1: skills only. Linguist / Magic Initiate / Prodigy follow once
 * the wizard's pickers extend to languages / cantrips.
 */
function grantsForFeat(slug) {
  switch (slug) {
    case 'skilled':
      // Skilled (5.1 + 2.0): "Gain proficiency in any combination of
      // three skills or tools." We treat the picks as 3 skills for v1
      // — the tool variant requires the wizard's picker to know about
      // tool proficiencies, which it doesn't yet.
      return { skills: { count: 3, from: 'any' } };
    default:
      return undefined;
  }
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
