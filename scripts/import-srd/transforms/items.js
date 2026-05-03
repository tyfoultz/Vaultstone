// Transform a snapshot of Open5e v2's /items endpoint into the ItemResult[]
// shape consumed by packages/content/src/srd/data/items.json.
//
// Open5e v2 unifies all equipment into /items/. Each entry has a category
// ('weapon', 'armor', 'shield', 'adventuring-gear', 'potion', 'scroll',
// 'wondrous-item', 'rod', 'wand', 'staff', 'ring', 'tools',
// 'spellcasting-focus', 'ammunition', 'equipment-pack', 'poison',
// 'mount', 'land-vehicle', 'waterborne-vehicle', 'trade-good') plus
// optional weapon{} and armor{} sub-objects with mechanical detail.
//
// Per-edition entries (same as conditions/feats/backgrounds/species):
// item names diverge wildly between Open5e's 5.1 and 2024 datasets
// ("Crossbow, hand" vs "Hand Crossbow"; "Half plate" vs "Half Plate
// Armor"; "Holy Water (flask)" vs "Holy Water"). Naive dedupe-by-name
// can't reconcile these, so we emit one ItemResult per (item, edition)
// pair with edition-suffixed keys.
//
// Open5e quirk: the /items/ endpoint's `document__key` filter is
// effectively ignored — both `srd-2014` and `srd-2024` queries return
// the same 440 entries. The actual edition signal lives in each entry's
// `key` prefix:
//   - keys starting with `srd-2024_*` are the 2024 (5.2) entries
//   - keys starting with `srd_*` (no edition suffix) are the 5.1 entries
// We detect edition from the prefix and dedupe the snapshot by `key`
// before transforming, so the doubled fetch (we still iterate both docs
// for consistency with other endpoints) collapses to ~440 unique items.

const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', '..', '..', 'vendor', 'srd', 'open5e', 'items.json');
const OUT = path.join(__dirname, '..', '..', '..', 'packages', 'content', 'src', 'srd', 'data', 'items.json');

const DOC_TO_VERSION = {
  'srd-2014': 'SRD_5.1',
  'srd-2024': 'SRD_2.0',
};

const VERSION_TO_SLUG = {
  'SRD_5.1': '5-1',
  'SRD_2.0': '2-0',
};

/**
 * Map Open5e category keys to our ItemResult.category enum. Categories
 * not in this map (tools, mounts, vehicles, trade goods) are filtered out:
 *   - tools live in their own ToolResult catalog
 *   - mounts/vehicles/trade goods are out of the current scope (we don't
 *     have a category for them)
 */
const CATEGORY_MAP = {
  'weapon': 'weapon',
  'armor': 'armor',
  'shield': 'shield',
  'adventuring-gear': 'adventuring-gear',
  'ammunition': 'adventuring-gear',
  'equipment-pack': 'adventuring-gear',
  'poison': 'adventuring-gear',
  'spellcasting-focus': 'crafting-equipment',
  // Magic-item categories (wondrous-item, potion, scroll, rod, wand, staff,
  // ring) are intentionally NOT mapped here. The dedicated /magicitems/
  // import (transforms/magic-items.js) owns the variant-level catalog —
  // letting them flow through items.js produced 13 mis-categorized stub
  // entries ("Rod", "Wand", "Signet Ring") that collided with real magic
  // items. Filter them out here so items.json stays mundane-equipment
  // only.
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

/** "25.00" → 25; "0.50" → 0.5. Returns null for missing or 0. */
function parseCost(costStr) {
  if (!costStr) return null;
  const n = Number(costStr);
  if (!Number.isFinite(n) || n === 0) return null;
  // Convert to most natural denomination so the UI doesn't show fractional gp.
  // Open5e's cost field is gold pieces with decimal precision.
  if (n < 0.1) {
    // fractional gp under 0.1 → copper pieces (1 cp = 0.01 gp)
    return { amount: Math.round(n * 100), currency: 'cp' };
  }
  if (n < 1) {
    // 0.1 to 0.99 gp → silver pieces (1 sp = 0.1 gp)
    return { amount: Math.round(n * 10), currency: 'sp' };
  }
  return { amount: Math.round(n * 100) / 100, currency: 'gp' };
}

/** "1.000" → 1, "55.000" → 55. Null for missing/zero. */
function parseWeight(weightStr) {
  if (!weightStr) return undefined;
  const n = Number(weightStr);
  if (!Number.isFinite(n) || n === 0) return undefined;
  return n;
}

/** Build the human-readable properties[] string array for a weapon. */
function weaponProperties(item) {
  const w = item.weapon;
  if (!w) return [];
  const out = [];
  // Damage
  if (w.damage_dice) {
    const dt = w.damage_type?.name?.toLowerCase() ?? '';
    out.push(dt ? `Damage: ${w.damage_dice} ${dt}` : `Damage: ${w.damage_dice}`);
  }
  // Simple/Martial classification + Melee/Ranged inferred from properties
  const propertyNames = (w.properties ?? []).map((p) => p.property?.name).filter(Boolean);
  const isRanged = propertyNames.some((n) =>
    ['Ammunition', 'Range', 'Thrown', 'Loading'].includes(n));
  const cls = w.is_simple ? 'Simple' : w.is_martial ? 'Martial' : 'Improvised';
  out.push(`${cls} ${isRanged ? 'Ranged' : 'Melee'}`);
  // Other properties — skip Mastery here; we surface those separately so
  // they read like "Mastery: Sap" rather than just "Sap".
  for (const p of w.properties ?? []) {
    const name = p.property?.name;
    const type = p.property?.type;
    if (!name || type === 'Mastery') continue;
    out.push(p.detail ? `${name} (${p.detail})` : name);
  }
  // Masteries together at the end.
  const masteries = (w.properties ?? [])
    .filter((p) => p.property?.type === 'Mastery')
    .map((p) => p.property.name);
  if (masteries.length > 0) out.push(`Mastery: ${masteries.join(', ')}`);
  return out;
}

/** Build the human-readable properties[] string array for an armor item. */
function armorProperties(item) {
  const a = item.armor;
  if (!a) return [];
  const out = [];
  if (a.ac_display) out.push(`AC ${a.ac_display}`);
  if (a.category) out.push(`${a.category.charAt(0).toUpperCase() + a.category.slice(1)} Armor`);
  if (a.strength_score_required) out.push(`Strength ${a.strength_score_required} required`);
  if (a.grants_stealth_disadvantage) out.push('Disadvantage on Stealth');
  return out;
}

/**
 * Resolve edition from the entry's `key` prefix. Open5e's document filter
 * is broken for /items/ (returns identical results for both editions),
 * so we go off the prefix instead:
 *   - 'srd-2024_*' → SRD_2.0
 *   - 'srd_*'      → SRD_5.1
 */
function editionFromKey(key) {
  if (!key) return null;
  if (key.startsWith('srd-2024_')) return 'SRD_2.0';
  if (key.startsWith('srd_')) return 'SRD_5.1';
  return null;
}

function transformOne(item) {
  const srdVersion = editionFromKey(item.key);
  if (!srdVersion) return null;

  const sourceCategory = item.category?.key;
  const ourCategory = CATEGORY_MAP[sourceCategory];
  if (!ourCategory) return null;

  let properties = [];
  if (ourCategory === 'weapon') properties = weaponProperties(item);
  else if (ourCategory === 'armor' || ourCategory === 'shield') properties = armorProperties(item);

  const slug = slugify(item.name);
  const out = {
    key: `${slug}-srd-${VERSION_TO_SLUG[srdVersion]}`,
    name: item.name,
    type: 'item',
    tier: 'srd',
    system: 'dnd5e',
    srdVersions: [srdVersion],
    category: ourCategory,
    cost: parseCost(item.cost) ?? null,
  };
  const w = parseWeight(item.weight);
  if (w !== undefined) out.weight = w;
  if (properties.length > 0) out.properties = properties;
  out.description = normalizeDescription(item.desc);
  out.data = {};
  return out;
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`Snapshot missing: ${SRC}`);
    console.error(`Run \`node scripts/import-srd/fetch-open5e.js items\` first.`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));

  // Dedupe by upstream `key` first — fetch-open5e iterates both
  // documents and Open5e's document filter is broken for /items/, so the
  // snapshot has each item twice with identical key.
  const seen = new Set();
  const dedupedRaw = [];
  for (const item of raw) {
    if (!item.key || seen.has(item.key)) continue;
    seen.add(item.key);
    dedupedRaw.push(item);
  }

  const out = dedupedRaw.map(transformOne).filter(Boolean);

  // Stable sort: by category, then edition (5.1 before 2.0), then name.
  const categoryOrder = {
    weapon: 0, armor: 1, shield: 2, 'adventuring-gear': 3,
    'crafting-equipment': 4, 'magic-item': 5,
  };
  out.sort((a, b) =>
    ((categoryOrder[a.category] ?? 9) - (categoryOrder[b.category] ?? 9)) ||
    a.srdVersions[0].localeCompare(b.srdVersions[0]) ||
    a.name.localeCompare(b.name),
  );

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`Wrote ${out.length} items → ${path.relative(process.cwd(), OUT)}`);

  const byCategory = out.reduce((acc, i) => {
    acc[i.category] = (acc[i.category] ?? 0) + 1;
    return acc;
  }, {});
  console.log('  By category:', byCategory);
  const byVersion = out.reduce((acc, i) => {
    const k = i.srdVersions[0];
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  console.log('  By edition:', byVersion);
}

main();
