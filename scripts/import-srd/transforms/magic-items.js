// Transform a snapshot of Open5e v2's /magicitems endpoint into the
// ItemResult[] shape consumed by packages/content/src/srd/data/magic-items.json.
//
// Open5e's /magicitems/ endpoint is the variant-level magic-item catalog —
// it ships every "X of Y" variant as its own entry (e.g. "Belt of Giant
// Strength (Cloud)", "(Fire)", "(Frost)", "(Hill)" all separately) along
// with categorized magic items by rarity. ~2,500 SRD entries total.
//
// Open5e quirks:
//   1. The `document__key` filter is broken for /magicitems/ (returns
//      mixed sources). Real edition signal lives in each entry's `key`
//      prefix — `srd-2024_*` for 2024, `srd_*` for 5.1, `vom_*` for
//      Vault of Magic (third-party, NOT SRD — drop these). Same pattern
//      as /items/.
//   2. Snapshot has duplicates because we iterate both documents — dedupe
//      by `key` before transforming.
//
// Per-edition entries: emit one ItemResult per (item, edition) with
// edition-suffixed keys. The base `name` is identical between editions
// for most items but the `desc` text often diverges (2024 rewrote a lot
// of magic-item rules — Bag of Holding gained Astral Plane breathing
// limits, etc.).

const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', '..', '..', 'vendor', 'srd', 'open5e', 'magicitems.json');
const OUT = path.join(__dirname, '..', '..', '..', 'packages', 'content', 'src', 'srd', 'data', 'magic-items.json');

const VERSION_TO_SLUG = {
  'SRD_5.1': '5-1',
  'SRD_2.0': '2-0',
};

const RARITY_MAP = {
  'common': 'common',
  'uncommon': 'uncommon',
  'rare': 'rare',
  'very-rare': 'very-rare',
  'legendary': 'legendary',
  'artifact': 'artifact',
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

/** Same logic as transforms/items.js — convert decimal gp to natural denomination. */
function parseCost(costStr) {
  if (!costStr) return null;
  const n = Number(costStr);
  if (!Number.isFinite(n) || n === 0) return null;
  if (n < 0.1) return { amount: Math.round(n * 100), currency: 'cp' };
  if (n < 1) return { amount: Math.round(n * 10), currency: 'sp' };
  return { amount: Math.round(n * 100) / 100, currency: 'gp' };
}

function parseWeight(weightStr) {
  if (!weightStr) return undefined;
  const n = Number(weightStr);
  if (!Number.isFinite(n) || n === 0) return undefined;
  return n;
}

/** Detect edition from the /magicitems/ entry's key prefix. */
function editionFromKey(key) {
  if (!key) return null;
  if (key.startsWith('srd-2024_')) return 'SRD_2.0';
  if (key.startsWith('srd_')) return 'SRD_5.1';
  return null; // Drops vom_* (Vault of Magic — third-party, not SRD).
}

/**
 * Build human-readable properties[] for magic weapons. Same shape as the
 * mundane-item transform: damage line + Simple/Martial classification +
 * named properties.
 */
function magicWeaponProperties(item) {
  const w = item.weapon;
  if (!w) return [];
  const out = [];
  if (w.damage_dice) {
    const dt = w.damage_type?.name?.toLowerCase() ?? '';
    out.push(dt ? `Damage: ${w.damage_dice} ${dt}` : `Damage: ${w.damage_dice}`);
  }
  const propertyNames = (w.properties ?? []).map((p) => p.property?.name).filter(Boolean);
  const isRanged = propertyNames.some((n) =>
    ['Ammunition', 'Range', 'Thrown', 'Loading'].includes(n));
  if (w.is_simple || w.is_martial) {
    const cls = w.is_simple ? 'Simple' : 'Martial';
    out.push(`${cls} ${isRanged ? 'Ranged' : 'Melee'}`);
  }
  for (const p of w.properties ?? []) {
    const name = p.property?.name;
    const type = p.property?.type;
    if (!name || type === 'Mastery') continue;
    out.push(p.detail ? `${name} (${p.detail})` : name);
  }
  const masteries = (w.properties ?? [])
    .filter((p) => p.property?.type === 'Mastery')
    .map((p) => p.property.name);
  if (masteries.length > 0) out.push(`Mastery: ${masteries.join(', ')}`);
  return out;
}

function magicArmorProperties(item) {
  const a = item.armor;
  if (!a) return [];
  const out = [];
  if (a.ac_display) out.push(`AC ${a.ac_display}`);
  if (a.category) out.push(`${a.category.charAt(0).toUpperCase() + a.category.slice(1)} Armor`);
  if (a.strength_score_required) out.push(`Strength ${a.strength_score_required} required`);
  if (a.grants_stealth_disadvantage) out.push('Disadvantage on Stealth');
  return out;
}

function transformOne(item) {
  const srdVersion = editionFromKey(item.key);
  if (!srdVersion) return null;

  const slug = slugify(item.name);
  const out = {
    key: `${slug}-srd-${VERSION_TO_SLUG[srdVersion]}`,
    name: item.name,
    type: 'item',
    tier: 'srd',
    system: 'dnd5e',
    srdVersions: [srdVersion],
    category: 'magic-item',
    cost: parseCost(item.cost) ?? null,
  };

  const w = parseWeight(item.weight);
  if (w !== undefined) out.weight = w;

  const properties = item.weapon
    ? magicWeaponProperties(item)
    : item.armor
      ? magicArmorProperties(item)
      : [];
  if (properties.length > 0) out.properties = properties;

  if (item.rarity?.key && RARITY_MAP[item.rarity.key]) {
    out.rarity = RARITY_MAP[item.rarity.key];
  }

  if (item.requires_attunement) out.requiresAttunement = true;

  // attunement_detail is mostly null; when present it's free-form prereq
  // text ("by a creature of evil alignment", "by a Wizard"). Surface it
  // as a property line so the existing UI renders it without a schema
  // change.
  if (item.attunement_detail) {
    out.properties = [...(out.properties ?? []), `Attunement: ${item.attunement_detail}`];
  }

  out.description = normalizeDescription(item.desc);
  out.data = {
    // Track the underlying magic-item sub-category (wand / ring / potion
    // / scroll / wondrous-item / weapon / armor / shield / ammunition /
    // rod / staff) so future filters can narrow without parsing names.
    magicItemKind: item.category?.key ?? null,
  };
  return out;
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`Snapshot missing: ${SRC}`);
    console.error(`Run \`node scripts/import-srd/fetch-open5e.js magicitems\` first.`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));

  // Dedupe by upstream key before transforming — the fan-out across
  // both edition filters returns each entry twice.
  const seen = new Set();
  const dedupedRaw = [];
  for (const item of raw) {
    if (!item.key || seen.has(item.key)) continue;
    seen.add(item.key);
    dedupedRaw.push(item);
  }

  const out = dedupedRaw.map(transformOne).filter(Boolean);

  // Stable sort: by edition (5.1 first), then rarity (common → artifact),
  // then name. Matches the "browse by tier" mental model — uncommon stuff
  // surfaces before legendary.
  const RARITY_ORDER = { common: 0, uncommon: 1, rare: 2, 'very-rare': 3, legendary: 4, artifact: 5 };
  out.sort((a, b) =>
    a.srdVersions[0].localeCompare(b.srdVersions[0]) ||
    ((RARITY_ORDER[a.rarity ?? ''] ?? 9) - (RARITY_ORDER[b.rarity ?? ''] ?? 9)) ||
    a.name.localeCompare(b.name),
  );

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`Wrote ${out.length} magic items → ${path.relative(process.cwd(), OUT)}`);

  const byVersion = out.reduce((acc, i) => {
    acc[i.srdVersions[0]] = (acc[i.srdVersions[0]] ?? 0) + 1;
    return acc;
  }, {});
  console.log('  By edition:', byVersion);

  const byRarity = out.reduce((acc, i) => {
    acc[i.rarity ?? 'unknown'] = (acc[i.rarity ?? 'unknown'] ?? 0) + 1;
    return acc;
  }, {});
  console.log('  By rarity:', byRarity);

  const byKind = out.reduce((acc, i) => {
    const k = i.data?.magicItemKind ?? 'unknown';
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  console.log('  By magic-item kind:', byKind);

  const attune = out.filter((i) => i.requiresAttunement).length;
  console.log(`  Requires attunement: ${attune}`);
}

main();
