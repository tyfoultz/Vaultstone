// Transform a snapshot of Open5e v2's /creatures endpoint into the
// CreatureResult[] shape consumed by packages/content/src/srd/data/creatures.json.
//
// Per-edition entries: SRD 5.1 and SRD 2024 share many monster names but
// the 2024 stat blocks are full rewrites (different action economy, Bonus
// Action attacks, restructured saves/skills, new actions like "Multiattack"
// merged into single rows). Naive dedupe-by-name would erase the rewrites,
// so we emit one CreatureResult per (name, edition) with edition-suffixed
// keys.

const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', '..', '..', 'vendor', 'srd', 'open5e', 'creatures.json');
const OUT = path.join(__dirname, '..', '..', '..', 'packages', 'content', 'src', 'srd', 'data', 'creatures.json');

const DOC_TO_VERSION = {
  'srd-2014': 'SRD_5.1',
  'srd-2024': 'SRD_2.0',
};

const VERSION_TO_SLUG = {
  'SRD_5.1': '5-1',
  'SRD_2.0': '2-0',
};

const SKILL_KEYS = [
  'acrobatics', 'animal_handling', 'arcana', 'athletics', 'deception',
  'history', 'insight', 'intimidation', 'investigation', 'medicine',
  'nature', 'perception', 'performance', 'persuasion', 'religion',
  'sleight_of_hand', 'stealth', 'survival',
];

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
 * Open5e ships challenge_rating as a number — 0.125, 0.25, 0.5 for the
 * fractional CRs and integer values otherwise. Convert the standard fractions
 * to their canonical SRD string form ("1/8", "1/4", "1/2") for display; pass
 * integers through as numbers so existing `typeof === 'number'` checks still
 * work in the UI.
 */
function normalizeCR(cr) {
  if (cr == null) return '0';
  if (cr === 0.125) return '1/8';
  if (cr === 0.25) return '1/4';
  if (cr === 0.5) return '1/2';
  return cr;
}

/** Capitalize alignment string ("lawful evil" → "Lawful evil"). */
function titleAlignment(s) {
  if (!s) return '';
  return String(s).charAt(0).toUpperCase() + String(s).slice(1);
}

/** "Humanoid (goblinoid)" — start from { name } and append the subcategory if present. */
function buildCreatureType(creature) {
  const base = creature.type?.name ?? '';
  const sub = creature.subcategory ?? '';
  return sub ? `${base} (${sub.toLowerCase()})` : base;
}

/**
 * Build a human-readable speed string like "30 ft., fly 60 ft." from the
 * structured speed object. Open5e ships zero values for absent modes —
 * skip those.
 */
function buildSpeedString(speed) {
  if (!speed) return '';
  const parts = [];
  if (speed.walk) parts.push(`${speed.walk} ft.`);
  if (speed.fly) parts.push(`fly ${speed.fly} ft.${speed.hover ? ' (hover)' : ''}`);
  if (speed.swim) parts.push(`swim ${speed.swim} ft.`);
  if (speed.climb) parts.push(`climb ${speed.climb} ft.`);
  if (speed.burrow) parts.push(`burrow ${speed.burrow} ft.`);
  return parts.join(', ');
}

function buildSpeeds(speed) {
  if (!speed) return undefined;
  const out = {};
  if (speed.walk) out.walk = speed.walk;
  if (speed.fly) out.fly = speed.fly;
  if (speed.swim) out.swim = speed.swim;
  if (speed.climb) out.climb = speed.climb;
  if (speed.burrow) out.burrow = speed.burrow;
  if (speed.hover) out.hover = true;
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Open5e exposes both `saving_throws` (intended to be proficient-only) and
 * `saving_throws_all` (every ability). The "proficient" subset is unreliable
 * — Aboleth ships every ability under `saving_throws` even though it has no
 * proficient saves. So derive proficiency by comparing saving-throw bonus
 * vs. raw modifier — they differ iff the creature is proficient.
 */
function buildProficientSaves(creature) {
  const saves = creature.saving_throws_all ?? creature.saving_throws ?? {};
  const mods = creature.modifiers ?? {};
  const out = {};
  const map = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };
  for (const [long, short] of Object.entries(map)) {
    const save = saves[long];
    const mod = mods[long];
    if (typeof save === 'number' && typeof mod === 'number' && save !== mod) {
      out[short] = save;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Skills: `skill_bonuses` is the proficient-only subset (verified — Aboleth
 * shows just history/perception). Use it directly.
 */
function buildProficientSkills(creature) {
  const skills = creature.skill_bonuses ?? {};
  const out = {};
  for (const k of SKILL_KEYS) {
    if (typeof skills[k] === 'number') out[k] = skills[k];
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function buildAbilityScores(creature) {
  const a = creature.ability_scores;
  if (!a) return undefined;
  return {
    str: a.strength, dex: a.dexterity, con: a.constitution,
    int: a.intelligence, wis: a.wisdom, cha: a.charisma,
  };
}

function buildAbilityModifiers(creature) {
  const m = creature.modifiers;
  if (!m) return undefined;
  return {
    str: m.strength, dex: m.dexterity, con: m.constitution,
    int: m.intelligence, wis: m.wisdom, cha: m.charisma,
  };
}

function buildSenses(creature) {
  const out = {};
  if (creature.darkvision_range) out.darkvision = creature.darkvision_range;
  if (creature.blindsight_range) out.blindsight = creature.blindsight_range;
  if (creature.tremorsense_range) out.tremorsense = creature.tremorsense_range;
  if (creature.truesight_range) out.truesight = creature.truesight_range;
  if (typeof creature.passive_perception === 'number') out.passivePerception = creature.passive_perception;
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Resistances/immunities arrays may be empty; Open5e ships {name,key} objects. */
function arrayOrUndef(a) {
  if (!Array.isArray(a) || a.length === 0) return undefined;
  return a.map(x => (typeof x === 'string' ? x : x?.name)).filter(Boolean);
}

function buildTraits(creature) {
  const t = Array.isArray(creature.traits) ? creature.traits : [];
  if (t.length === 0) return undefined;
  return t.map((tr) => ({
    name: tr.name ?? '',
    description: normalizeDescription(tr.desc ?? ''),
  })).filter((tr) => tr.name && tr.description);
}

function buildActions(creature) {
  const a = Array.isArray(creature.actions) ? creature.actions : [];
  if (a.length === 0) return undefined;
  return a.slice()
    .sort((x, y) => (x.order_in_statblock ?? 99) - (y.order_in_statblock ?? 99))
    .map((act) => ({
      name: act.name ?? '',
      description: normalizeDescription(act.desc ?? ''),
      actionType: act.action_type ?? undefined,
    }))
    .filter((act) => act.name && act.description);
}

function buildEnvironments(creature) {
  const env = Array.isArray(creature.environments) ? creature.environments : [];
  if (env.length === 0) return undefined;
  return env.map((e) => e.name ?? e).filter(Boolean);
}

function transformOne(creature) {
  const docKey = creature.document?.key;
  const srdVersion = DOC_TO_VERSION[docKey];
  if (!srdVersion) return null;

  const slug = slugify(creature.name);
  const out = {
    key: `${slug}-srd-${VERSION_TO_SLUG[srdVersion]}`,
    name: creature.name,
    type: 'monster',
    tier: 'srd',
    system: 'dnd5e',
    srdVersions: [srdVersion],
    challengeRating: normalizeCR(creature.challenge_rating),
    size: creature.size?.name ?? '',
    creatureType: buildCreatureType(creature),
    alignment: titleAlignment(creature.alignment),
    ac: creature.armor_class ?? 0,
    hp: creature.hit_points ?? 0,
    speed: buildSpeedString(creature.speed),
    data: {},
  };

  if (typeof creature.experience_points === 'number') out.xp = creature.experience_points;
  if (typeof creature.proficiency_bonus === 'number') out.proficiencyBonus = creature.proficiency_bonus;
  if (creature.armor_detail) out.armorDetail = creature.armor_detail;
  if (creature.hit_dice) out.hitDice = creature.hit_dice;

  const speeds = buildSpeeds(creature.speed);
  if (speeds) out.speeds = speeds;

  const abilityScores = buildAbilityScores(creature);
  if (abilityScores) out.abilityScores = abilityScores;
  const abilityModifiers = buildAbilityModifiers(creature);
  if (abilityModifiers) out.abilityModifiers = abilityModifiers;

  const saves = buildProficientSaves(creature);
  if (saves) out.savingThrows = saves;
  const skills = buildProficientSkills(creature);
  if (skills) out.skills = skills;

  const senses = buildSenses(creature);
  if (senses) out.senses = senses;

  if (creature.languages?.as_string) out.languages = creature.languages.as_string;

  const ri = creature.resistances_and_immunities ?? {};
  const dr = arrayOrUndef(ri.damage_resistances);
  const di = arrayOrUndef(ri.damage_immunities);
  const dv = arrayOrUndef(ri.damage_vulnerabilities);
  const ci = arrayOrUndef(ri.condition_immunities);
  if (dr) out.damageResistances = dr;
  if (di) out.damageImmunities = di;
  if (dv) out.damageVulnerabilities = dv;
  if (ci) out.conditionImmunities = ci;

  const traits = buildTraits(creature);
  if (traits && traits.length > 0) out.traits = traits;
  const actions = buildActions(creature);
  if (actions && actions.length > 0) out.actions = actions;
  const environments = buildEnvironments(creature);
  if (environments && environments.length > 0) out.environments = environments;

  // Open5e creatures don't ship a single "description" paragraph the way
  // species/feats do — leave description empty; UI consumers can render
  // traits/actions instead.
  out.description = '';

  return out;
}

/**
 * Sort by CR ascending (then name) — Bestiary surfaces low-CR creatures
 * first which matches encounter-building muscle memory. Numeric and
 * fractional CRs both compare via parseFloat ("1/8" → 0.125, "1/2" → 0.5).
 */
function crToNumber(cr) {
  if (typeof cr === 'number') return cr;
  if (typeof cr !== 'string') return 0;
  const m = cr.match(/^(\d+)\/(\d+)$/);
  if (m) return parseInt(m[1], 10) / parseInt(m[2], 10);
  const n = parseFloat(cr);
  return Number.isFinite(n) ? n : 0;
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`Snapshot missing: ${SRC}`);
    console.error(`Run \`node scripts/import-srd/fetch-open5e.js creatures\` first.`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const out = raw.map(transformOne).filter(Boolean);

  out.sort((a, b) =>
    (crToNumber(a.challengeRating) - crToNumber(b.challengeRating)) ||
    a.name.localeCompare(b.name) ||
    a.srdVersions[0].localeCompare(b.srdVersions[0]),
  );

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`Wrote ${out.length} creatures → ${path.relative(process.cwd(), OUT)}`);

  const byVersion = out.reduce((acc, c) => {
    const k = c.srdVersions[0];
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  console.log('  By edition:', byVersion);
  console.log(`  Distinct names: ${new Set(out.map((c) => c.name)).size}`);

  const byCRBand = out.reduce((acc, c) => {
    const n = crToNumber(c.challengeRating);
    const band = n < 1 ? 'CR <1' : n <= 4 ? 'CR 1-4' : n <= 10 ? 'CR 5-10' : n <= 16 ? 'CR 11-16' : 'CR 17+';
    acc[band] = (acc[band] ?? 0) + 1;
    return acc;
  }, {});
  console.log('  By CR band:', byCRBand);
}

main();
