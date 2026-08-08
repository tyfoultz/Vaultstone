export type SpellTier = {
  tier: string;
  spellNames: string[];
};

/**
 * Tier headers vary by content source, so match every shape we ship:
 *   - SRD bundle (Open5e):  "• Cantrips (at will): ...", "• 1st level (4 slots): ..."
 *   - Imported (5e.tools):  "At will: ...", "Level 0: ...", "Level 1 (4 slots): ..."
 *   - Innate blocks:        "3/day each: ...", "1/day: ...", "Constant: ..."
 * Missing a shape isn't cosmetic — unmatched tiers lose their spell links.
 */
const TIER_LABELS = [
  // "At will", "Constant"
  'at\\s+will',
  'constant',
  // "Cantrip", "Cantrips", "Cantrips (at will)"
  'cantrips?(?:\\s*\\([^)]*\\))?',
  // "3/day", "1/day each"
  '\\d+\\s*/\\s*day(?:\\s+each)?',
  // "1st level (4 slots)", "1st-9th level (1 slot)", "9th level"
  '\\d+(?:st|nd|rd|th)(?:\\s*[-–]\\s*\\d+(?:st|nd|rd|th))?\\s+level(?:\\s+spells?)?(?:\\s*\\([^)]*\\))?',
  // "Level 0", "Level 1 (4 slots)", "Levels 1-3 (2 slots)"
  'levels?\\s*\\d+(?:\\s*[-–]\\s*\\d+)?(?:\\s*\\([^)]*\\))?',
].join('|');

const TIER_LINE = new RegExp(
  `^\\s*(?:[•\\-*]\\s*)?\\*{0,2}(${TIER_LABELS})\\*{0,2}\\s*:\\s*(.+)`,
  'i',
);

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

/** Every distinct spell name in the trait, de-duped case-insensitively. */
export function extractAllSpellNames(description: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tier of parseSpellcastingTrait(description)) {
    for (const name of tier.spellNames) {
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
  }
  return out;
}

/**
 * Loose match — imported blocks carry qualifiers ("Innate Spellcasting
 * (Psionics)", "Spellcasting (Wizard)"). A false positive is harmless:
 * a trait with no parseable tiers falls back to plain markdown.
 */
export function isSpellcastingTrait(traitName: string): boolean {
  return /spellcasting/i.test(traitName);
}
