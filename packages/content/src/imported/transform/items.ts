// Transform a 5e.tools items payload into our ItemResult shape.
//
// 5e.tools splits item data across two arrays in the same JSON shape:
//   - `baseitem` (items-base.json) — mundane gear, weapons, armor
//   - `item`     (items.json)      — magic items + variants
//
// Both arrays carry the same field schema (with magic-only fields like
// `rarity` and `reqAttune` only on the variant-side entries). This
// transform reads whichever arrays the picked file has and emits one
// ItemResult per entry.
//
// Categorization is type-code-driven. The 5e.tools `type` field is a
// pipe-delimited code ("M|XPHB", "HA|XPHB"); we look at the first
// segment:
//   M / R / A           → weapon (ammunition is grouped with weapons,
//                         matching the SRD bundle)
//   LA / MA / HA        → armor
//   S                   → shield (mundane); magic shields stay shield-
//                         categoried with magicItemKind: 'shield'
//   anything else       → magic-item if any magic marker is set
//                         (rarity ≠ 'none', reqAttune set, wondrous, or
//                         bonus* fields present), otherwise
//                         adventuring-gear.
//
// `_copy` variant entries are skipped in v1 — resolving them needs a
// base-item lookup; the import doesn't crash, but those entries don't
// import.

import type { ItemResult, ImportSource } from '@vaultstone/types';
import { entriesToText, slugify, sourceLongName, srdVersionsForSource, type RawEntry } from './entries';

// ── Source-side type sketches ─────────────────────────────────────────────

type RawItem = {
  name: string;
  source: string;
  page?: number;
  /** Pipe-delimited type code, e.g. "M|XPHB" or "HA". */
  type?: string;
  /** Copper-piece price; absent for items without a listed cost. */
  value?: number;
  weight?: number;
  /** "none" | "uncommon" | "rare" | "very rare" | "legendary" | "artifact" | "common" | "unknown". */
  rarity?: string;
  /** Boolean true OR a "by a wizard"-style detail string. */
  reqAttune?: boolean | string;
  /** Pipe-delimited weapon property codes ("V|XPHB", "L|XPHB"). Some
   *  entries (e.g. Lance's "2H" with "unless mounted") ship as an
   *  `{ uid, note }` object instead of a bare string. */
  property?: Array<string | { uid: string; note?: string }>;
  /** 2024 Weapon Mastery property — pipe-delimited like properties.
   *  Examples: "Graze|XPHB", "Sap|XPHB", "Vex|XPHB", "Cleave|XPHB".
   *  Same string-or-object union as `property`. */
  mastery?: Array<string | { uid: string; note?: string }>;
  weaponCategory?: 'simple' | 'martial';
  /** Primary damage die (e.g. "1d8"). */
  dmg1?: string;
  /** Versatile two-handed damage die. */
  dmg2?: string;
  /** Damage type code (S=slashing, P=piercing, B=bludgeoning, etc.). */
  dmgType?: string;
  /** Disadvantage on Stealth checks while worn (armor). */
  stealth?: boolean;
  /** Strength minimum prerequisite (armor). Stored as a string by the source. */
  strength?: string;
  /** Armor base AC (without Dex contribution). */
  ac?: number;
  /** Wondrous-item marker — true for non-typed magic items. */
  wondrous?: boolean;
  /** Weapon flag — set on weapon-shaped items including magic ones. */
  weapon?: boolean;
  /** Armor flag — set on armor-shaped items including magic ones. */
  armor?: boolean;
  /** Set on items 5e.tools tags as poisons. Drives gearKind detection. */
  poison?: boolean;
  /** Magic-item bonus markers — presence implies magic-item categorization. */
  bonusWeapon?: string;
  bonusWeaponAttack?: string;
  bonusWeaponDamage?: string;
  bonusSpellAttack?: string;
  bonusSpellSaveDc?: string;
  bonusAc?: string;
  /** Free-form prose block. */
  entries?: RawEntry[];
  /** Variant-of pointer — we skip these for v1. */
  _copy?: { name?: string; source?: string };
  /**
   * Structured pack contents on equipment packs (Burglar's Pack,
   * Explorer's Pack, etc.). Entries are either a slug-with-source
   * string ("backpack|xphb", quantity 1 implicit) or an object with
   * an explicit quantity. We resolve the slug to a display name on
   * import so the consumer doesn't need a cross-file lookup.
   */
  packContents?: Array<string | { item: string; quantity?: number }>;
  [key: string]: unknown;
};

export type RawItemsFile = {
  /** Mundane base items (items-base.json). */
  baseitem?: RawItem[];
  /** Magic items + variants (items.json). */
  item?: RawItem[];
  [key: string]: unknown;
};

// ── Public transform ──────────────────────────────────────────────────────

export type TransformOptions = {
  systemId: string;
  sourceLabel?: string;
};

/**
 * Transform a parsed 5e.tools items payload into ItemResult[]. Reads
 * both `baseitem` and `item` arrays when present (a single file rarely
 * contains both, but the transform doesn't care). `_copy` variant
 * entries are filtered out.
 */
export function transformItems(
  raw: RawItemsFile,
  opts: TransformOptions,
): ItemResult[] {
  const { systemId } = opts;
  const all = [...(raw.baseitem ?? []), ...(raw.item ?? [])];

  return all
    .filter((it) => !it._copy)
    .map((it) => {
      const importSource: ImportSource = {
        code: it.source,
        name: sourceLongName(it.source),
        page: it.page,
      };
      const isMagic = detectMagic(it);
      const category = categorize(it, isMagic);
      const properties = collectProperties(it);
      const data: Record<string, unknown> = {};
      if (category === 'magic-item') {
        data.magicItemKind = magicItemKind(it);
      }
      // For adventuring gear, derive a sub-bucket discriminator so the
      // UI can facet (Ammunition / Equipment Packs / Poisons / etc.)
      // without those becoming peer top-level categories. 5e.tools
      // doesn't carry a clean source-side category for these — we
      // detect from `type` codes plus name patterns.
      if (category === 'adventuring-gear') {
        const kind = detectGearKind(it);
        if (kind) data.gearKind = kind;
      }

      const packContents = parsePackContents(it.packContents);

      return {
        key: `imported_${systemId}_item_${slugify(it.source)}_${slugify(it.name)}`,
        name: it.name,
        type: 'item',
        tier: 'imported',
        system: systemId,
        description: entriesToText(it.entries ?? []).trim(),
        importSource,
        data,
        category,
        cost: formatCost(it.value),
        weight: typeof it.weight === 'number' ? it.weight : undefined,
        properties: properties.length > 0 ? properties : undefined,
        requiresAttunement: !!it.reqAttune,
        rarity: normalizeRarity(it.rarity, isMagic),
        packContents: packContents.length > 0 ? packContents : undefined,
        srdVersions: srdVersionsForSource(it.source),
      };
    });
}

/**
 * Resolve 5e.tools `packContents` references into our flat
 * `{ name, quantity }[]` shape. Each upstream entry is either:
 *   - a string `"backpack|xphb"` → quantity 1, slug part is the name
 *   - an object `{ item: "candle|xphb", quantity: 10 }`
 *
 * We strip the source suffix and titlecase the slug to get a display
 * name. The character builder wires actual ItemResult lookup later;
 * for now the user sees the resolved name verbatim, which matches how
 * the upstream prose reads ("10 Candles, Crowbar, …").
 */
function parsePackContents(
  raw: Array<string | { item: string; quantity?: number }> | undefined,
): Array<{ name: string; quantity: number }> {
  if (!raw || !Array.isArray(raw)) return [];
  const out: Array<{ name: string; quantity: number }> = [];
  for (const entry of raw) {
    let ref: string;
    let quantity = 1;
    if (typeof entry === 'string') {
      ref = entry;
    } else if (entry && typeof entry === 'object' && typeof entry.item === 'string') {
      ref = entry.item;
      if (typeof entry.quantity === 'number') quantity = entry.quantity;
    } else {
      continue;
    }
    // Slug shape: "name|source". The source suffix is informational —
    // we only need the name for display.
    const namePart = ref.split('|')[0]?.trim();
    if (!namePart) continue;
    out.push({ name: titleCase(namePart), quantity });
  }
  return out;
}

/** Titlecase a 5e.tools slug ("ball bearings" → "Ball Bearings"). */
function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

// ── Internals ─────────────────────────────────────────────────────────────

/**
 * Strip the source suffix off a pipe-delimited code. "M|XPHB" → "M";
 * undefined or empty → null.
 */
function stripSource(code: string | undefined): string | null {
  if (!code) return null;
  const head = code.split('|')[0]?.trim().toUpperCase();
  return head || null;
}

/**
 * Normalize a 5e.tools pipe-delimited reference to `{uid, note}`. The
 * source ships these as either bare strings ("V|XPHB") or objects
 * (`{uid: "2H|XPHB", note: "unless mounted"}`) — Lance's two-handed
 * property uses the object form to carry the contextual qualifier,
 * and we surface that note in the rendered property line.
 */
function readPipeRef(entry: string | { uid: string; note?: string }): { uid: string; note?: string } {
  if (typeof entry === 'string') return { uid: entry };
  return { uid: entry.uid, note: entry.note };
}

/**
 * Magic-item detection. Returns true if any unambiguous magic marker
 * is set. We treat rarity 'none' / 'unknown' / undefined as non-magic
 * because mundane items use 'none'.
 */
function detectMagic(it: RawItem): boolean {
  if (it.wondrous === true) return true;
  if (it.reqAttune !== undefined && it.reqAttune !== false) return true;
  const r = (it.rarity ?? '').toLowerCase();
  if (r && r !== 'none' && r !== 'unknown') return true;
  if (
    it.bonusWeapon || it.bonusWeaponAttack || it.bonusWeaponDamage ||
    it.bonusSpellAttack || it.bonusSpellSaveDc || it.bonusAc
  ) return true;
  return false;
}

/**
 * Map a 5e.tools item to one of our ItemResult categories. Magic items
 * always classify as 'magic-item' regardless of weapon/armor shape — the
 * weapon-vs-armor distinction is preserved on `data.magicItemKind` so
 * the catalog UI's magic-item sub-tabs still group correctly.
 */
function categorize(it: RawItem, isMagic: boolean): ItemResult['category'] {
  if (isMagic) return 'magic-item';
  const t = stripSource(it.type);
  if (t === 'M' || t === 'R' || t === 'A') return 'weapon';
  if (t === 'LA' || t === 'MA' || t === 'HA') return 'armor';
  if (t === 'S') return 'shield';
  // Weapon/armor flag fallback (some entries lack the type code).
  if (it.weapon === true) return 'weapon';
  if (it.armor === true) return 'armor';
  return 'adventuring-gear';
}

/**
 * Detect a gear sub-bucket for an adventuring-gear item. Returns one of
 * 'ammunition' | 'equipment-pack' | 'poison' | 'spellcasting-focus', or
 * null if the item is generic gear. Used by the UI to facet within the
 * Adventuring Gear sub-tab without introducing peer top-level categories.
 *
 * Detection is multi-signal because 5e.tools doesn't carry a clean
 * source-side category for these:
 *   - 5e.tools type codes: A = ammunition, EXP = explosives (not a
 *     bucket we surface), `$P` shows up on poisons, FCS on foci.
 *   - Name patterns: "* Pack" for equipment packs (Burglar's Pack,
 *     Explorer's Pack, etc.), known poison names for the XDMG named
 *     poisons whose type code doesn't classify them.
 *   - Item flags: `poison: true` on entries that have it.
 */
function detectGearKind(it: RawItem): string | null {
  const t = stripSource(it.type);
  if (t === 'A' || t === 'AF') return 'ammunition';
  if (t === '$P' || it.poison === true) return 'poison';
  if (t === 'FCS' || t === 'INS') return 'spellcasting-focus';
  if (t === 'P' && (it as { tier?: string }).tier !== 'minor' && !it.rarity) {
    // 5e.tools reuses 'P' for both poisons and potions — disambiguate
    // by rarity (potions have it, poisons don't).
    return 'poison';
  }
  // Name-based fallbacks for entries 5e.tools doesn't tag:
  //   - Equipment packs always end in " Pack" (Explorer's Pack, etc.)
  //   - XDMG named poisons follow a small known list
  if (/\bPack$/.test(it.name)) return 'equipment-pack';
  if (KNOWN_POISON_NAMES.has(it.name)) return 'poison';
  return null;
}

/** Hard-coded list of poison names that 5e.tools doesn't tag with a
 *  poison type code. Drawn from the 2024 DMG's named-poisons table.
 *  Adding to this list won't break anything; missing entries just fall
 *  through to generic adventuring-gear. */
const KNOWN_POISON_NAMES = new Set<string>([
  'Basic Poison',
  "Assassin's Blood",
  'Burnt Othur Fumes',
  'Carrion Crawler Mucus',
  'Drow Poison',
  'Essence of Ether',
  'Malice',
  'Midnight Tears',
  'Oil of Taggit',
  'Pale Tincture',
  'Purple Worm Poison',
  'Serpent Venom',
  'Torpor',
  'Truth Serum',
  'Wyvern Poison',
]);

/**
 * Pick the magicItemKind discriminator for a magic item. Mirrors the
 * SRD bundle's vocabulary: weapon, armor, shield, ring, wand, rod,
 * potion, scroll, staff, ammunition, wondrous-item.
 */
function magicItemKind(it: RawItem): string {
  const t = stripSource(it.type);
  switch (t) {
    case 'RG': return 'ring';
    case 'WD': return 'wand';
    case 'RD': return 'rod';
    case 'ST': return 'staff';
    case 'P':  return 'potion';
    case 'SC': return 'scroll';
    case 'A':  return 'ammunition';
    case 'M':
    case 'R':
      return 'weapon';
    case 'LA':
    case 'MA':
    case 'HA':
      return 'armor';
    case 'S':  return 'shield';
    default:
      // Fall back to flag-driven detection when the type code didn't
      // give a clean answer (some magic entries don't carry a type).
      if (it.weapon) return 'weapon';
      if (it.armor) return 'armor';
      return 'wondrous-item';
  }
}

/**
 * Convert a copper-piece value into the SRD's {amount, currency} form,
 * choosing the largest unit that divides cleanly. Undefined value →
 * null cost (matches the SRD's posture for items without a listed
 * price, like most magic items).
 */
function formatCost(value: number | undefined): ItemResult['cost'] {
  if (typeof value !== 'number' || value < 0) return null;
  if (value === 0) return { amount: 0, currency: 'cp' };
  if (value % 100 === 0) return { amount: value / 100, currency: 'gp' };
  if (value % 10 === 0) return { amount: value / 10, currency: 'sp' };
  return { amount: value, currency: 'cp' };
}

/**
 * Build the loose properties[] list. Includes weapon properties (with
 * the source suffix stripped and code expanded), the armor stealth
 * disadvantage note, the armor strength prerequisite, the AC base, the
 * weapon damage line, and the attunement detail when reqAttune is a
 * string.
 */
function collectProperties(it: RawItem): string[] {
  const out: string[] = [];

  // Weapon properties: codes like "V|XPHB" → "Versatile (1d10)".
  if (Array.isArray(it.property)) {
    for (const entry of it.property) {
      const { uid, note } = readPipeRef(entry);
      const stripped = stripSource(uid);
      if (!stripped) continue;
      const name = WEAPON_PROPERTY_NAMES[stripped] ?? stripped;
      // Versatile gets the alt damage die in parens, matching how the
      // SRD weapons table renders it.
      let display: string;
      if (stripped === 'V' && it.dmg2) display = `Versatile (${it.dmg2})`;
      else display = name;
      // Append the contextual note when present (e.g. Lance's
      // "Two-handed (unless mounted)").
      out.push(note ? `${display} (${note})` : display);
    }
  }

  // Weapon damage line.
  if (it.dmg1) {
    const dmgType = it.dmgType ? DAMAGE_TYPE_NAMES[it.dmgType.toUpperCase()] ?? it.dmgType : '';
    out.push(dmgType ? `Damage: ${it.dmg1} ${dmgType.toLowerCase()}` : `Damage: ${it.dmg1}`);
  }

  // Weapon category (simple / martial).
  if (it.weaponCategory) {
    out.push(`${capitalize(it.weaponCategory)} weapon`);
  }

  // Weapon Mastery (2024) — pipe-delimited like properties. Only one
  // mastery is typical, but we join with " · " to handle the rare
  // multi-mastery case without an awkward bare comma list.
  if (Array.isArray(it.mastery) && it.mastery.length > 0) {
    const names = it.mastery
      .map((entry) => stripSource(readPipeRef(entry).uid))
      .filter((s): s is string => !!s);
    if (names.length > 0) {
      out.push(`Mastery: ${names.join(' · ')}`);
    }
  }

  // Armor base AC + stealth + strength prereq.
  if (typeof it.ac === 'number') {
    out.push(`Base AC ${it.ac}`);
  }
  if (it.stealth === true) {
    out.push('Disadvantage on Stealth');
  }
  if (it.strength) {
    out.push(`Min Strength ${it.strength}`);
  }

  // Attunement detail string (reqAttune as a phrase like "by a druid or
  // ranger"). The boolean form is conveyed by requiresAttunement; the
  // detail string is purely additive.
  if (typeof it.reqAttune === 'string' && it.reqAttune.trim().length > 0) {
    out.push(`Attunement: ${it.reqAttune.trim()}`);
  }

  return out;
}

const WEAPON_PROPERTY_NAMES: Record<string, string> = {
  A:   'Ammunition',
  AF:  'Ammunition (firearm)',
  BF:  'Burst fire',
  F:   'Finesse',
  H:   'Heavy',
  L:   'Light',
  LD:  'Loading',
  R:   'Reach',
  RLD: 'Reload',
  S:   'Special',
  T:   'Thrown',
  '2H': 'Two-handed',
  V:   'Versatile',
  RN:  'Range',
};

const DAMAGE_TYPE_NAMES: Record<string, string> = {
  A: 'Acid',
  B: 'Bludgeoning',
  C: 'Cold',
  F: 'Fire',
  O: 'Force',
  L: 'Lightning',
  N: 'Necrotic',
  P: 'Piercing',
  I: 'Poison',
  Y: 'Psychic',
  R: 'Radiant',
  S: 'Slashing',
  T: 'Thunder',
};

/**
 * Normalize 5e.tools rarity strings to our canonical union. "very rare"
 * → "very-rare"; "none" / "unknown" / undefined yield undefined for
 * non-magic items. Returns undefined when there's no meaningful rarity
 * (mundane items don't carry one in our schema either).
 */
function normalizeRarity(raw: string | undefined, isMagic: boolean): ItemResult['rarity'] {
  if (!isMagic) return undefined;
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

function capitalize(s: unknown): string {
  if (typeof s !== 'string' || !s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}
