export type SpellTier = {
  tier: string;
  spellNames: string[];
};

const TIER_LINE =
  /^\s*(?:[•\-*]\s*)?(?:\*{0,2})?(at will|cantrips?\s*\(at will\)|\d+\/day\s*(?:each)?|\d+(?:st|nd|rd|th)\s+level\s*\([^)]*\))(?:\*{0,2})?:\s*(.+)/i;

function titleCase(name: string): string {
  return name
    .split(' ')
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function cleanSpellName(raw: string): string {
  return raw.replace(/\*+/g, '').replace(/\s+/g, ' ').trim();
}

const INLINE_CAST = /can innately cast (?:the )?_?([^_,]+?)_?(?:\s*\(|,|\.|$)/i;

export function parseSpellcastingTrait(description: string): SpellTier[] {
  const tiers: SpellTier[] = [];
  const lines = description.split(/\n|(?<=:\s)(?=•)/);

  for (const line of lines) {
    const match = line.match(TIER_LINE);
    if (!match) continue;
    const tier = titleCase(match[1].replace(/\*+/g, '').trim());
    const namesRaw = match[2];
    const names = namesRaw
      .split(',')
      .map(cleanSpellName)
      .filter((n) => n.length > 0)
      .map(titleCase);
    if (names.length > 0) {
      tiers.push({ tier, spellNames: names });
    }
  }

  if (tiers.length === 0) {
    const inlineMatch = description.match(INLINE_CAST);
    if (inlineMatch) {
      const name = cleanSpellName(inlineMatch[1]);
      if (name) tiers.push({ tier: 'Innate', spellNames: [titleCase(name)] });
    }
  }

  return tiers;
}

export function extractAllSpellNames(description: string): string[] {
  return parseSpellcastingTrait(description).flatMap((t) => t.spellNames);
}

export function isSpellcastingTrait(traitName: string): boolean {
  const lower = traitName.toLowerCase();
  return lower === 'spellcasting' || lower === 'innate spellcasting';
}
