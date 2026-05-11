// Transform a 5e.tools bestiary payload (top-level `monster` array)
// into our CreatureResult shape.
//
// 5e.tools encodes monster data densely with a lot of polymorphism. The
// fields we care about and how they coerce:
//   - `size: ["M"]`               letter codes → 'Medium'
//   - `type: "dragon"` or
//     `{type, tags}`              → "Dragon" / "Humanoid (any race)"
//   - `alignment: ["L","G"]`      letter pairs → "Lawful good"; "A"
//                                 alone → "Any alignment"; "U" → "Unaligned"
//   - `ac: [10]` or
//     `[{ac, from}]`              → ac: 10, armorDetail: "leather, shield"
//   - `hp: {average, formula}`    → hp: average, hitDice: formula
//   - `speed: {walk, fly, …}`     → speed display string + speeds object
//   - `str/dex/con/int/wis/cha`   → abilityScores (raw) + computed mods
//   - `save: {dex: "+6"}`         → savingThrows: { dex: 6 }
//   - `skill: {stealth: "+6"}`    → skills: { stealth: 6 }
//   - `senses: ["darkvision 120 ft."]` + `passive: 23`
//                                 → senses + passivePerception
//   - `resist`/`immune`/etc.      → flattened to string arrays; embedded
//                                   notes are dropped for v1
//   - `cr: "1/4"` or
//     `{cr: "1/4", lair: "1/2"}`  → challengeRating string + xp lookup
//   - `trait`/`action` arrays     → name + flattened description
//   - `legendary` block           → actions tagged actionType:
//                                   'LEGENDARY_ACTION' (matches SRD output)
//   - `bonus`/`reaction` arrays   → actions tagged BONUS_ACTION /
//                                   REACTION
//
// Skipped in v1:
//   - `_copy` monster variants (need base lookup + _mod patching)
//   - `legendaryGroup` external resolution (lair actions / regional
//     effects live in a separate file)
//   - Structured `spellcasting` block — flattened to a single trait per
//     entry so the prose still surfaces; full spell-slot structuring is
//     a follow-up.
//   - Inline annotations on resist/immune (`{resist: ["fire"], note: …}`)
//     are flattened to bare names; the note is dropped.

import type { CreatureResult, ImportSource } from '@vaultstone/types';
import { entriesToText, slugify, sourceLongName, srdVersionsForSource, type RawEntry } from './entries';

// ── Source-side type sketches ─────────────────────────────────────────────

type RawMonster = {
  name: string;
  source: string;
  page?: number;
  size?: string[];
  type?: string | { type: string; tags?: Array<string | { tag?: string; prefix?: string }> };
  alignment?: Array<string | { alignment: string[]; chance?: number }>;
  ac?: Array<number | { ac: number; from?: string[]; condition?: string }>;
  hp?: { average?: number; formula?: string; special?: string };
  speed?: {
    walk?: number;
    fly?: number;
    swim?: number;
    climb?: number;
    burrow?: number;
    canHover?: boolean;
  };
  str?: number;
  dex?: number;
  con?: number;
  int?: number;
  wis?: number;
  cha?: number;
  save?: Partial<Record<'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha', string>>;
  skill?: Record<string, string>;
  senses?: string[];
  passive?: number;
  /** Either string array or annotated objects with embedded notes. */
  resist?: Array<string | RawDamageGroup>;
  immune?: Array<string | RawDamageGroup>;
  vulnerable?: Array<string | RawDamageGroup>;
  conditionImmune?: Array<string | RawDamageGroup>;
  languages?: string[];
  cr?: string | { cr: string; lair?: string; coven?: string };
  trait?: RawNamedBlock[];
  action?: RawNamedBlock[];
  bonus?: RawNamedBlock[];
  reaction?: RawNamedBlock[];
  legendary?: RawNamedBlock[];
  legendaryHeader?: RawEntry[];
  spellcasting?: RawSpellcasting[];
  environment?: string[];
  _copy?: { name?: string; source?: string };
  [key: string]: unknown;
};

/** Annotated damage/condition groups carry a list and a free-form note. */
type RawDamageGroup = {
  resist?: string[];
  immune?: string[];
  vulnerable?: string[];
  conditionImmune?: string[];
  note?: string;
  cond?: boolean;
  preNote?: string;
};

type RawNamedBlock = {
  name?: string;
  entries?: RawEntry[];
  [key: string]: unknown;
};

type RawSpellcasting = {
  name?: string;
  headerEntries?: RawEntry[];
  footerEntries?: RawEntry[];
  will?: string[];
  daily?: Record<string, unknown>;
  spells?: Record<string, { spells?: string[]; slots?: number }>;
  [key: string]: unknown;
};

export type RawBestiaryFile = {
  monster?: RawMonster[];
  [key: string]: unknown;
};

// ── Public transform ──────────────────────────────────────────────────────

export type TransformOptions = {
  systemId: string;
  sourceLabel?: string;
};

/**
 * Transform a parsed 5e.tools bestiary payload into CreatureResult[].
 * Filters out `_copy` variant entries — resolving them needs a base
 * monster lookup with `_mod` patch application; the import doesn't
 * crash, but those entries don't import.
 */
export function transformMonsters(
  raw: RawBestiaryFile,
  opts: TransformOptions,
): CreatureResult[] {
  const { systemId } = opts;
  const monsters = raw.monster ?? [];

  return monsters
    .filter((m) => !m._copy)
    .map((m) => {
      const importSource: ImportSource = {
        code: m.source,
        name: sourceLongName(m.source),
        page: m.page,
      };

      const abilityScores = extractAbilityScores(m);
      const abilityModifiers = abilityScores ? computeModifiers(abilityScores) : undefined;
      const cr = extractCr(m.cr);
      const ac = extractAc(m.ac);
      const armorDetail = extractArmorDetail(m.ac);
      const speeds = extractSpeeds(m.speed);
      const speedDisplay = formatSpeed(m.speed);
      const senses = extractSenses(m.senses, m.passive);
      const traits = collectTraits(m);
      const actions = collectActions(m);

      return {
        key: `imported_${systemId}_monster_${slugify(m.source)}_${slugify(m.name)}`,
        name: m.name,
        type: 'monster',
        tier: 'imported',
        system: systemId,
        description: '',
        importSource,
        data: {},
        challengeRating: cr,
        xp: crToXp(cr),
        size: extractSize(m.size),
        creatureType: extractType(m.type),
        alignment: extractAlignment(m.alignment),
        ac,
        armorDetail,
        hp: m.hp?.average ?? 1,
        hitDice: m.hp?.formula,
        speed: speedDisplay,
        speeds,
        abilityScores,
        abilityModifiers,
        savingThrows: extractSaves(m.save),
        skills: extractSkills(m.skill),
        senses,
        languages: m.languages?.join(', ') || undefined,
        damageResistances: flattenDamageList(m.resist, 'resist'),
        damageImmunities: flattenDamageList(m.immune, 'immune'),
        damageVulnerabilities: flattenDamageList(m.vulnerable, 'vulnerable'),
        conditionImmunities: flattenDamageList(m.conditionImmune, 'conditionImmune'),
        traits,
        actions,
        environments: m.environment?.map(titleCase),
        srdVersions: srdVersionsForSource(m.source),
      };
    });
}

// ── Internals ─────────────────────────────────────────────────────────────

const SIZE_BY_CODE: Record<string, string> = {
  T: 'Tiny',
  S: 'Small',
  M: 'Medium',
  L: 'Large',
  H: 'Huge',
  G: 'Gargantuan',
};

function extractSize(size: string[] | undefined): string {
  if (!size || size.length === 0) return 'Medium';
  return SIZE_BY_CODE[size[0]?.toUpperCase()] ?? 'Medium';
}

/**
 * Bare string ("dragon") or `{type, tags: ["any race"]}` → "Dragon" or
 * "Humanoid (any race)". Tags are joined with ", " when there's more
 * than one (rare; usually a single subtype).
 */
function extractType(type: RawMonster['type']): string {
  if (!type) return '';
  if (typeof type === 'string') return capitalize(type);
  const base = capitalize(type.type);
  const tags = (type.tags ?? [])
    .map((t) => (typeof t === 'string' ? t : `${t.prefix ? t.prefix + ' ' : ''}${t.tag ?? ''}`))
    .filter(Boolean);
  return tags.length > 0 ? `${base} (${tags.join(', ')})` : base;
}

const ALIGNMENT_CODE: Record<string, string> = {
  L: 'lawful',
  N: 'neutral',
  C: 'chaotic',
  G: 'good',
  E: 'evil',
};

/**
 * Map alignment letter codes to readable text. The simplest forms
 * ([A], [U], [N]) are common short-circuits; otherwise we expand each
 * letter and join with a space, capitalizing only the first word so the
 * output reads "Lawful good" / "Chaotic evil" — matches the SRD bundle.
 *
 * 5e.tools sometimes encodes weighted alignments as
 * `[{alignment: [...], chance: 50}, ...]`; we collapse to the first
 * group's letters in v1.
 */
function extractAlignment(alignment: RawMonster['alignment']): string {
  if (!alignment || alignment.length === 0) return '';
  const first = alignment[0];
  const codes = typeof first === 'string'
    ? alignment.filter((x): x is string => typeof x === 'string')
    : first.alignment ?? [];
  if (codes.length === 0) return '';
  if (codes.length === 1) {
    const c = codes[0];
    if (c === 'A') return 'Any alignment';
    if (c === 'U') return 'Unaligned';
    if (c === 'N') return 'Neutral';
  }
  if (codes.length === 2 && codes[0] === 'N' && codes[1] === 'N') return 'Neutral';
  const words = codes.map((c) => ALIGNMENT_CODE[c] ?? c.toLowerCase());
  return capitalize(words.join(' '));
}

/**
 * Extract the AC value. 5e.tools uses an array because some monsters
 * have multiple AC entries (e.g. "16 (with mage armor); 12 without"); we
 * surface only the first, which is the canonical/highest. armorDetail
 * comes from the same first entry's `from[]` list.
 */
function extractAc(ac: RawMonster['ac']): number {
  if (!ac || ac.length === 0) return 10;
  const first = ac[0];
  if (typeof first === 'number') return first;
  return first.ac ?? 10;
}

function extractArmorDetail(ac: RawMonster['ac']): string | undefined {
  if (!ac || ac.length === 0) return undefined;
  const first = ac[0];
  if (typeof first === 'number') return undefined;
  return first.from?.join(', ');
}

function extractSpeeds(speed: RawMonster['speed']): CreatureResult['speeds'] {
  if (!speed) return undefined;
  const out: NonNullable<CreatureResult['speeds']> = {};
  if (typeof speed.walk === 'number') out.walk = speed.walk;
  if (typeof speed.fly === 'number') out.fly = speed.fly;
  if (typeof speed.swim === 'number') out.swim = speed.swim;
  if (typeof speed.climb === 'number') out.climb = speed.climb;
  if (typeof speed.burrow === 'number') out.burrow = speed.burrow;
  if (speed.canHover === true) out.hover = true;
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Render the speed object as a comma-separated display string matching
 * the SRD format: "30 ft." / "40 ft., fly 80 ft., climb 40 ft."
 */
function formatSpeed(speed: RawMonster['speed']): string {
  if (!speed) return '';
  const parts: string[] = [];
  if (typeof speed.walk === 'number') parts.push(`${speed.walk} ft.`);
  if (typeof speed.burrow === 'number') parts.push(`burrow ${speed.burrow} ft.`);
  if (typeof speed.climb === 'number') parts.push(`climb ${speed.climb} ft.`);
  if (typeof speed.fly === 'number') {
    parts.push(`fly ${speed.fly} ft.${speed.canHover ? ' (hover)' : ''}`);
  }
  if (typeof speed.swim === 'number') parts.push(`swim ${speed.swim} ft.`);
  return parts.join(', ');
}

function extractAbilityScores(m: RawMonster): CreatureResult['abilityScores'] {
  if (
    typeof m.str !== 'number' && typeof m.dex !== 'number' &&
    typeof m.con !== 'number' && typeof m.int !== 'number' &&
    typeof m.wis !== 'number' && typeof m.cha !== 'number'
  ) return undefined;
  return {
    str: m.str ?? 10,
    dex: m.dex ?? 10,
    con: m.con ?? 10,
    int: m.int ?? 10,
    wis: m.wis ?? 10,
    cha: m.cha ?? 10,
  };
}

function computeModifiers(scores: NonNullable<CreatureResult['abilityScores']>): NonNullable<CreatureResult['abilityModifiers']> {
  return {
    str: Math.floor((scores.str - 10) / 2),
    dex: Math.floor((scores.dex - 10) / 2),
    con: Math.floor((scores.con - 10) / 2),
    int: Math.floor((scores.int - 10) / 2),
    wis: Math.floor((scores.wis - 10) / 2),
    cha: Math.floor((scores.cha - 10) / 2),
  };
}

/**
 * Parse "+6" / "-1" → 6 / -1. 5e.tools always includes the sign.
 */
function parseSignedInt(s: string | undefined): number | undefined {
  if (typeof s !== 'string') return undefined;
  const n = parseInt(s.trim(), 10);
  return Number.isNaN(n) ? undefined : n;
}

function extractSaves(save: RawMonster['save']): CreatureResult['savingThrows'] {
  if (!save) return undefined;
  const out: NonNullable<CreatureResult['savingThrows']> = {};
  for (const key of ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const) {
    const v = parseSignedInt(save[key]);
    if (v !== undefined) out[key] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function extractSkills(skill: RawMonster['skill']): CreatureResult['skills'] {
  if (!skill) return undefined;
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(skill)) {
    const v = parseSignedInt(raw);
    if (v !== undefined) out[key.toLowerCase()] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Parse `senses: ["darkvision 120 ft.", "blindsight 60 ft."]` plus the
 * separate `passive` field into the structured senses object on
 * CreatureResult. Unrecognized sense lines are dropped — the structured
 * shape only carries the four core senses + passive perception.
 */
function extractSenses(
  senses: string[] | undefined,
  passive: number | undefined,
): CreatureResult['senses'] {
  const out: NonNullable<CreatureResult['senses']> = {};
  if (typeof passive === 'number') out.passivePerception = passive;
  for (const s of senses ?? []) {
    const lower = s.toLowerCase();
    const match = lower.match(/(\d+)\s*ft/);
    if (!match) continue;
    const range = parseInt(match[1], 10);
    if (lower.includes('darkvision')) out.darkvision = range;
    else if (lower.includes('blindsight')) out.blindsight = range;
    else if (lower.includes('tremorsense')) out.tremorsense = range;
    else if (lower.includes('truesight')) out.truesight = range;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Flatten a 5e.tools resist/immune/vulnerable/conditionImmune array
 * into bare strings, dropping notes. Mixed arrays of strings and
 * `{resist: [...], note: "from nonmagical attacks"}` groups: we walk
 * groups inline and harvest just the named entries. Names are
 * Title Cased to match the SRD bundle.
 */
function flattenDamageList(
  list: Array<string | RawDamageGroup> | undefined,
  innerKey: 'resist' | 'immune' | 'vulnerable' | 'conditionImmune',
): string[] | undefined {
  if (!list || list.length === 0) return undefined;
  const out: string[] = [];
  // 5e.tools nests groups inside groups for clauses like "immune to
  // bludgeoning, piercing, and slashing from nonmagical attacks" — so
  // we walk recursively, harvesting only the bare-string leaves.
  // Non-string non-group entries are dropped (with a defensive titleCase
  // guard upstream too, just in case).
  function walk(node: unknown): void {
    if (typeof node === 'string') {
      const t = titleCase(node);
      if (t) out.push(t);
      return;
    }
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    const inner = (node as Record<string, unknown>)[innerKey];
    if (Array.isArray(inner)) {
      for (const item of inner) walk(item);
    }
  }
  for (const entry of list) walk(entry);
  return out.length > 0 ? out : undefined;
}

/**
 * Extract the canonical CR string. 5e.tools encodes most monsters with
 * a bare string; some carry an object with lair / coven variants. We
 * surface only the base CR for v1 — a follow-up could expose the lair
 * variant via traits or a dedicated field.
 */
function extractCr(cr: RawMonster['cr']): string {
  if (!cr) return '0';
  if (typeof cr === 'string') return cr;
  return cr.cr ?? '0';
}

/**
 * CR → XP lookup matching the SRD table. The 2014 PHB and 2024 SRD
 * agree on these values for CR <= 30.
 */
const CR_TO_XP: Record<string, number> = {
  '0': 10,
  '1/8': 25,
  '1/4': 50,
  '1/2': 100,
  '1': 200, '2': 450, '3': 700, '4': 1100, '5': 1800, '6': 2300,
  '7': 2900, '8': 3900, '9': 5000, '10': 5900, '11': 7200, '12': 8400,
  '13': 10000, '14': 11500, '15': 13000, '16': 15000, '17': 18000,
  '18': 20000, '19': 22000, '20': 25000, '21': 33000, '22': 41000,
  '23': 50000, '24': 62000, '25': 75000, '26': 90000, '27': 105000,
  '28': 120000, '29': 135000, '30': 155000,
};

function crToXp(cr: string): number | undefined {
  return CR_TO_XP[cr.trim()];
}

/**
 * Build the trait list. Combines `trait[]` with a flattened spellcasting
 * block — 5e.tools models innate / leveled spellcasting as a structured
 * block rather than a trait, but the SRD bundle's posture is to render
 * it as a trait with prose. v1 collapses each spellcasting block into
 * one trait; full spell-slot structuring is a follow-up.
 */
function collectTraits(m: RawMonster): CreatureResult['traits'] {
  const out: NonNullable<CreatureResult['traits']> = [];
  for (const t of m.trait ?? []) {
    if (!t.name) continue;
    out.push({ name: t.name, description: entriesToText(t.entries ?? []).trim() });
  }
  for (const sc of m.spellcasting ?? []) {
    const desc = renderSpellcasting(sc);
    if (desc) out.push({ name: sc.name ?? 'Spellcasting', description: desc });
  }
  return out.length > 0 ? out : undefined;
}

function renderSpellcasting(sc: RawSpellcasting): string {
  const parts: string[] = [];
  if (sc.headerEntries) parts.push(entriesToText(sc.headerEntries).trim());
  if (Array.isArray(sc.will) && sc.will.length > 0) {
    parts.push(`At will: ${sc.will.map(stripSpellRef).join(', ')}`);
  }
  if (sc.spells) {
    for (const [level, group] of Object.entries(sc.spells)) {
      if (!group?.spells || group.spells.length === 0) continue;
      const slot = typeof group.slots === 'number' ? ` (${group.slots} slots)` : '';
      parts.push(`Level ${level}${slot}: ${group.spells.map(stripSpellRef).join(', ')}`);
    }
  }
  if (sc.footerEntries) parts.push(entriesToText(sc.footerEntries).trim());
  return parts.filter(Boolean).join('\n\n');
}

/** "{@spell fireball|phb}" → "fireball". Strips inline-tag wrapping. */
function stripSpellRef(s: string): string {
  return s.replace(/\{@spell\s+([^|}]+)[^}]*\}/gi, '$1').trim();
}

/**
 * Build the action list from `action[]`, `bonus[]`, `reaction[]`, and
 * `legendary[]`. Each block becomes one entry tagged with the
 * action_type discriminator the SRD bundle uses (`ACTION` /
 * `BONUS_ACTION` / `REACTION` / `LEGENDARY_ACTION`).
 */
function collectActions(m: RawMonster): CreatureResult['actions'] {
  const out: NonNullable<CreatureResult['actions']> = [];
  for (const a of m.action ?? []) {
    if (!a.name) continue;
    out.push({
      name: a.name,
      description: entriesToText(a.entries ?? []).trim(),
      actionType: 'ACTION',
    });
  }
  for (const a of m.bonus ?? []) {
    if (!a.name) continue;
    out.push({
      name: a.name,
      description: entriesToText(a.entries ?? []).trim(),
      actionType: 'BONUS_ACTION',
    });
  }
  for (const a of m.reaction ?? []) {
    if (!a.name) continue;
    out.push({
      name: a.name,
      description: entriesToText(a.entries ?? []).trim(),
      actionType: 'REACTION',
    });
  }
  for (const a of m.legendary ?? []) {
    if (!a.name) continue;
    out.push({
      name: a.name,
      description: entriesToText(a.entries ?? []).trim(),
      actionType: 'LEGENDARY_ACTION',
    });
  }
  return out.length > 0 ? out : undefined;
}

function titleCase(s: unknown): string {
  // Guard against non-string inputs from upstream — 5e.tools sometimes
  // nests objects inside arrays we expect to be flat (e.g. damage-
  // immunity groups inside groups), and we'd rather skip than crash.
  if (typeof s !== 'string' || !s) return '';
  return s
    .split(/\s+/)
    .map((part) => (part.length > 0 ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part))
    .join(' ');
}

function capitalize(s: unknown): string {
  if (typeof s !== 'string' || !s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}
