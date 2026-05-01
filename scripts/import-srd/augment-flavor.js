// Augment items.json with the richer SRD 5.1 flavor text from BTMorton's
// dnd-5e-srd snapshot.
//
// Why a separate step: Open5e's /items/ endpoint strips per-item descriptive
// prose for many entries — especially the SRD 2024 dataset, which often
// reduces a paragraph to a one-liner ("A breastplate."). The same physical
// items have full SRD 5.1 flavor text in BTMorton's repo, which we vendored
// at vendor/srd/btmorton/{equipment,magic-items}.json.
//
// Strategy:
//   1. Walk BTMorton's nested tree; extract a Map<normalizedName, description>
//      from two patterns:
//        (a) `content[]` entries shaped `***Name.*** flavor text…` (armor,
//            adventuring gear, magic-item-ish gear inside Equipment)
//        (b) magic-item leaves keyed by name with content[] = ['*type,
//            rarity*', ...flavor paragraphs] — join the non-italic-header
//            paragraphs.
//   2. For each entry in items.json with a thin/empty description, look up
//      by normalized name and patch in the BTMorton text.
//   3. Apply the same flavor to both the SRD 5.1 and SRD 2.0 entries — the
//      2024 SRD dropped most flavor prose, but the underlying physical
//      object is the same, so the 5.1 description is correct for both.
//
// Idempotent: re-running augments only entries that look thin/empty.

const fs = require('node:fs');
const path = require('node:path');

const EQUIPMENT_SRC = path.join(__dirname, '..', '..', 'vendor', 'srd', 'btmorton', 'equipment.json');
const MAGIC_SRC = path.join(__dirname, '..', '..', 'vendor', 'srd', 'btmorton', 'magic-items.json');
const ITEMS = path.join(__dirname, '..', '..', 'packages', 'content', 'src', 'srd', 'data', 'items.json');

// "Half Plate Armor" → "half plate"; "Acid (vial)" → "acid"; "Plate" → "plate".
function normalizeName(name) {
  return String(name)
    .toLowerCase()
    // strip parenthetical qualifiers: "Acid (vial)" → "acid"
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    // strip trailing "armor" (Plate Armor / Hide Armor / Half Plate Armor)
    .replace(/\barmor\b\s*$/i, '')
    // collapse non-alphanumeric to single space
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Markdown cleanup: strip stray HTML entities and the leading ***Name.*** label
// (the caller has already used the label to identify the entry).
function cleanFlavor(s) {
  return String(s)
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    // strip italic emphasis markers (single * pairs) but keep bold (** pairs)?
    // For now leave markdown intact — UI strips/renders as-is.
    .trim();
}

// Match `***Name.*** rest of paragraph`
const ENTRY_RE = /^\*\*\*([^*]+?)\.\*\*\*\s+(.*)$/s;

/**
 * Walk a BTMorton subtree and accumulate `name → description` for every
 * `***Name.*** prose` entry found in any `content[]` string array. We
 * concatenate the entry's first paragraph only (the BTMorton format puts
 * each item on its own line); follow-up paragraphs in the same content
 * array belong to other items or to general section prose.
 */
function harvestFromContentEntries(tree) {
  const map = new Map();
  function walk(node) {
    if (!node) return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (typeof node !== 'object') return;
    const content = node.content;
    if (Array.isArray(content)) {
      for (const line of content) {
        if (typeof line !== 'string') continue;
        const m = line.match(ENTRY_RE);
        if (!m) continue;
        const name = m[1].trim();
        const desc = cleanFlavor(m[2]);
        const key = normalizeName(name);
        if (key && desc && !map.has(key)) {
          map.set(key, desc);
        }
      }
    }
    for (const k of Object.keys(node)) {
      if (k === 'content' || k === 'table') continue;
      walk(node[k]);
    }
  }
  walk(tree);
  return map;
}

/**
 * Walk magic-items.json: each leaf is a key whose value has a `content`
 * array. The first element is typically `*type, rarity*` italic header
 * — we drop that and join the remaining paragraphs.
 */
function harvestMagicItems(tree) {
  const map = new Map();
  const root = tree['Magic Items'];
  if (!root || typeof root !== 'object') return map;
  for (const [name, value] of Object.entries(root)) {
    if (name === 'content') continue;
    if (!value || typeof value !== 'object') continue;
    const content = value.content;
    if (!Array.isArray(content) || content.length === 0) continue;
    // Drop the leading italic-only header line (e.g. `*Wondrous item, uncommon*`).
    const paras = content.filter((s, i) => {
      if (typeof s !== 'string') return false;
      if (i === 0 && /^\*[^*]+\*$/.test(s.trim())) return false;
      return true;
    });
    if (paras.length === 0) continue;
    const desc = cleanFlavor(paras.join('\n\n'));
    const key = normalizeName(name);
    if (key && desc && !map.has(key)) {
      map.set(key, desc);
    }
  }
  return map;
}

/**
 * Heuristic: an existing description is "thin" if it's empty, ≤80 chars,
 * or matches the "A <name>." stub pattern Open5e emits for SRD 2024 entries.
 */
function isThin(desc, name) {
  if (!desc) return true;
  const trimmed = desc.trim();
  if (trimmed.length <= 80) return true;
  // Open5e 2024 stubs: "A <lowercase name>." — match irrespective of casing.
  const stub = new RegExp(`^a\\s+${name.replace(/[^a-z0-9 ]/gi, '').replace(/\s+/g, '\\s+')}\\.?$`, 'i');
  if (stub.test(trimmed)) return true;
  return false;
}

function main() {
  for (const p of [EQUIPMENT_SRC, MAGIC_SRC, ITEMS]) {
    if (!fs.existsSync(p)) {
      console.error(`Missing input: ${p}`);
      process.exit(1);
    }
  }

  const equipment = JSON.parse(fs.readFileSync(EQUIPMENT_SRC, 'utf8'));
  const magic = JSON.parse(fs.readFileSync(MAGIC_SRC, 'utf8'));
  const items = JSON.parse(fs.readFileSync(ITEMS, 'utf8'));

  const equipMap = harvestFromContentEntries(equipment);
  const magicMap = harvestMagicItems(magic);
  // Also harvest ***Name.*** entries from inside magic-items.json — some
  // sub-categories (e.g. Bag of Tricks colour table) bury extra prose there.
  const magicInline = harvestFromContentEntries(magic);

  // Merge: prefer the leaf-keyed magic-item descriptions (richer/multi-paragraph)
  // over the equipment-style inline entries.
  const flavor = new Map();
  for (const [k, v] of equipMap) flavor.set(k, v);
  for (const [k, v] of magicInline) if (!flavor.has(k)) flavor.set(k, v);
  for (const [k, v] of magicMap) flavor.set(k, v); // overrides

  console.log(`Harvested ${flavor.size} flavor entries from BTMorton`);

  let patched = 0;
  let skippedAlreadyRich = 0;
  let unmatched = 0;
  const unmatchedNames = new Set();

  for (const item of items) {
    const key = normalizeName(item.name);
    const flavorDesc = flavor.get(key);
    if (!flavorDesc) {
      if (isThin(item.description, item.name)) {
        unmatched++;
        unmatchedNames.add(`${item.srdVersions[0]} | ${item.name}`);
      }
      continue;
    }
    if (isThin(item.description, item.name)) {
      item.description = flavorDesc;
      patched++;
    } else {
      skippedAlreadyRich++;
    }
  }

  fs.writeFileSync(ITEMS, JSON.stringify(items, null, 2) + '\n');
  console.log(`Patched ${patched} item descriptions`);
  console.log(`Skipped (already rich): ${skippedAlreadyRich}`);
  console.log(`Thin items with no BTMorton match: ${unmatched}`);
  if (unmatched > 0 && unmatched <= 60) {
    console.log('  Unmatched (sample):');
    [...unmatchedNames].slice(0, 60).forEach((n) => console.log('   ', n));
  }
}

main();
