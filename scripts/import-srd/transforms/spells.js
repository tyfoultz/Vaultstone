// Transform a snapshot of Open5e v2's /spells endpoint (combined across the
// srd-2014 and srd-2024 documents) into the SpellResult[] shape consumed by
// packages/content/src/srd/data/spells.json.
//
// Source attribution: Open5e content is published under CC-BY 4.0; see
// http://open5e.com/legal. Source documents:
//   - srd-2014 → System Reference Document 5.1 (WotC, 2016)
//   - srd-2024 → System Reference Document 5.2 (WotC, October 2024)
//
// Edition handling: a spell may exist in both documents. We dedupe by
// case-insensitive name into a single SpellResult and union the
// srdVersions tags. When the descriptions differ across editions we
// prefer the 2024 text — most divergences are editorial cleanup; for
// the small set of spells with mechanical changes between editions
// this is acknowledged as a known limitation that a follow-up can
// address by storing per-edition descriptions structurally.

const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', '..', '..', 'vendor', 'srd', 'open5e', 'spells.json');
const OUT = path.join(__dirname, '..', '..', '..', 'packages', 'content', 'src', 'srd', 'data', 'spells.json');

const DOC_TO_VERSION = {
  'srd-2014': 'SRD_5.1',
  'srd-2024': 'SRD_2.0',
};

/** Open5e v2 normalizes casting times to lowercase tokens — map to our display form. */
function normalizeCastingTime(raw, reactionCondition) {
  if (!raw) return '';
  const t = String(raw).trim().toLowerCase();
  if (t === 'action') return 'Action';
  if (t === 'bonus_action' || t === 'bonus action') return 'Bonus Action';
  if (t === 'reaction') return 'Reaction';
  // Numeric durations come through verbatim from Open5e ("10 minutes",
  // "1 hour", "8 hours"); preserve casing unless first char is a letter.
  return /^[a-z]/.test(raw) ? raw.charAt(0).toUpperCase() + raw.slice(1) : raw;
}

/** Build a V/S/M components array from the v2 boolean flags. */
function parseComponents(spell) {
  const out = [];
  if (spell.verbal) out.push('V');
  if (spell.somatic) out.push('S');
  if (spell.material) out.push('M');
  return out;
}

/** Class names from the v2 nested objects ([{name, key}, …]). */
function parseClasses(spell) {
  if (!Array.isArray(spell.classes)) return [];
  return spell.classes.map((c) => c.name).filter(Boolean);
}

function buildDescription(spell) {
  const parts = [];
  if (spell.desc) parts.push(String(spell.desc).trim());
  if (spell.higher_level) parts.push(`At Higher Levels. ${String(spell.higher_level).trim()}`);
  return parts.join('\n\n');
}

function transformOne(spell) {
  const docKey = spell.document?.key;
  const srdVersion = DOC_TO_VERSION[docKey] ?? null;

  return {
    // Slug derived from name — keys must be stable across edition merges.
    // 'fireball' for both editions; 'fireball-2014' / 'fireball-2024' would
    // create duplicate UI rows.
    _docKey: docKey,
    _srdVersion: srdVersion,
    _publishedKey: spell.key, // keep the upstream namespaced key for traceability
    name: spell.name,
    type: 'spell',
    tier: 'srd',
    system: 'dnd5e',
    level: typeof spell.level === 'number' ? spell.level : 0,
    school: spell.school?.name || '',
    castingTime: normalizeCastingTime(spell.casting_time, spell.reaction_condition),
    range: spell.range_text || (spell.range != null ? `${spell.range} ${spell.range_unit ?? 'feet'}` : ''),
    components: parseComponents(spell),
    duration: spell.duration || '',
    concentration: !!spell.concentration,
    ritual: !!spell.ritual,
    classes: parseClasses(spell),
    description: buildDescription(spell),
  };
}

function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`Snapshot missing: ${SRC}`);
    console.error(`Run \`node scripts/import-srd/fetch-open5e.js spells\` first.`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const transformed = raw.map(transformOne);

  // Group by case-insensitive name. Each group becomes one SpellResult.
  /** @type {Map<string, ReturnType<typeof transformOne>[]>} */
  const groups = new Map();
  for (const t of transformed) {
    const k = t.name.toLowerCase();
    const list = groups.get(k) ?? [];
    list.push(t);
    groups.set(k, list);
  }

  // Merge each group: union srdVersions; prefer 2024 entry for description
  // and other text fields when present, else fall back to 5.1.
  const merged = [];
  let mergedCount = 0;
  for (const list of groups.values()) {
    const v2024 = list.find((e) => e._srdVersion === 'SRD_2.0');
    const v51 = list.find((e) => e._srdVersion === 'SRD_5.1');
    const canonical = v2024 ?? v51 ?? list[0];
    if (list.length > 1) mergedCount++;
    const versions = list
      .map((e) => e._srdVersion)
      .filter(Boolean)
      .sort(); // alphabetical: ['SRD_2.0', 'SRD_5.1']
    merged.push({
      key: slugify(canonical.name),
      name: canonical.name,
      type: canonical.type,
      tier: canonical.tier,
      system: canonical.system,
      srdVersions: [...new Set(versions)],
      level: canonical.level,
      school: canonical.school,
      castingTime: canonical.castingTime,
      range: canonical.range,
      components: canonical.components,
      duration: canonical.duration,
      concentration: canonical.concentration,
      ritual: canonical.ritual,
      classes: canonical.classes,
      description: canonical.description,
      data: {},
    });
  }

  // Stable sort: by level ascending, then name. Cleaner diffs.
  merged.sort((a, b) => (a.level - b.level) || a.name.localeCompare(b.name));

  fs.writeFileSync(OUT, JSON.stringify(merged, null, 2) + '\n');
  console.log(`Wrote ${merged.length} spells → ${path.relative(process.cwd(), OUT)}`);
  console.log(`  Source rows: ${raw.length}; merged duplicates: ${mergedCount}`);

  const byVersion = merged.reduce((acc, s) => {
    const k = s.srdVersions.join('+') || '(none)';
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  console.log('  Edition coverage:', byVersion);

  const byLevel = merged.reduce((acc, s) => {
    acc[s.level] = (acc[s.level] ?? 0) + 1;
    return acc;
  }, {});
  console.log('  By level:', byLevel);
}

main();
