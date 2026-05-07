// Transform a 5e.tools magic-variants payload (top-level `magicvariant`
// array) into expanded ItemResult magic items.
//
// Magic variants are *templates*, not standalone items. A `+1 Weapon`
// entry isn't an item — it's a rule that says "for every base weapon
// matching `requires`, produce a derived item with this prefix and
// these mechanics." Similar for `+1 Armor`, `Adamantine Weapon`,
// `Silvered Weapon`, etc.
//
// The expansion runs against a bundled XPHB+PHB base-item registry
// embedded below. This means a user can import `magicvariants.json`
// standalone and get a complete expansion — they don't need to also
// import items-base.json. Homebrew base weapons (user-added shapes)
// aren't covered in v1; that needs a DB join we don't yet have at
// transform time.
//
// Each variant produces N derived items, where N = base items matching
// `requires` minus those listed in `excludes`. For `+1 Weapon` (which
// requires `weapon: true`, excludes `net: true`), that's 36 derived
// rows. The full file expands to ~600 items per edition — most users
// will source-filter to XDMG (~250 rows) before import.
//
// Inheritance:
//   - `inherits.namePrefix` / `nameSuffix` build the display name
//     ("+1 " + "Greatsword" = "+1 Greatsword")
//   - Other inherits fields are spread onto the derived row, with
//     a few specifically merged (rarity/tier/entries)
//   - `{=bonusWeapon}` style template substitution in entries text
//   - `valueExpression` / `weightExpression` we surface verbatim for
//     v1 (e.g. "[[baseItem.value]] + 50000") rather than evaluating
//     — these are rare and the derived row's cost can stay null
//     without losing the rarity-band fallback the UI already shows

import type { ItemResult, ImportSource } from '@vaultstone/types';
import { entriesToText, slugify, sourceLongName, type RawEntry } from './entries';

// ── Source-side type sketches ─────────────────────────────────────────────

type RawVariant = {
  name: string;
  source?: string;
  page?: number;
  edition?: 'classic' | 'one' | string;
  /** Variant template type code — "GV|DMG" / "GV|XDMG" etc. */
  type?: string;
  /** Predicates the base item must satisfy (OR'd across array entries
   *  — any one match is enough). */
  requires?: RawPredicate[];
  /** Predicate of base items to exclude after `requires` matches. */
  excludes?: Record<string, unknown>;
  /** Marker indicating this variant produces ammunition. */
  ammo?: boolean;
  /** Fields applied to every derived item produced by this template. */
  inherits?: RawInherits;
  /** Variant-level entries (rare; usually inherits.entries is used). */
  entries?: RawEntry[];
  [key: string]: unknown;
};

type RawPredicate = {
  /** Type code prefix ("M", "R", "LA", "MA", "HA", "S", "A", "AF").
   *  Match strips the source suffix off the base item's type. */
  type?: string;
  /** Marker fields on the base item. Any truthy value matches. */
  weapon?: boolean;
  armor?: boolean;
  ammunition?: boolean;
  // 5e.tools also uses property markers like `sword: true` — we don't
  // surface those in v1; nothing in the SRD variants gates on them.
  [key: string]: unknown;
};

type RawInherits = {
  namePrefix?: string;
  nameSuffix?: string;
  source?: string;
  page?: number;
  rarity?: string;
  /** Magic-item tier — "minor" or "major". Informational; we don't
   *  surface it in the UI. */
  tier?: string;
  reqAttune?: boolean | string;
  bonusWeapon?: string;
  bonusWeaponAttack?: string;
  bonusWeaponDamage?: string;
  bonusAc?: string;
  /** "[[baseItem.value]] + 50000" — cost-as-expression. v1 ignores. */
  valueExpression?: string;
  weightExpression?: string;
  entries?: RawEntry[];
  /** SRD inclusion marker (5.1) — informational. */
  srd?: boolean;
  /** SRD inclusion marker (2024) — informational. */
  srd52?: boolean;
  basicRules?: boolean;
  basicRules2024?: boolean;
  [key: string]: unknown;
};

export type RawMagicVariantsFile = {
  magicvariant?: RawVariant[];
  /** Loot-table cross-references — not consumed by the transform. */
  linkedLootTables?: unknown;
  [key: string]: unknown;
};

// ── Public transform ──────────────────────────────────────────────────────

export type TransformOptions = {
  systemId: string;
  sourceLabel?: string;
};

/**
 * Expand a magic-variants payload into ItemResult[] derived rows. Each
 * variant template runs against the bundled base-item registry; the
 * cross-product is the output. Variants whose template produces zero
 * matches (e.g. requires reference an unsupported base-item shape)
 * are skipped silently rather than producing 0 rows.
 */
export function transformMagicVariants(
  raw: RawMagicVariantsFile,
  opts: TransformOptions,
): ItemResult[] {
  const { systemId } = opts;
  const variants = raw.magicvariant ?? [];
  const out: ItemResult[] = [];

  for (const variant of variants) {
    const matches = BASE_ITEMS.filter((b) => matchesAny(variant.requires, b))
                              .filter((b) => !matchesPredicate(variant.excludes, b));
    if (matches.length === 0) continue;
    for (const base of matches) {
      const derived = expandOne(variant, base, systemId);
      if (derived) out.push(derived);
    }
  }
  return out;
}

// ── Predicate matching ───────────────────────────────────────────────────

function matchesAny(predicates: RawPredicate[] | undefined, base: BaseItem): boolean {
  if (!Array.isArray(predicates) || predicates.length === 0) return false;
  return predicates.some((p) => matchesPredicate(p, base));
}

/**
 * True when the base item satisfies every key in the predicate.
 *   - `type: 'M'` — base.typeCode === 'M' (after stripping source)
 *   - `weapon: true` — base.weapon === true
 *   - `armor: true` — base.armor === true
 *   - `ammunition: true` — base.ammunition === true
 *   - other keys — base[key] === predicate[key] (exact equality)
 *
 * Returns false for an empty / undefined predicate; that's the right
 * default for `excludes` (no exclusion rule = no exclusion).
 */
function matchesPredicate(predicate: Record<string, unknown> | undefined, base: BaseItem): boolean {
  if (!predicate || typeof predicate !== 'object') return false;
  const entries = Object.entries(predicate);
  if (entries.length === 0) return false;
  for (const [key, value] of entries) {
    if (key === 'type') {
      // 5e.tools predicate types include the source suffix
      // ("A|XPHB", "LA|XPHB", "S|XPHB"); strip it so we can match
      // against our base-item registry's bare type codes.
      const wanted = typeof value === 'string' ? value.split('|')[0] : value;
      if (base.typeCode !== wanted) return false;
    } else if (key === 'weapon' || key === 'armor' || key === 'ammunition') {
      if (base[key] !== value) return false;
    } else {
      // Property markers — base items don't currently track them; this
      // branch falls through to "false" so a variant gating on e.g.
      // `sword: true` won't match. Acceptable for v1.
      if (!(key in base) || (base as Record<string, unknown>)[key] !== value) return false;
    }
  }
  return true;
}

// ── Expansion ────────────────────────────────────────────────────────────

/**
 * Produce one derived ItemResult from a (variant, base) pair.
 * Returns null when the variant lacks the fields needed to produce a
 * meaningful row (no inherits.namePrefix/nameSuffix, etc.).
 */
function expandOne(variant: RawVariant, base: BaseItem, systemId: string): ItemResult | null {
  const inherits = variant.inherits ?? {};
  const namePrefix = inherits.namePrefix ?? '';
  const nameSuffix = inherits.nameSuffix ?? '';
  if (!namePrefix && !nameSuffix && !variant.entries) return null;

  const name = `${namePrefix}${base.name}${nameSuffix}`.trim();

  // Source: prefer the variant's inherits.source (where the rules
  // text actually lives), fall back to variant.source. The display
  // import-source uses this for the "PHB"/"DMG"/"XDMG" badge.
  const source = inherits.source ?? variant.source ?? base.source;
  const importSource: ImportSource = {
    code: source,
    name: sourceLongName(source),
    page: inherits.page ?? variant.page,
  };

  // Build description from variant-level + inherited entries. Substitute
  // `{=bonusWeapon}`-style template placeholders.
  const allEntries: RawEntry[] = [];
  if (Array.isArray(variant.entries)) allEntries.push(...variant.entries);
  if (Array.isArray(inherits.entries)) allEntries.push(...inherits.entries);
  const description = substituteTemplates(
    entriesToText(allEntries).trim(),
    inherits,
  );

  // Magic-item kind: derive from the base item's role. Ammunition is a
  // distinct kind so the magic-items table can group it; otherwise
  // weapon/armor/shield carry over.
  const magicItemKind: string =
    base.ammunition ? 'ammunition' :
    base.typeCode === 'S' ? 'shield' :
    base.armor ? 'armor' :
    base.weapon ? 'weapon' :
    'wondrous-item';

  // Properties: pass through the base item's properties so derived
  // weapons keep their damage / range / mastery tags, and append any
  // bonus markers the variant carries.
  const properties: string[] = [...(base.properties ?? [])];
  if (inherits.bonusWeapon) properties.push(`Attack & damage: ${inherits.bonusWeapon}`);
  if (inherits.bonusWeaponAttack) properties.push(`Attack: ${inherits.bonusWeaponAttack}`);
  if (inherits.bonusWeaponDamage) properties.push(`Damage: ${inherits.bonusWeaponDamage}`);
  if (inherits.bonusAc) properties.push(`AC: ${inherits.bonusAc}`);

  const reqAttuneRaw = inherits.reqAttune;
  const requiresAttunement = !!reqAttuneRaw;
  if (typeof reqAttuneRaw === 'string' && reqAttuneRaw.trim().length > 0) {
    properties.push(`Attunement: ${reqAttuneRaw.trim()}`);
  }

  // Variant grouping metadata — lets the catalog UI collapse variants
  // under their base item. `baseItemRef` points back to the base
  // (e.g. Greatsword/XPHB) so the rendering layer can group all "+1
  // Greatsword", "+2 Greatsword", "Adamantine Greatsword", etc. rows
  // beneath one parent. `variantLabel` is the tab label inside the
  // grouped detail — `+1`, `Adamantine`, `Vorpal`, etc. — derived from
  // namePrefix/nameSuffix with the base name removed.
  const variantLabel = (namePrefix.trim() || nameSuffix.trim() || variant.name).trim();
  const baseItemRef = { name: base.name, source: base.source };

  return {
    key: `imported_${systemId}_item_${slugify(source)}_${slugify(name)}`,
    name,
    type: 'item',
    tier: 'imported',
    system: systemId,
    description,
    importSource,
    data: { magicItemKind, baseItemRef, variantLabel },
    category: 'magic-item',
    cost: null, // valueExpression not evaluated in v1; rarity-band fallback covers the UI
    weight: typeof base.weight === 'number' ? base.weight : undefined,
    properties: properties.length > 0 ? properties : undefined,
    requiresAttunement,
    rarity: normalizeRarity(inherits.rarity),
    srdVersions: [],
  };
}

/**
 * Substitute `{=fieldName}` placeholders in description text with the
 * matching field on `inherits`. Used by `bonusWeapon: '+1'` to fill
 * "{=bonusWeapon} bonus" → "+1 bonus" in the expanded prose. Unknown
 * placeholders pass through unchanged so they're visible if missing.
 */
function substituteTemplates(text: string, inherits: RawInherits): string {
  return text.replace(/\{=(\w+)\}/g, (whole, key) => {
    const value = (inherits as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : whole;
  });
}

function normalizeRarity(raw: string | undefined): ItemResult['rarity'] {
  const r = (raw ?? '').toLowerCase().trim();
  switch (r) {
    case 'common':    return 'common';
    case 'uncommon':  return 'uncommon';
    case 'rare':      return 'rare';
    case 'very rare':
    case 'very-rare': return 'very-rare';
    case 'legendary': return 'legendary';
    case 'artifact':  return 'artifact';
    default:          return undefined;
  }
}

// ── Bundled base-item registry ──────────────────────────────────────────
//
// The 2024 PHB equipment chapter (XPHB, source). This is the canonical
// list variants expand against — anything outside it (homebrew weapons,
// non-SRD base items) won't get magic variants in v1 unless the user
// imports the corresponding `items-base.json` first.
//
// `properties` are pre-baked human-readable strings matching the format
// produced by the imported items transform's `collectProperties`, so a
// derived "+1 Greatsword" reads identically to a hand-imported weapon.

type BaseItem = {
  name: string;
  source: string;
  /** Stripped 5e.tools type code — "M"/"R"/"LA"/"MA"/"HA"/"S"/"A"/"AF". */
  typeCode: string;
  weapon?: boolean;
  armor?: boolean;
  ammunition?: boolean;
  /** "simple" | "martial" — used by variants like Dragon Slayer that
   *  gate on category rather than specific weapon types. */
  weaponCategory?: 'simple' | 'martial';
  /** Flags 5e.tools sets for excludes filtering — currently just net. */
  net?: boolean;
  weight?: number;
  properties?: string[];
};

/** XPHB weapons (50 entries — full simple + martial set). Properties
 *  are minimal damage/category lines; full property expansion lives
 *  in the imported items transform. We omit damage values here to
 *  keep the registry maintainable; derived rows surface the magic
 *  bonus and the user reads damage off the original base item. */
const XPHB_WEAPONS: BaseItem[] = [
  // Simple melee
  { name: 'Club',            source: 'XPHB', typeCode: 'M', weapon: true, weaponCategory: 'simple',  weight: 2 },
  { name: 'Dagger',          source: 'XPHB', typeCode: 'M', weapon: true, weaponCategory: 'simple',  weight: 1 },
  { name: 'Greatclub',       source: 'XPHB', typeCode: 'M', weapon: true, weaponCategory: 'simple',  weight: 10 },
  { name: 'Handaxe',         source: 'XPHB', typeCode: 'M', weapon: true, weaponCategory: 'simple',  weight: 2 },
  { name: 'Javelin',         source: 'XPHB', typeCode: 'M', weapon: true, weaponCategory: 'simple',  weight: 2 },
  { name: 'Light Hammer',    source: 'XPHB', typeCode: 'M', weapon: true, weaponCategory: 'simple',  weight: 2 },
  { name: 'Mace',            source: 'XPHB', typeCode: 'M', weapon: true, weaponCategory: 'simple',  weight: 4 },
  { name: 'Quarterstaff',    source: 'XPHB', typeCode: 'M', weapon: true, weaponCategory: 'simple',  weight: 4 },
  { name: 'Sickle',          source: 'XPHB', typeCode: 'M', weapon: true, weaponCategory: 'simple',  weight: 2 },
  { name: 'Spear',           source: 'XPHB', typeCode: 'M', weapon: true, weaponCategory: 'simple',  weight: 3 },
  // Simple ranged
  { name: 'Dart',            source: 'XPHB', typeCode: 'R', weapon: true, weaponCategory: 'simple',  weight: 0.25 },
  { name: 'Light Crossbow',  source: 'XPHB', typeCode: 'R', weapon: true, weaponCategory: 'simple',  weight: 5 },
  { name: 'Shortbow',        source: 'XPHB', typeCode: 'R', weapon: true, weaponCategory: 'simple',  weight: 2 },
  { name: 'Sling',           source: 'XPHB', typeCode: 'R', weapon: true, weaponCategory: 'simple',  weight: 0 },
  // Martial melee
  { name: 'Battleaxe',       source: 'XPHB', typeCode: 'M', weapon: true, weaponCategory: 'martial', weight: 4 },
  { name: 'Flail',           source: 'XPHB', typeCode: 'M', weapon: true, weaponCategory: 'martial', weight: 2 },
  { name: 'Glaive',          source: 'XPHB', typeCode: 'M', weapon: true, weaponCategory: 'martial', weight: 6 },
  { name: 'Greataxe',        source: 'XPHB', typeCode: 'M', weapon: true, weaponCategory: 'martial', weight: 7 },
  { name: 'Greatsword',      source: 'XPHB', typeCode: 'M', weapon: true, weaponCategory: 'martial', weight: 6 },
  { name: 'Halberd',         source: 'XPHB', typeCode: 'M', weapon: true, weaponCategory: 'martial', weight: 6 },
  { name: 'Lance',           source: 'XPHB', typeCode: 'M', weapon: true, weaponCategory: 'martial', weight: 6 },
  { name: 'Longsword',       source: 'XPHB', typeCode: 'M', weapon: true, weaponCategory: 'martial', weight: 3 },
  { name: 'Maul',            source: 'XPHB', typeCode: 'M', weapon: true, weaponCategory: 'martial', weight: 10 },
  { name: 'Morningstar',     source: 'XPHB', typeCode: 'M', weapon: true, weaponCategory: 'martial', weight: 4 },
  { name: 'Net',             source: 'XPHB', typeCode: 'M', weapon: true, weaponCategory: 'martial', weight: 3, net: true },
  { name: 'Pike',            source: 'XPHB', typeCode: 'M', weapon: true, weaponCategory: 'martial', weight: 18 },
  { name: 'Rapier',          source: 'XPHB', typeCode: 'M', weapon: true, weaponCategory: 'martial', weight: 2 },
  { name: 'Scimitar',        source: 'XPHB', typeCode: 'M', weapon: true, weaponCategory: 'martial', weight: 3 },
  { name: 'Shortsword',      source: 'XPHB', typeCode: 'M', weapon: true, weaponCategory: 'martial', weight: 2 },
  { name: 'Trident',         source: 'XPHB', typeCode: 'M', weapon: true, weaponCategory: 'martial', weight: 4 },
  { name: 'War Pick',        source: 'XPHB', typeCode: 'M', weapon: true, weaponCategory: 'martial', weight: 2 },
  { name: 'Warhammer',       source: 'XPHB', typeCode: 'M', weapon: true, weaponCategory: 'martial', weight: 2 },
  { name: 'Whip',            source: 'XPHB', typeCode: 'M', weapon: true, weaponCategory: 'martial', weight: 3 },
  // Martial ranged
  { name: 'Blowgun',         source: 'XPHB', typeCode: 'R', weapon: true, weaponCategory: 'martial', weight: 1 },
  { name: 'Hand Crossbow',   source: 'XPHB', typeCode: 'R', weapon: true, weaponCategory: 'martial', weight: 3 },
  { name: 'Heavy Crossbow',  source: 'XPHB', typeCode: 'R', weapon: true, weaponCategory: 'martial', weight: 18 },
  { name: 'Longbow',         source: 'XPHB', typeCode: 'R', weapon: true, weaponCategory: 'martial', weight: 2 },
  { name: 'Musket',          source: 'XPHB', typeCode: 'R', weapon: true, weaponCategory: 'martial', weight: 10 },
  { name: 'Pistol',          source: 'XPHB', typeCode: 'R', weapon: true, weaponCategory: 'martial', weight: 3 },
];

/** XPHB armor (light/medium/heavy + shield). */
const XPHB_ARMOR: BaseItem[] = [
  { name: 'Padded Armor',          source: 'XPHB', typeCode: 'LA', armor: true, weight: 8 },
  { name: 'Leather Armor',         source: 'XPHB', typeCode: 'LA', armor: true, weight: 10 },
  { name: 'Studded Leather Armor', source: 'XPHB', typeCode: 'LA', armor: true, weight: 13 },
  { name: 'Hide Armor',            source: 'XPHB', typeCode: 'MA', armor: true, weight: 12 },
  { name: 'Chain Shirt',           source: 'XPHB', typeCode: 'MA', armor: true, weight: 20 },
  { name: 'Scale Mail',            source: 'XPHB', typeCode: 'MA', armor: true, weight: 45 },
  { name: 'Breastplate',           source: 'XPHB', typeCode: 'MA', armor: true, weight: 20 },
  { name: 'Half Plate Armor',      source: 'XPHB', typeCode: 'MA', armor: true, weight: 40 },
  { name: 'Ring Mail',             source: 'XPHB', typeCode: 'HA', armor: true, weight: 40 },
  { name: 'Chain Mail',            source: 'XPHB', typeCode: 'HA', armor: true, weight: 55 },
  { name: 'Splint Armor',          source: 'XPHB', typeCode: 'HA', armor: true, weight: 60 },
  { name: 'Plate Armor',           source: 'XPHB', typeCode: 'HA', armor: true, weight: 65 },
  // Shield is matched via `type: 'S'`, not via the `armor: true`
  // marker — the 2014 DMG `+1 Armor` template uses `armor: true` to
  // mean "wearable body armor" (not shields). Shields have their own
  // `+1 Shield` template. Tagging the Shield entry as `armor: false`
  // here keeps it out of the body-armor variant expansion while still
  // letting type-based predicates (`+1 Shield`, `+2 Shield`, etc.)
  // pick it up.
  { name: 'Shield',                source: 'XPHB', typeCode: 'S',                weight: 6 },
];

/** XPHB ammunition — the per-shot entries, not the bundles. The
 *  bundled "Arrows (20)" / "Bolts (20)" entries don't get magic
 *  variants applied (a +1 quiver isn't a thing), so we use the
 *  individual-item names.
 *
 *  Important: ammunition entries deliberately omit `weapon: true`.
 *  5e.tools' source items.json sets `weapon: true` on ammo, but in
 *  variant predicates `{weapon: true}` is meant to match
 *  attackable weapons specifically — `+1 Weapon` wouldn't apply
 *  to "+1 Arrow" because ammo has its own `+1 Ammunition` template.
 *  Treating ammo as a weapon for the predicate match makes the same
 *  base item match both templates and produce a duplicate entry_key
 *  (both expanding to "+1 Arrow").
 */
const XPHB_AMMO: BaseItem[] = [
  { name: 'Arrow',          source: 'XPHB', typeCode: 'A',  ammunition: true, weight: 0 },
  { name: 'Bolt',           source: 'XPHB', typeCode: 'A',  ammunition: true, weight: 0 },
  { name: 'Firearm Bullet', source: 'XPHB', typeCode: 'AF', ammunition: true, weight: 0 },
  { name: 'Needle',         source: 'XPHB', typeCode: 'A',  ammunition: true, weight: 0 },
  { name: 'Sling Bullet',   source: 'XPHB', typeCode: 'A',  ammunition: true, weight: 0 },
];

const BASE_ITEMS: BaseItem[] = [...XPHB_WEAPONS, ...XPHB_ARMOR, ...XPHB_AMMO];
