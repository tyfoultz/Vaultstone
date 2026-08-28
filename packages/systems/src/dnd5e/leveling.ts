// Pure leveling library — small, side-effect-free helpers the wizard
// + the starting_level>1 bootstrap both call to figure out what
// happens when a class entry gains a level.
//
// Nothing here writes to the character or fetches content. Callers
// pass in the class data (ClassResult) they've already resolved
// through ContentResolver. That keeps this file synchronous and
// trivially testable.

import type {
  AbilityKey,
  ClassResult,
  Dnd5eAbilityScores,
  Dnd5eClassEntry,
  Dnd5eSpellSlotLevel,
  Dnd5eStats,
  MulticlassPrereq,
  SubclassResult,
} from '@vaultstone/types';
import { getClassEntries } from '@vaultstone/types';

// ── Spell slot table columns (mirrored from app/character/new.tsx) ──────

// Each level accepts multiple key shapes — SRD ships `1st` / `2nd` /
// ..., imported homebrew (notably 5e.tools Artificer) ships `spell1` /
// `spell2` / ..., and some packs use just `1` / `2`. We probe all three
// for each level so a single reader handles every shape.
const SLOT_COLUMNS: Array<{ keys: readonly string[]; level: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 }> = [
  { keys: ['1st', 'spell1', '1'], level: 1 },
  { keys: ['2nd', 'spell2', '2'], level: 2 },
  { keys: ['3rd', 'spell3', '3'], level: 3 },
  { keys: ['4th', 'spell4', '4'], level: 4 },
  { keys: ['5th', 'spell5', '5'], level: 5 },
  { keys: ['6th', 'spell6', '6'], level: 6 },
  { keys: ['7th', 'spell7', '7'], level: 7 },
  { keys: ['8th', 'spell8', '8'], level: 8 },
  { keys: ['9th', 'spell9', '9'], level: 9 },
];

const SLOT_LEVEL_LABEL_TO_NUMBER: Record<string, 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9> = {
  '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, '5th': 5,
  '6th': 6, '7th': 7, '8th': 8, '9th': 9,
};

export type SpellSlotsByLevel = Record<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, Dnd5eSpellSlotLevel>;

const EMPTY_SLOT: Dnd5eSpellSlotLevel = { max: 0, remaining: 0 };
const EMPTY_SLOTS: SpellSlotsByLevel = {
  1: EMPTY_SLOT, 2: EMPTY_SLOT, 3: EMPTY_SLOT, 4: EMPTY_SLOT, 5: EMPTY_SLOT,
  6: EMPTY_SLOT, 7: EMPTY_SLOT, 8: EMPTY_SLOT, 9: EMPTY_SLOT,
};

/**
 * Compute spell slots for a single class at a given level by reading
 * the class's `progressionTable[level].values`. Handles two shapes:
 *
 *   - Full + half casters: per-level columns `1st` / `2nd` / ... `9th`
 *     hold the slot count for that level. `—` / non-numeric values
 *     resolve to 0, which is correct for half-casters at L1 in 5.1.
 *   - Warlock pact magic: `spellSlots` (count) + `slotLevel` (label
 *     like `"1st"`) name the level all of those slots cast at.
 *
 * Returns an empty slot table for non-spellcasters.
 */
export function spellSlotsForClassAtLevel(
  cls: ClassResult,
  level: number,
): SpellSlotsByLevel {
  if (!cls.spellcasting) return cloneSlots(EMPTY_SLOTS);
  const row = (cls.progressionTable ?? []).find((r) => r.level === Math.min(Math.max(level, 1), 20));
  if (!row) return cloneSlots(EMPTY_SLOTS);

  const slots = cloneSlots(EMPTY_SLOTS);
  let foundExplicitSlots = false;
  for (const col of SLOT_COLUMNS) {
    let n = NaN;
    for (const key of col.keys) {
      const raw = row.values[key];
      if (raw == null || raw === '—') continue;
      const parsed = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
      if (Number.isFinite(parsed)) { n = parsed; break; }
    }
    if (Number.isFinite(n)) {
      slots[col.level] = { max: n, remaining: n };
      if (n > 0) foundExplicitSlots = true;
    }
  }
  if (!foundExplicitSlots) {
    // Warlock-style pact magic: a single bucket of N slots all cast
    // at slotLevel.
    const countRaw = row.values['spellSlots'];
    const slotLevelRaw = row.values['slotLevel'];
    const count = typeof countRaw === 'number' ? countRaw : parseInt(String(countRaw ?? ''), 10);
    const slotLevel = typeof slotLevelRaw === 'string' ? SLOT_LEVEL_LABEL_TO_NUMBER[slotLevelRaw] : undefined;
    if (Number.isFinite(count) && count > 0 && slotLevel) {
      slots[slotLevel] = { max: count, remaining: count };
    }
  }
  return slots;
}

/**
 * SRD 5e multiclass spell slot table. Caster level on the multiclass
 * track is the sum of:
 *   - full caster levels (Bard, Cleric, Druid, Sorcerer, Wizard)
 *   - half caster levels rounded down (Paladin, Ranger; ÷2)
 *   - artificer levels rounded up (÷2; not in SRD but documented for completeness)
 *   - third caster levels rounded down (Eldritch Knight Fighter,
 *     Arcane Trickster Rogue; ÷3)
 *
 * Warlock levels do not contribute to the multiclass caster level —
 * pact magic uses the Warlock's own progression table. A multiclass
 * Warlock therefore carries TWO independent slot pools.
 *
 * Indexed by total caster level 1–20; each row is the standard
 * full-caster slot row.
 */
const MULTICLASS_CASTER_SLOTS: Record<number, [number, number, number, number, number, number, number, number, number]> = {
  1:  [2, 0, 0, 0, 0, 0, 0, 0, 0],
  2:  [3, 0, 0, 0, 0, 0, 0, 0, 0],
  3:  [4, 2, 0, 0, 0, 0, 0, 0, 0],
  4:  [4, 3, 0, 0, 0, 0, 0, 0, 0],
  5:  [4, 3, 2, 0, 0, 0, 0, 0, 0],
  6:  [4, 3, 3, 0, 0, 0, 0, 0, 0],
  7:  [4, 3, 3, 1, 0, 0, 0, 0, 0],
  8:  [4, 3, 3, 2, 0, 0, 0, 0, 0],
  9:  [4, 3, 3, 3, 1, 0, 0, 0, 0],
  10: [4, 3, 3, 3, 2, 0, 0, 0, 0],
  11: [4, 3, 3, 3, 2, 1, 0, 0, 0],
  12: [4, 3, 3, 3, 2, 1, 0, 0, 0],
  13: [4, 3, 3, 3, 2, 1, 1, 0, 0],
  14: [4, 3, 3, 3, 2, 1, 1, 0, 0],
  15: [4, 3, 3, 3, 2, 1, 1, 1, 0],
  16: [4, 3, 3, 3, 2, 1, 1, 1, 0],
  17: [4, 3, 3, 3, 2, 1, 1, 1, 1],
  18: [4, 3, 3, 3, 3, 1, 1, 1, 1],
  19: [4, 3, 3, 3, 3, 2, 1, 1, 1],
  20: [4, 3, 3, 3, 3, 2, 2, 1, 1],
};

/**
 * Caster type for multiclass spell slot computation. Inferred from
 * a class's name/keys for now — Open5e doesn't ship a structured
 * caster_type field reliably. Returns undefined for non-casters.
 */
export type CasterType = 'full' | 'half' | 'third' | 'pact';

const CASTER_TYPE_BY_NAME: Record<string, CasterType> = {
  Bard:     'full',
  Cleric:   'full',
  Druid:    'full',
  Sorcerer: 'full',
  Wizard:   'full',
  Paladin:  'half',
  Ranger:   'half',
  Warlock:  'pact',
};

export function casterTypeFor(cls: ClassResult): CasterType | null {
  if (!cls.spellcasting) return null;
  const t = CASTER_TYPE_BY_NAME[cls.name];
  return t ?? 'full';
}

// ── Subclass-granted spellcasting ─────────────────────────────────────────

type SubclassCastingInfo = {
  casterProgression: CasterType;
  ability: string;
  spellListClass: string;
};

const KNOWN_CASTER_SUBCLASSES: Record<string, SubclassCastingInfo> = {
  'arcane trickster': { casterProgression: 'third', ability: 'Intelligence', spellListClass: 'Wizard' },
  'eldritch knight':  { casterProgression: 'third', ability: 'Intelligence', spellListClass: 'Wizard' },
};

export function resolveSubclassCasting(sub?: SubclassResult | null): SubclassCastingInfo | null {
  if (!sub) return null;
  if (sub.casterProgression && sub.spellcastingAbility) {
    return {
      casterProgression: sub.casterProgression,
      ability: sub.spellcastingAbility,
      spellListClass: sub.spellListClass ?? sub.name,
    };
  }
  return KNOWN_CASTER_SUBCLASSES[sub.name.toLowerCase()] ?? null;
}

export function casterTypeForEntry(
  cls: ClassResult,
  sub?: SubclassResult | null,
): CasterType | null {
  const classType = casterTypeFor(cls);
  if (classType) return classType;
  const subCasting = resolveSubclassCasting(sub);
  return subCasting?.casterProgression ?? null;
}

/**
 * Resolve the ability that drives this character's spellcasting.
 *
 * `stats.spellcastingAbility` is only stamped **once, at character
 * creation**, from the starting class (see `app/character/new.tsx`).
 * Nothing rewrites it when a class is added later, so a character who
 * multiclasses INTO a caster (Rogue 3 -> Bard 5) keeps the null their
 * non-caster start wrote. Resolving off the class results instead of
 * trusting that stamp is what makes the Spells tab work for them —
 * without it `spellAbility` stays null, and SpellsTab hides the whole
 * spellcasting stats row, which is where the MANAGE button lives.
 *
 * Precedence: the explicit stamp (also the Manual Mode override) wins,
 * then a class-granted ability, then a subclass-granted one (Eldritch
 * Knight / Arcane Trickster) — a full class's casting should outrank a
 * third-caster subclass on a multiclass character.
 *
 * Among several casting classes the primary one wins; otherwise the
 * highest-level caster entry, so a Rogue 3 / Bard 5 reports Charisma.
 */
export function getEffectiveSpellcastingAbility(
  stats: Dnd5eStats,
  classResultsByKey: Record<string, ClassResult>,
  subclassResultsByKey: Record<string, SubclassResult>,
): string | null {
  if (stats.spellcastingAbility) return stats.spellcastingAbility;

  const entries = getClassEntries(stats);

  const casters = entries
    .map((entry) => ({ entry, cls: classResultsByKey[entry.classKey] }))
    .filter((c) => !!c.cls?.spellcastingAbility);
  if (casters.length > 0) {
    const primary = casters.find((c) => c.entry.primary);
    const best = primary
      ?? casters.reduce((a, b) => (b.entry.level > a.entry.level ? b : a));
    return best.cls!.spellcastingAbility ?? null;
  }

  for (const entry of entries) {
    if (entry.subclassKey) {
      const sub = subclassResultsByKey[entry.subclassKey];
      const casting = resolveSubclassCasting(sub);
      if (casting) return casting.ability;
    }
  }
  return null;
}

/**
 * Compute the merged multiclass spell slot table for a character's
 * full set of class entries. Single-class casters get their class's
 * own progression-table row (handles half-caster L1=0, etc.);
 * multi-class characters with multiple non-Warlock casters get the
 * full-caster slot row for the summed effective caster level. Warlock
 * pact magic always reads from the Warlock entry's own row and is
 * tracked independently — but since `Dnd5eResources.spellSlots` only
 * has one bucket per slot level, we merge by summing max counts. A
 * multiclass Wizard 3 / Warlock 2 character thus shows 4 first-level
 * slots and 2 second-level slots in the bag, with the player /
 * sheet handling the "which were Warlock slots?" distinction at use
 * time. (Future improvement: surface pact-magic slots separately.)
 *
 * Pass the entries + a map of resolved ClassResults keyed by classKey.
 */
export function spellSlotsForCharacter(
  entries: Dnd5eClassEntry[],
  classByKey: Map<string, ClassResult>,
  subclassByKey?: Map<string, SubclassResult>,
): SpellSlotsByLevel {
  // Classify each entry's spellcasting contribution. Warlock pact magic
  // is tracked separately (it never combines into the multiclass caster
  // level); every other caster type feeds the `nonPact` list.
  const nonPact: Array<{ entry: Dnd5eClassEntry; cls: ClassResult; type: CasterType }> = [];
  let pactSlots: SpellSlotsByLevel | null = null;
  for (const e of entries) {
    const cls = classByKey.get(e.classKey);
    if (!cls) continue;
    const sub = e.subclassKey && subclassByKey ? subclassByKey.get(e.subclassKey) : undefined;
    const t = casterTypeForEntry(cls, sub);
    if (!t) continue;
    if (t === 'pact') {
      pactSlots = spellSlotsForClassAtLevel(cls, e.level);
    } else {
      nonPact.push({ entry: e, cls, type: t });
    }
  }

  let slots: SpellSlotsByLevel;

  // Single spellcasting class → read that class's OWN progression table,
  // not the summed multiclass table. Per the SRD multiclass rules, the
  // multiclass spell-slot table only applies when you have the
  // Spellcasting feature from more than one class. A half-caster
  // (Paladin/Ranger) multiclassed with a non-caster (e.g. Fighter) keeps
  // their own slot progression — routing them through the ÷2 multiclass
  // track was the "not enough slots" bug (Paladin 11 / Fighter showing
  // caster-level-5 slots instead of the Paladin's own). Edition oddities
  // (Paladin/Ranger 5.1 L1 = 0) are preserved this way too. Only classes
  // that ship their own spell table qualify; subclass casters (Eldritch
  // Knight / Arcane Trickster) have no spell columns on the base
  // Fighter/Rogue table, so they fall through to the third-caster
  // multiclass derivation below.
  if (nonPact.length === 1 && nonPact[0].cls.spellcasting) {
    slots = spellSlotsForClassAtLevel(nonPact[0].cls, nonPact[0].entry.level);
  } else {
    // Multi-class (or single subclass caster): sum the multiclass caster
    // level from full + half + third casters, then read the standard
    // full-caster slot row for that level.
    //
    // Per the SRD multiclass rules the divisor is applied ONCE to the
    // combined levels of each caster category — "half your levels
    // (rounded down) in the paladin and ranger classes", "a third of
    // your fighter or rogue levels (rounded down)". Rounding each
    // class's contribution separately under-counts when two half- or
    // two third-casters combine: Paladin 3 / Ranger 3 should be
    // ⌊(3+3)/2⌋ = 3, not ⌊3/2⌋ + ⌊3/2⌋ = 2.
    let fullLevels = 0, halfLevels = 0, thirdLevels = 0;
    for (const { entry, type } of nonPact) {
      if (type === 'full')  fullLevels  += entry.level;
      if (type === 'half')  halfLevels  += entry.level;
      if (type === 'third') thirdLevels += entry.level;
    }
    const casterLevel = fullLevels + Math.floor(halfLevels / 2) + Math.floor(thirdLevels / 3);
    slots = cloneSlots(EMPTY_SLOTS);
    if (casterLevel > 0) {
      const row = MULTICLASS_CASTER_SLOTS[Math.min(casterLevel, 20)];
      if (row) {
        for (const col of SLOT_COLUMNS) {
          const n = row[col.level - 1];
          slots[col.level] = { max: n, remaining: n };
        }
      }
    }
  }

  if (pactSlots) {
    for (const col of SLOT_COLUMNS) {
      const lvl = col.level;
      slots[lvl] = {
        max: slots[lvl].max + pactSlots[lvl].max,
        remaining: slots[lvl].remaining + pactSlots[lvl].remaining,
      };
    }
  }
  return slots;
}

function cloneSlots(src: SpellSlotsByLevel): SpellSlotsByLevel {
  const out: Record<number, Dnd5eSpellSlotLevel> = {};
  for (let i = 1; i <= 9; i++) out[i] = { ...src[i as keyof SpellSlotsByLevel] };
  return out as SpellSlotsByLevel;
}

// ── Hit point computation ───────────────────────────────────────────────

/**
 * Average HP gain at a level beyond first, per the SRD: floor(die/2) + 1.
 * A d8 averages 4.5; the SRD rounds up to 5. CON modifier is added on
 * top by the caller.
 */
export function averageHpForDie(hitDie: number): number {
  return Math.floor(hitDie / 2) + 1;
}

/**
 * Compute the HP delta for one level-up event. Inputs:
 *   - hitDie: the leveling class's hit die (8 for d8, etc.)
 *   - conMod: the character's current CON modifier
 *   - method: 'fixed' (average) or 'rolled' (caller passes `roll`)
 *   - roll: the rolled hit-die value when method is 'rolled'.
 *           Required when method === 'rolled'; ignored for 'fixed'.
 *
 * Returns the HP increase. Always at least 1 — a level-up never
 * grants 0 HP per the rules, even with a -10 CON character.
 */
export function hpGainForLevel(args: {
  hitDie: number;
  conMod: number;
  method: 'fixed' | 'rolled';
  roll?: number;
}): number {
  const base = args.method === 'fixed'
    ? averageHpForDie(args.hitDie)
    : Math.max(1, Math.min(args.hitDie, args.roll ?? args.hitDie));
  return Math.max(1, base + args.conMod);
}

// ── Class feature / subclass unlock helpers ─────────────────────────────

/**
 * Class features unlocked at a specific level. Reads
 * cls.features[].level. Returns an empty array if the class has no
 * features at that level (e.g. dead levels).
 */
export function classFeaturesAtLevel(
  cls: ClassResult,
  level: number,
): NonNullable<ClassResult['features']> {
  return (cls.features ?? []).filter((f) => f.level === level);
}

/**
 * Whether reaching this level unlocks subclass selection for the
 * class. Most classes unlock at L3 (2024) or L1/L2/L3 (5.1 varies);
 * the class definition holds the canonical value.
 */
export function isSubclassUnlockLevel(cls: ClassResult, level: number): boolean {
  return cls.subclassUnlockLevel === level;
}

// ── ASI / Feat trigger ──────────────────────────────────────────────────

/**
 * Levels that grant an Ability Score Improvement (or feat in lieu).
 * The SRD baseline is L4/8/12/16/19; Fighter and Rogue gain extra
 * slots from class features ("Ability Score Improvement" listed in
 * their `features` table at additional levels). Reading from
 * `features[]` keeps us honest with edition data — if a 2024 class
 * adds a slot the table reflects it without a code change.
 */
export function isAsiLevel(cls: ClassResult, level: number): boolean {
  // Either it's a stock SRD ASI level…
  if (level === 4 || level === 8 || level === 12 || level === 16 || level === 19) return true;
  // …or the class explicitly has a feature named "Ability Score
  // Improvement" at that level. Fighter (L6, L14) and Rogue (L10)
  // pick up bonus slots this way; the 2024 SRD lists them as
  // independent feature rows on the class table.
  return classFeaturesAtLevel(cls, level).some(
    (f) => f.name.toLowerCase().includes('ability score improvement'),
  );
}

// ── Multiclass prereq check ─────────────────────────────────────────────

const ABILITY_LABEL: Record<AbilityKey, string> = {
  strength: 'Strength', dexterity: 'Dexterity', constitution: 'Constitution',
  intelligence: 'Intelligence', wisdom: 'Wisdom', charisma: 'Charisma',
};

export type MulticlassCheckResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Check whether a candidate character meets the multiclass prereqs
 * for entering a class. Reads `cls.multiclassPrerequisiteRaw` (an
 * AND of OR-groups: every group must be satisfied, and a group is
 * satisfied if any of its abilities meets `minimum`).
 *
 * Returns ok: true when the class has no multiclass prereq table or
 * the character meets every group. The first failing group's reason
 * is returned for display.
 *
 * Honors the campaign's `multiclassing` rule:
 *   - 'enforced' (default): returns the structured check result.
 *   - 'relaxed':            always returns { ok: true } — the player
 *                           sees the prereq prose but can ignore it.
 *   - 'disabled':           always returns { ok: false } with a
 *                           "multiclassing disabled" reason. UI should
 *                           hide the affordance entirely rather than
 *                           render a locked button, but this fallback
 *                           keeps the gate honest if it slips through.
 */
export function checkMulticlassPrereqs(
  abilityScores: Partial<Record<AbilityKey, number>>,
  cls: ClassResult,
  multiclassRule: 'enforced' | 'relaxed' | 'disabled' = 'enforced',
): MulticlassCheckResult {
  if (multiclassRule === 'disabled') {
    return { ok: false, reason: 'Multiclassing is disabled in this campaign.' };
  }
  if (multiclassRule === 'relaxed') return { ok: true };
  const prereqs: MulticlassPrereq[] | undefined = cls.multiclassPrerequisiteRaw;
  if (!prereqs || prereqs.length === 0) return { ok: true };

  for (const group of prereqs) {
    const ok = group.abilities.some((a) => (abilityScores[a] ?? 10) >= group.minimum);
    if (!ok) {
      const labels = group.abilities.map((a) => ABILITY_LABEL[a]);
      const joined = labels.length === 1
        ? labels[0]
        : labels.length === 2
          ? `${labels[0]} or ${labels[1]}`
          : `${labels.slice(0, -1).join(', ')}, or ${labels[labels.length - 1]}`;
      return { ok: false, reason: `Requires ${joined} ${group.minimum}+ to multiclass into ${cls.name}` };
    }
  }
  return { ok: true };
}

// ── Proficiency bonus ───────────────────────────────────────────────────

/**
 * Standard 5e proficiency bonus by total character level: 1–4 → +2,
 * 5–8 → +3, 9–12 → +4, 13–16 → +5, 17–20 → +6. Both editions agree.
 */
export function proficiencyBonusForLevel(totalLevel: number): number {
  return Math.ceil(Math.max(1, totalLevel) / 4) + 1;
}

/**
 * Total character level across all class entries. Mirrors the
 * top-level `Dnd5eStats.level` field's intended value; use this when
 * recomputing it from `classes[]` after a level-up write.
 */
export function totalLevel(entries: Dnd5eClassEntry[]): number {
  return entries.reduce((sum, e) => sum + e.level, 0);
}

/**
 * Compute the character's CON modifier from raw ability scores.
 * Convenience wrapper since several leveling helpers need it.
 */
export function conModifier(scores: Pick<Dnd5eAbilityScores, 'constitution'>): number {
  return Math.floor((scores.constitution - 10) / 2);
}
