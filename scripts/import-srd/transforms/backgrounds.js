// Transform a snapshot of Open5e v2's /backgrounds endpoint into the
// BackgroundResult[] shape consumed by packages/content/src/srd/data/backgrounds.json.
//
// SRD 5.1 ships only Acolyte as a background; SRD 5.2 ships Acolyte,
// Criminal, Sage, Soldier (4). The hand-curated seed had 14 entries
// covering all PHB backgrounds (Charlatan, Entertainer, Folk Hero,
// etc.) which were never SRD-licensed — those drop here in favor of
// strict SRD compliance.
//
// Per-edition entries (same as conditions/feats): Acolyte appears in
// both 5.1 and 2024 with diverging mechanics, so we emit it twice with
// suffixed keys.

const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', '..', '..', 'vendor', 'srd', 'open5e', 'backgrounds.json');
const OUT = path.join(__dirname, '..', '..', '..', 'packages', 'content', 'src', 'srd', 'data', 'backgrounds.json');

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

/** Parse "Insight and Religion" or "Insight, Religion" → ["Insight", "Religion"]. */
function parseList(s) {
  if (!s) return [];
  return String(s)
    // Split on commas (with optional "and") or " and " (case-insensitive).
    .split(/,\s*(?:and\s+)?|\s+and\s+/i)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Look up a benefit by type from the Open5e benefits[] array. */
function getBenefit(benefits, type) {
  if (!Array.isArray(benefits)) return null;
  return benefits.find((b) => b.type === type) ?? null;
}

function transformOne(bg) {
  const docKey = bg.document?.key;
  const srdVersion = DOC_TO_VERSION[docKey];
  if (!srdVersion) return null;

  const slug = slugify(bg.name);
  const skillProf = getBenefit(bg.benefits, 'skill_proficiency');
  const toolProf = getBenefit(bg.benefits, 'tool_proficiency');
  const featBenefit = getBenefit(bg.benefits, 'feat');
  const abilityScores = getBenefit(bg.benefits, 'ability_score');
  const equipment = getBenefit(bg.benefits, 'equipment');
  const language = getBenefit(bg.benefits, 'language');

  const skills = skillProf ? parseList(skillProf.desc) : [];
  const abilityOptions = abilityScores
    ? parseList(abilityScores.desc).map((a) => a.toLowerCase())
    : [];

  // Description holds flavor text only; starting equipment moved to its
  // own field so the detail UI can render it as a discrete block alongside
  // skills, tool, and origin feat. 2024 entries have no flavor prose
  // upstream, so this is often empty for 2.0 backgrounds — that's fine.
  const description = normalizeDescription(bg.desc);
  // Phase 1 of the structured starting-equipment work: emit the array
  // empty, and surface the legacy freeform paragraph under
  // `startingEquipmentText` so the sheet still shows it. The Open5e
  // backgrounds desc is natural language — parsing it into structured
  // entries with item keys is Phase 2 work.
  const startingEquipmentText = equipment?.desc?.trim() || null;

  return {
    key: `${slug}-srd-${VERSION_TO_SLUG[srdVersion]}`,
    name: bg.name,
    type: 'background',
    tier: 'srd',
    system: 'dnd5e',
    srdVersions: [srdVersion],
    skillProficiencies: skills,
    toolProficiency: toolProf?.desc?.trim() || null,
    // Open5e v2 backgrounds don't expose a structured language count;
    // 5.1 Acolyte historically grants 2 languages but the upstream
    // benefit (if present) is free text. Default 0 unless a language
    // benefit is parseable as a number.
    languages: language && /^\d+/.test(language.desc?.trim() ?? '')
      ? parseInt(language.desc.trim(), 10)
      : 0,
    abilityScoreOptions: abilityOptions,
    originFeat: featBenefit?.desc?.trim() || '',
    startingEquipment: [],
    startingEquipmentText,
    description,
    data: {},
  };
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`Snapshot missing: ${SRC}`);
    console.error(`Run \`node scripts/import-srd/fetch-open5e.js backgrounds\` first.`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const out = raw.map(transformOne).filter(Boolean);

  // Stable sort: by name, then by edition (5.1 before 2.0).
  out.sort((a, b) =>
    a.name.localeCompare(b.name) ||
    a.srdVersions[0].localeCompare(b.srdVersions[0]),
  );

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`Wrote ${out.length} backgrounds → ${path.relative(process.cwd(), OUT)}`);

  const byVersion = out.reduce((acc, b) => {
    const k = b.srdVersions[0];
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  console.log('  By edition:', byVersion);
  console.log('  Names:', [...new Set(out.map((b) => b.name))].join(', '));
}

main();
