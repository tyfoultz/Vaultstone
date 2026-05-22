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
