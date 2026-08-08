import type { Dnd5eEquipmentItem, Dnd5eStats, Dnd5eResources } from '@vaultstone/types';

function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

/**
 * Treat any equipped item literally named "Shield" as the shield slot
 * for AC purposes, even when its stored slot says 'armor'. Heals the
 * known Open5e SRD 2024 data quirk where Shield ships as category=armor.
 */
function looksLikeShield(e: Dnd5eEquipmentItem): boolean {
  return e.slot === 'shield' || (e.slot === 'armor' && /^shield$/i.test(e.name.trim()));
}

function looksLikeArmor(e: Dnd5eEquipmentItem): boolean {
  return e.slot === 'armor' && !looksLikeShield(e);
}

/**
 * Magical AC contributions (Cloak of Protection +1, Ring of Protection,
 * Bracers of Defense, etc.) only apply when the item is equipped AND,
 * if attunement is required, attuned.
 */
function isEffectiveMagic(e: Dnd5eEquipmentItem): boolean {
  return !!e.equipped && (!e.requiresAttunement || !!e.attuned);
}

/**
 * True if the character has any level in the class whose key base-name
 * is `name`. Three key shapes exist in the wild and all must match:
 *
 *   barbarian                                bare
 *   cleric-srd-2-0                           SRD, edition-suffixed
 *   imported_dnd5e_2014_class_phb_barbarian  imported (5e.tools)
 *
 * The imported shape is why a prefix test alone isn't enough — it's
 * `imported_<system>_class_<source>_<name>`, putting the class name in
 * the *trailing* segment. A prefix-only check silently denied Unarmored
 * Defense to every imported Barbarian and Monk. `slugify` collapses
 * everything non-alphanumeric to hyphens, so no segment contains an
 * underscore and splitting on `_` reliably isolates the name.
 *
 * Covers the top-level `classKey` and multiclass `classes[]` entries.
 */
function hasClass(stats: Dnd5eStats, name: string): boolean {
  const matches = (key: string | null | undefined) => {
    if (!key) return false;
    const k = key.toLowerCase();
    if (k === name || k.startsWith(`${name}-`) || k.startsWith(`${name}_`)) return true;
    return k.split('_').pop() === name;
  };
  if (matches(stats.classKey)) return true;
  for (const c of stats.classes ?? []) {
    if (matches(c.classKey)) return true;
  }
  return false;
}

export interface UnarmoredDefenseChoice {
  /** Display label for the source class ('Barbarian' | 'Monk'). */
  className: string;
  /** Ability whose modifier is added on top of 10 + DEX. */
  ability: 'constitution' | 'wisdom';
  /** The contributed modifier value. */
  abilityMod: number;
}

/**
 * Best-applicable Unarmored Defense for a character with no body armor
 * equipped, or `null` when none applies (no Barbarian/Monk levels, or
 * the plain 10 + DEX base is already as good).
 *
 *   - Barbarian: 10 + DEX + CON. A shield is allowed.
 *   - Monk: 10 + DEX + WIS, but only while NOT wielding a shield.
 *
 * `hasShield` gates the Monk option. When a character has both classes,
 * the higher ability modifier wins. A non-positive modifier is dropped
 * because 10 + DEX (optionally + shield) would beat it — RAW you may
 * choose whichever AC calculation is best.
 */
export function getUnarmoredDefense(
  stats: Dnd5eStats,
  hasShield: boolean,
): UnarmoredDefenseChoice | null {
  const scores = stats.abilityScores;
  if (!scores) return null;
  const candidates: UnarmoredDefenseChoice[] = [];
  if (hasClass(stats, 'barbarian')) {
    candidates.push({ className: 'Barbarian', ability: 'constitution', abilityMod: abilityMod(scores.constitution) });
  }
  if (hasClass(stats, 'monk') && !hasShield) {
    candidates.push({ className: 'Monk', ability: 'wisdom', abilityMod: abilityMod(scores.wisdom) });
  }
  const best = candidates
    .filter((c) => c.abilityMod > 0)
    .sort((a, b) => b.abilityMod - a.abilityMod)[0];
  return best ?? null;
}

/**
 * Compute a 5e character's Armor Class from their equipped gear.
 * Shared by the character sheet, the campaign party tab, the
 * PartyMemberCard, and the world home so the displayed AC stays
 * consistent across surfaces.
 *
 * Inputs:
 *   - `stats.abilityScores.dexterity` for the DEX modifier
 *   - `resources.equipment` to find the worn armor, shield, and any
 *     magic items contributing `miscACBonus`
 *
 * Does NOT apply `stats.acOverride`. The character sheet layers that
 * on top under Manual Mode; other surfaces show the computed value
 * so the at-a-glance number doesn't silently diverge from gear
 * changes. Callers that want override-aware AC should:
 *
 *   const ac = (manualMode && stats.acOverride != null)
 *     ? stats.acOverride
 *     : getEquippedAC(stats, resources);
 */
export function getEquippedAC(stats: Dnd5eStats, resources: Dnd5eResources): number {
  const scores = stats.abilityScores;
  if (!scores) return 10;
  const dexMod = abilityMod(scores.dexterity);
  const equipment: Dnd5eEquipmentItem[] = resources.equipment ?? [];
  const armor = equipment.find((e) => looksLikeArmor(e) && e.equipped);
  const shield = equipment.find((e) => looksLikeShield(e) && e.equipped);
  let base = 10 + dexMod;
  if (armor) {
    const cap = armor.dexCap;
    const dexBonus = cap !== undefined && cap !== null ? Math.min(dexMod, cap) : dexMod;
    base = (armor.acBase ?? 10) + dexBonus;
    if (isEffectiveMagic(armor) && armor.miscACBonus) base += armor.miscACBonus;
  } else {
    // No body armor — apply Barbarian/Monk Unarmored Defense if the
    // character has it and it beats the plain 10 + DEX base.
    const ud = getUnarmoredDefense(stats, !!shield);
    if (ud) base += ud.abilityMod;
  }
  if (shield) {
    base += shield.acBonus ?? 2;
    if (isEffectiveMagic(shield) && shield.miscACBonus) base += shield.miscACBonus;
  }
  // Magic items in non-armor/shield slots — cloak, ring, amulet,
  // bracers. Already covered the armor + shield cases above; skip
  // them here so an item isn't double-counted.
  for (const e of equipment) {
    if (looksLikeArmor(e) || looksLikeShield(e)) continue;
    if (!isEffectiveMagic(e) || !e.miscACBonus) continue;
    base += e.miscACBonus;
  }
  return base;
}
