// Transform Open5e v2's /items snapshot into the ToolResult[] shape
// consumed by packages/content/src/srd/data/tools.json.
//
// Tools live in /items/ alongside weapons, armor, and gear — the
// `category.key === 'tools'` filter pulls them out. Open5e folds the
// 2024 "Ability / Utilize / Craft" rich text into a single `desc`
// string ("Ability: Intelligence. Utilize: Identify a substance (DC
// 15), or start a fire (DC 15). Craft: Acid, Alchemist's Fire, …"),
// so we parse those three fields back out via regex.
//
// Per-edition entries (same posture as items.js): tool names diverge
// between Open5e's 5.1 and 2024 datasets ("Smith's Tools" vs "Smith's
// Tools (15 GP)" — the 2024 set bakes the price into the display
// name, then we strip it). We emit one ToolResult per (tool, edition)
// pair with edition-suffixed keys so the system page can show the
// edition switcher cleanly.
//
// Edition signal is the same as items.js — `key` prefix:
//   - srd-2024_* → SRD_2.0
//   - srd_*      → SRD_5.1
// (We dedupe by upstream `key` since /items/'s document filter is
// broken and returns the same entry twice when both editions are
// fetched.)

const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', '..', '..', 'vendor', 'srd', 'open5e', 'items.json');
const OUT = path.join(__dirname, '..', '..', '..', 'packages', 'content', 'src', 'srd', 'data', 'tools.json');

const VERSION_TO_SLUG = {
  'SRD_5.1': '5-1',
  'SRD_2.0': '2-0',
};

/**
 * Categorize a tool by name pattern, looking at both the 2024
 * "Family, Variant" prefix scheme and the 5.1 bare-name convention.
 *
 * 2024 SRD names tools with explicit family prefixes:
 *   - "Musical Instrument, Bagpipes"  → musical-instrument
 *   - "Gaming Set, Dragonchess"       → gaming-set
 *
 * 5.1 SRD ships bare names — `Bagpipes`, `Lyre`, etc. — so we fall
 * through to a hardcoded musical-instrument set.
 *
 * Known kits (Thieves', Disguise, Herbalism, Healer's, Poisoner's,
 * Climber's, Forgery, Navigator's) have their own mechanical role and
 * don't fit the artisan-supplies bucket, so we explicitly route them
 * to 'other' instead of letting the trailing-noun heuristic mis-tag.
 *
 * Anything ending in Supplies/Tools/Utensils/Implements that isn't on
 * the kit list lands in 'artisan' — covers Smith's Tools, Brewer's
 * Supplies, Cook's Utensils, Calligrapher's Supplies, etc.
 */
function categorize(name) {
  if (/^Musical Instrument,/i.test(name)) return 'musical-instrument';
  if (/^Gaming Set,/i.test(name)) return 'gaming-set';
  if (BARE_MUSICAL_INSTRUMENTS.has(name)) return 'musical-instrument';
  if (BARE_GAMING_SETS.has(name)) return 'gaming-set';
  if (KNOWN_KITS.has(name)) return 'other';
  if (/(Supplies|Tools|Utensils|Implements)$/.test(name)) return 'artisan';
  return 'other';
}

/** 5.1 SRD bare instrument names — 2024 prefixes them with
 *  "Musical Instrument," so the prefix check above handles those. */
const BARE_MUSICAL_INSTRUMENTS = new Set([
  'Bagpipes', 'Drum', 'Dulcimer', 'Flute', 'Horn',
  'Lute', 'Lyre', 'Pan Flute', 'Shawm', 'Viol',
]);

/** 5.1 SRD ships gaming sets as "Dice Set", "Playing Card Set", etc.;
 *  2024 prefixes them with "Gaming Set,". The prefix check covers 2024;
 *  this set covers the bare 5.1 forms. */
const BARE_GAMING_SETS = new Set([
  'Dice Set', 'Playing Card Set', 'Dragonchess Set', 'Three-Dragon Ante Set',
]);

/** Tools that share the "Tools" / "Kit" suffix with artisan supplies
 *  but mechanically belong in a different bucket (Thieves' Tools is a
 *  Dexterity-based proficiency, not crafting). Routed to 'other'. */
const KNOWN_KITS = new Set([
  "Thieves' Tools",
  "Poisoner's Kit",
  "Navigator's Tools",
  "Disguise Kit",
  "Forgery Kit",
  "Herbalism Kit",
  "Healer's Kit",
  "Climber's Kit",
]);

/** Open5e bakes the cost into 2024 tool names: "Smith's Tools (15 GP)".
 *  Strip the trailing "(N GP)" so the display name matches the
 *  underlying tool. */
function stripPriceTag(name) {
  return name.replace(/\s*\([0-9,]+\s*[A-Z]+\)\s*$/, '').trim();
}

/** Strip the 2024 family prefix off a comma-prefixed tool name so the
 *  display reads "Bagpipes" not "Musical Instrument, Bagpipes". The
 *  category field carries the family information already, so the
 *  prefix is pure duplication on the display name. */
function stripFamilyPrefix(name) {
  return name
    .replace(/^Musical Instrument,\s*/i, '')
    .replace(/^Gaming Set,\s*/i, '');
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Parse Open5e's "50.00" cost string (always GP) into our
 *  {amount, currency} shape. 0 / missing → null. */
function parseCost(costStr) {
  if (!costStr) return null;
  const n = Number(costStr);
  if (!Number.isFinite(n) || n === 0) return null;
  // Costs below 1gp aren't expected for tools; round-trip via gp.
  if (n < 1) return { amount: Math.round(n * 10), currency: 'sp' };
  return { amount: Math.round(n), currency: 'gp' };
}

function parseWeight(weightStr) {
  if (!weightStr) return undefined;
  const n = Number(weightStr);
  if (!Number.isFinite(n) || n === 0) return undefined;
  return n;
}

function editionFromKey(key) {
  if (!key) return null;
  if (key.startsWith('srd-2024_')) return 'SRD_2.0';
  if (key.startsWith('srd_')) return 'SRD_5.1';
  return null;
}

/**
 * Pull `Ability:`, `Utilize:`, and `Craft:` out of the 2024 desc string.
 * Returns { ability, utilize[], craft[], remaining } where `remaining`
 * is the desc with those segments stripped (used for the human-readable
 * description). 5.1 entries have prose-style descriptions without these
 * markers — they pass through unchanged with all three fields undefined.
 *
 * Format from Open5e:
 *   "Ability: Intelligence. Utilize: Identify a substance (DC 15), or
 *    start a fire (DC 15). Craft: Acid, Alchemist's Fire, …"
 *
 * Strategy: split on the marker words, then walk the resulting tokens
 * pairwise. Simple and survives parens/periods inside values.
 */
function parseRichDesc(desc) {
  if (!desc) return { ability: undefined, utilize: undefined, craft: undefined, remaining: '' };

  // Split on the markers as a non-capturing pattern, but use a capture
  // group so the marker words come back interleaved in the result.
  const parts = desc.split(/(Ability|Utilize|Craft):\s*/);
  // parts[0] = leading prose (or "" when desc starts with a marker)
  // parts[1] = first marker word, parts[2] = its value, …
  const leading = parts[0]?.trim() ?? '';

  let ability;
  let utilize;
  let craft;
  for (let i = 1; i < parts.length; i += 2) {
    const key = parts[i];
    let value = (parts[i + 1] ?? '').trim();
    // Strip the trailing "." that separates this segment from the next.
    value = value.replace(/[.\s]+$/, '').trim();
    if (key === 'Ability') ability = value;
    else if (key === 'Utilize') utilize = splitOptions(value);
    else if (key === 'Craft') craft = splitOptions(value);
  }

  return { ability, utilize, craft, remaining: leading };
}

/**
 * Split a Utilize/Craft value on top-level "or" / "," boundaries while
 * leaving parenthesized DC bits intact. "Identify a substance (DC 15),
 * or start a fire (DC 15)" → ["Identify a substance (DC 15)", "start a
 * fire (DC 15)"]. Trims each entry and drops empties.
 */
function splitOptions(s) {
  // First split on the explicit ", or " / " or " connector when present
  // (utilize options usually use it). Fall back to bare commas for
  // craft lists ("Acid, Alchemist's Fire, …"). Both are safe because
  // option text doesn't itself contain commas at the top level.
  const out = [];
  for (const chunk of s.split(/,\s*or\s+|\s+or\s+|,\s*/)) {
    const trimmed = chunk.trim().replace(/[.,]+$/, '');
    if (trimmed) out.push(trimmed);
  }
  return out;
}

function transformOne(item) {
  const srdVersion = editionFromKey(item.key);
  if (!srdVersion) return null;

  // Strip the price tag first so categorize() sees the bare name, then
  // strip the family prefix for the display form. The slug is built
  // from the display form so 5.1 "Bagpipes" and 2024 "Musical
  // Instrument, Bagpipes" both produce keys keyed off "bagpipes".
  const priceless = stripPriceTag(item.name);
  const category = categorize(priceless);
  const cleanedName = stripFamilyPrefix(priceless);
  const slug = slugify(cleanedName);
  const { ability, utilize, craft, remaining } = parseRichDesc(item.desc);

  const out = {
    key: `${slug}-srd-${VERSION_TO_SLUG[srdVersion]}`,
    name: cleanedName,
    type: 'tool',
    tier: 'srd',
    system: 'dnd5e',
    srdVersions: [srdVersion],
    category,
    cost: parseCost(item.cost) ?? null,
  };
  const w = parseWeight(item.weight);
  if (w !== undefined) out.weight = w;
  if (remaining) out.description = remaining;
  if (ability) out.ability = ability;
  if (utilize && utilize.length > 0) out.utilize = utilize;
  if (craft && craft.length > 0) out.craft = craft;
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

  // Filter to tools and dedupe by upstream key.
  const seen = new Set();
  const tools = [];
  for (const item of raw) {
    if ((item.category?.key ?? item.category) !== 'tools') continue;
    if (!item.key || seen.has(item.key)) continue;
    seen.add(item.key);
    tools.push(item);
  }

  const out = tools.map(transformOne).filter(Boolean);

  // Stable sort: by category, then edition (5.1 before 2.0), then name.
  const categoryOrder = { artisan: 0, 'gaming-set': 1, 'musical-instrument': 2, other: 3 };
  out.sort((a, b) =>
    ((categoryOrder[a.category] ?? 9) - (categoryOrder[b.category] ?? 9)) ||
    a.srdVersions[0].localeCompare(b.srdVersions[0]) ||
    a.name.localeCompare(b.name),
  );

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`Wrote ${out.length} tools → ${path.relative(process.cwd(), OUT)}`);

  const byCategory = out.reduce((acc, t) => {
    acc[t.category] = (acc[t.category] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`  By category:`, byCategory);

  const byEdition = out.reduce((acc, t) => {
    acc[t.srdVersions[0]] = (acc[t.srdVersions[0]] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`  By edition:`, byEdition);

  const richCount = out.filter((t) => t.ability).length;
  console.log(`  With Ability/Utilize/Craft fields: ${richCount}`);
}

main();
