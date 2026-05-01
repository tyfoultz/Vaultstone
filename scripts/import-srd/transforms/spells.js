// Transform a snapshot of Open5e's /v1/spells endpoint into the SpellResult[]
// shape consumed by packages/content/src/srd/data/spells.json.
//
// Source attribution: each entry is from the wotc-srd document
// (Open5e tag), originally from Wizards of the Coast's 5e SRD 5.1
// release under the OGL/CC-BY 4.0. See http://open5e.com/legal.

const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', '..', '..', 'vendor', 'srd', 'open5e', 'spells.json');
const OUT = path.join(__dirname, '..', '..', '..', 'packages', 'content', 'src', 'srd', 'data', 'spells.json');

/**
 * "1 action" → "Action"; "1 reaction, which you take when…" → "Reaction"
 * (the reaction trigger lives in the spell's description text, not the
 * casting-time field). "10 minutes", "8 hours", etc. preserve their form.
 */
function normalizeCastingTime(s) {
  if (!s) return '';
  const t = String(s).trim().toLowerCase();
  if (t === '1 action'       || t.startsWith('1 action,')      || t.startsWith('1 action ')) return 'Action';
  if (t === '1 bonus action' || t.startsWith('1 bonus action,') || t.startsWith('1 bonus action ')) return 'Bonus Action';
  if (t === '1 reaction'     || t.startsWith('1 reaction,')    || t.startsWith('1 reaction ')) return 'Reaction';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "V, S, M" → ["V", "S", "M"]. Empty/null → []. */
function parseComponents(raw) {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter((c) => c.length > 0);
}

/** Normalize class list. Prefer Open5e's `spell_lists` (array of slugs). */
function parseClasses(spell) {
  if (Array.isArray(spell.spell_lists) && spell.spell_lists.length > 0) {
    return spell.spell_lists.map((s) => s.charAt(0).toUpperCase() + s.slice(1));
  }
  if (spell.dnd_class) {
    return String(spell.dnd_class)
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
  }
  return [];
}

/** Concatenate the spell description plus the higher-level rider as paragraphs. */
function buildDescription(spell) {
  const parts = [];
  if (spell.desc) parts.push(String(spell.desc).trim());
  if (spell.higher_level) parts.push(`At Higher Levels. ${String(spell.higher_level).trim()}`);
  return parts.join('\n\n');
}

function transformOne(spell) {
  const isRitual =
    spell.ritual === 'yes' ||
    spell.ritual === true ||
    spell.can_be_cast_as_ritual === true;
  const isConcentration =
    spell.concentration === 'yes' ||
    spell.concentration === true ||
    spell.requires_concentration === true;

  return {
    key: spell.slug,
    name: spell.name,
    type: 'spell',
    tier: 'srd',
    system: 'dnd5e',
    srdVersions: ['SRD_5.1'],
    level: typeof spell.level_int === 'number' ? spell.level_int : 0,
    school: spell.school || '',
    castingTime: normalizeCastingTime(spell.casting_time),
    range: spell.range || '',
    components: parseComponents(spell.components),
    duration: spell.duration || '',
    concentration: !!isConcentration,
    ritual: !!isRitual,
    classes: parseClasses(spell),
    description: buildDescription(spell),
    data: {},
  };
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`Snapshot missing: ${SRC}`);
    console.error(`Run \`node scripts/import-srd/fetch-open5e.js spells\` first.`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const transformed = raw.map(transformOne);
  // Stable sort: by level ascending, then name. Lets diffs read cleanly.
  transformed.sort((a, b) => (a.level - b.level) || a.name.localeCompare(b.name));

  fs.writeFileSync(OUT, JSON.stringify(transformed, null, 2) + '\n');
  console.log(`Wrote ${transformed.length} spells → ${path.relative(process.cwd(), OUT)}`);

  // Sanity counts
  const byLevel = transformed.reduce((acc, s) => {
    acc[s.level] = (acc[s.level] ?? 0) + 1;
    return acc;
  }, {});
  console.log('  By level:', byLevel);
}

main();
