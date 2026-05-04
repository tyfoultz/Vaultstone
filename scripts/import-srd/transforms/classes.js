// Transform a snapshot of Open5e v2's /classes endpoint into the
// ClassResult[] shape consumed by packages/content/src/srd/data/classes.json.
//
// Per-edition entries: SRD 5.1 and 2024 use different feature_type tagging
// (5.1 ships PROFICIENCIES + STARTING_EQUIPMENT as separate features;
// 2024 collapses everything into a CORE_TRAITS_TABLE markdown pipe-table)
// and the feature lists themselves diverge significantly (2024 introduces
// Weapon Mastery, Brutal Strike, Epic Boon; 5.1 has Brutal Critical,
// Primal Path subclass at L3 vs Barbarian Subclass in 2024). We emit one
// ClassResult per (class, edition) with edition-suffixed keys.
//
// Subclasses (entries with subclass_of !== null) are filtered out — they
// belong in the separate subclasses.json catalog and aren't yet imported
// by this script.

const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', '..', '..', 'vendor', 'srd', 'open5e', 'classes.json');
const OUT = path.join(__dirname, '..', '..', '..', 'packages', 'content', 'src', 'srd', 'data', 'classes.json');

const DOC_TO_VERSION = {
  'srd-2014': 'SRD_5.1',
  'srd-2024': 'SRD_2.0',
};

const VERSION_TO_SLUG = {
  'SRD_5.1': '5-1',
  'SRD_2.0': '2-0',
};

const HIT_DIE_MAP = { D6: 6, D8: 8, D10: 10, D12: 12 };

const ABILITY_SHORT = {
  strength: 'Strength', dexterity: 'Dexterity', constitution: 'Constitution',
  intelligence: 'Intelligence', wisdom: 'Wisdom', charisma: 'Charisma',
};

const SPELLCASTING_ABILITY_BY_CLASS = {
  // Open5e ships caster_type (NONE/FULL/HALF/THIRD/PACT) but not the
  // ability — derive from class name. (Subclasses like Eldritch Knight
  // would need a separate map but we filter subclasses out.)
  Bard: 'Charisma', Cleric: 'Wisdom', Druid: 'Wisdom',
  Paladin: 'Charisma', Ranger: 'Wisdom', Sorcerer: 'Charisma',
  Warlock: 'Charisma', Wizard: 'Intelligence',
};

// Multiclass prerequisites and proficiencies per the SRD 2024 PHB
// multiclassing table. Open5e doesn't ship multiclass data, so we
// hand-curate it. The table is identical between SRD 5.1 and 2024 except
// for: Druid 5.1 had no shield proficiency carve-out; Ranger 5.1 grants
// only the leather-light/no-tool carve-out (5.2 grants Light armor, Martial
// weapons, one skill). Where the editions diverge we record both forms and
// the transform picks the right one by edition.
//
// Ability score prereqs use SRD wording — "Strength 13" or "Strength 13 and
// Charisma 13" (Paladin needs both STR and CHA).
const MULTICLASS_BY_CLASS = {
  Barbarian: {
    prerequisite: 'Strength 13',
    armor:    ['Shields'],
    weapons:  ['Martial weapons'],
  },
  Bard: {
    prerequisite: 'Charisma 13',
    armor: ['Light armor'],
    skills: { count: 1, from: ['Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception', 'History', 'Insight', 'Intimidation', 'Investigation', 'Medicine', 'Nature', 'Perception', 'Performance', 'Persuasion', 'Religion', 'Sleight of Hand', 'Stealth', 'Survival'] },
  },
  Cleric: {
    prerequisite: 'Wisdom 13',
    armor: ['Light armor', 'Medium armor', 'Shields'],
  },
  Druid: {
    prerequisite: 'Wisdom 13',
    // 5.1: Light armor, Medium armor (non-metal). 2024: adds Shields (non-metal).
    armor: ['Light armor', 'Medium armor (non-metal)'],
  },
  Fighter: {
    prerequisite: 'Strength 13 or Dexterity 13',
    armor: ['Light armor', 'Medium armor', 'Shields'],
    weapons: ['Simple weapons', 'Martial weapons'],
  },
  Monk: {
    prerequisite: 'Dexterity 13 and Wisdom 13',
    weapons: ['Simple weapons', 'Martial weapons that have the Light property'],
  },
  Paladin: {
    prerequisite: 'Strength 13 and Charisma 13',
    armor: ['Light armor', 'Medium armor', 'Shields'],
    weapons: ['Simple weapons', 'Martial weapons'],
  },
  Ranger: {
    prerequisite: 'Dexterity 13 and Wisdom 13',
    armor: ['Light armor', 'Medium armor', 'Shields'],
    weapons: ['Simple weapons', 'Martial weapons'],
    skills: { count: 1, from: ['Animal Handling', 'Athletics', 'Insight', 'Investigation', 'Nature', 'Perception', 'Stealth', 'Survival'] },
  },
  Rogue: {
    prerequisite: 'Dexterity 13',
    armor: ['Light armor'],
    tools: ["Thieves' tools"],
    skills: { count: 1, from: ['Acrobatics', 'Athletics', 'Deception', 'Insight', 'Intimidation', 'Investigation', 'Perception', 'Performance', 'Persuasion', 'Sleight of Hand', 'Stealth'] },
  },
  Sorcerer: {
    prerequisite: 'Charisma 13',
    // No proficiencies gained on multiclass for Sorcerer per SRD.
  },
  Warlock: {
    prerequisite: 'Charisma 13',
    armor: ['Light armor'],
    weapons: ['Simple weapons'],
  },
  Wizard: {
    prerequisite: 'Intelligence 13',
    // No proficiencies gained on multiclass for Wizard per SRD.
  },
};

function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeDescription(s) {
  if (!s) return '';
  return String(s)
    .replace(/\r\n?/g, '\n')
    .replace(/^[\t ]*[*\-][\t ]+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Strip markdown bold/emphasis for inline label values. */
function stripMd(s) {
  return String(s ?? '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

/** "Light armor, medium armor, shields" → ["Light armor", "Medium armor", "Shields"] */
function splitProficiencyList(s) {
  if (!s) return [];
  // Treat "None" / "—" as an empty list.
  if (/^(none|—|-)$/i.test(String(s).trim())) return [];
  return String(s)
    .split(/[,;]|\band\b/)
    .map((p) => p.trim())
    .filter(Boolean)
    // Filter out stray "None" tokens left after splitting (Open5e sometimes
    // ships "Tools: None" as a list item).
    .filter((p) => !/^none$/i.test(p))
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1));
}

/**
 * Parse the 2024 `CORE_TRAITS_TABLE` markdown into a flat label→value map.
 * Format:
 *   |||
 *   |---|---|
 *   |Primary Ability|Strength|
 *   |Hit Point Die|D12 per Barbarian level|
 *   ...
 */
function parseCoreTraitsTable(desc) {
  if (!desc) return {};
  const map = {};
  const lines = desc.split(/\n/);
  for (const line of lines) {
    const m = line.match(/^\|\s*([^|]+?)\s*\|\s*(.+?)\s*\|\s*$/);
    if (!m) continue;
    const label = m[1].trim();
    const value = m[2].trim();
    // Skip the header divider row '---|---'
    if (/^-+$/.test(label)) continue;
    if (label.length === 0) continue;
    map[label.toLowerCase()] = value;
  }
  return map;
}

/**
 * Parse the 5.1 `PROFICIENCIES` desc (bold-labeled lines):
 *   **Armor:** Light armor, medium armor, shields
 *   **Weapons:** ...
 *   **Tools:** None
 *   **Saving Throws:** Strength, Constitution
 *   **Skills:** Choose two from Animal Handling, Athletics, ...
 */
function parseProficienciesDesc(desc) {
  if (!desc) return {};
  const map = {};
  const lines = String(desc).replace(/\r\n?/g, '\n').split(/\n/);
  for (const line of lines) {
    const m = line.match(/^\*\*([^*:]+):\*\*\s*(.+)$/);
    if (!m) continue;
    map[m[1].trim().toLowerCase()] = m[2].trim();
  }
  return map;
}

/**
 * Parse "Choose 2: Arcana, History, …" or "Choose two from Animal Handling, …"
 * into { count, from }.
 */
function parseSkillChoices(value) {
  if (!value) return { count: 0, from: [] };
  // Extract count (digit, or word like "two")
  const wordToNum = { one: 1, two: 2, three: 3, four: 4, five: 5 };
  const countMatch = value.match(/(\d+)/);
  let count = 0;
  if (countMatch) count = parseInt(countMatch[1], 10);
  else {
    const lower = value.toLowerCase();
    for (const [w, n] of Object.entries(wordToNum)) if (lower.includes(`choose ${w}`)) { count = n; break; }
  }
  // Skill names follow the colon (or "from") and are comma-separated, with
  // a possible "or" before the last entry.
  const after = value.replace(/^.*?(?::|from)\s*/i, '');
  const list = after
    .replace(/\bor\b/gi, ',')
    .split(/[,;]/)
    .map((s) => s.replace(/[.\s]+$/, '').trim())
    .filter(Boolean);
  // Capitalize each skill name canonically. Open5e ships a known typo
  // ("In sight" instead of "Insight") for the 2024 Wizard — patch it here.
  const TYPO_FIXES = { 'In Sight': 'Insight' };
  const from = list
    .map((s) => s.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' '))
    .map((s) => TYPO_FIXES[s] ?? s);
  return { count, from };
}

/**
 * Open5e ships starting equipment as either:
 *   2024: a single line inside CORE_TRAITS_TABLE — "Choose A or B: (A) … or (B) … GP"
 *   5.1: a STARTING_EQUIPMENT feature with a multi-bullet description.
 * We capture the raw text in a single label option for now; richer parsing
 * (item lists, gold alternatives) is left for a future pass — the existing
 * seed-curated entries already include hand-structured arrays we won't
 * overwrite if upstream is too messy to parse.
 */
function parseStartingEquipment2024(line) {
  if (!line) return undefined;
  // "Choose A or B: (A) … and 15 GP; or (B) 75 GP"
  // Items themselves can contain parens (e.g. "Arcane Focus (Quarterstaff)"),
  // so we split on the option-label pattern (`; or (B)`) rather than trying
  // to balance parens. Strip a leading "Choose X or Y:" preamble first, then
  // split by `; or (X) ` boundaries while preserving each label.
  const cleaned = String(line)
    .replace(/^choose\s+[A-D](?:\s+or\s+[A-D])+\s*:\s*/i, '')
    .trim();
  // Find each `(X) ` label position.
  const labelRe = /\(([A-D])\)\s*/g;
  /** @type {Array<{ label: string; start: number; bodyStart: number }>} */
  const positions = [];
  let m;
  while ((m = labelRe.exec(cleaned)) !== null) {
    positions.push({ label: m[1], start: m.index, bodyStart: m.index + m[0].length });
  }
  if (positions.length === 0) return [{ label: 'A', items: [stripMd(cleaned)] }];

  const opts = positions.map((pos, i) => {
    const next = positions[i + 1]?.start ?? cleaned.length;
    let text = cleaned.slice(pos.bodyStart, next);
    // Strip any trailing "; or " separator that ran up to the next label.
    text = text.replace(/[;,.]?\s*or\s*$/i, '').replace(/[;.\s]+$/, '').trim();
    const goldOnly = text.match(/^(\d+)\s*GP$/i);
    if (goldOnly) {
      return { label: pos.label, gold: { amount: parseInt(goldOnly[1], 10), currency: 'gp' } };
    }
    // Items: split on top-level commas (commas not inside parens).
    const items = splitTopLevelCommas(text)
      .map((s) => s.trim().replace(/^and\s+/i, '').trim())
      .filter(Boolean);
    return { label: pos.label, items };
  });
  return opts;
}

/** Split on commas that are not nested inside parentheses. */
function splitTopLevelCommas(s) {
  const out = [];
  let depth = 0;
  let buf = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      out.push(buf);
      buf = '';
    } else {
      buf += ch;
    }
  }
  if (buf.length > 0) out.push(buf);
  return out;
}

function parseStartingEquipment51(desc) {
  if (!desc) return undefined;
  // "* (a) a greataxe or (b) any martial melee weapon\n* ..."
  // Rather than over-engineer parsing, dump the cleaned bullet lines as a
  // single "Choose:" option list — UI consumers can render as-is.
  const lines = String(desc)
    .replace(/\r\n?/g, '\n')
    .split(/\n/)
    .map((l) => l.replace(/^\s*[*\-]\s*/, '').trim())
    .filter((l) => l && !/^you start/i.test(l));
  if (lines.length === 0) return undefined;
  return [{ label: 'A', items: lines }];
}

/**
 * Build the progression table from PROFICIENCY_BONUS + CLASS_TABLE_DATA
 * features. Each such feature carries a `data_for_class_table` array of
 * { level, column_value } records — possibly out of order, possibly sparse.
 *
 * Returns { columns, table } where:
 *   columns = [{ key: 'profBonus', label: 'Prof. Bonus' }, ...]
 *   table   = [{ level: 1, values: { profBonus: '+2', rages: 2, ... } }, ...]
 *
 * Levels with no data for a column get '—'. We always produce 20 rows so
 * the UI can render a uniform table.
 */
function buildProgression(features) {
  const tableFeats = features.filter(
    (f) => f.feature_type === 'PROFICIENCY_BONUS'
      || f.feature_type === 'CLASS_TABLE_DATA'
      || f.feature_type === 'SPELL_SLOTS',
  );
  // 5.1 ships some progression columns as CLASS_LEVEL_FEATURE with empty
  // gained_at (Rages, Rage Damage, Sneak Attack dice). Detect them
  // heuristically: feature_type=CLASS_LEVEL_FEATURE, gained_at empty,
  // and the desc contains "[Column data]" placeholder OR data_for_class_table
  // is populated.
  const ambiguousColumns = features.filter(
    (f) => f.feature_type === 'CLASS_LEVEL_FEATURE'
      && (!f.gained_at || f.gained_at.length === 0)
      && Array.isArray(f.data_for_class_table) && f.data_for_class_table.length > 0,
  );
  const allCols = [...tableFeats, ...ambiguousColumns];
  if (allCols.length === 0) return { columns: undefined, table: undefined };

  // Stable sort by category, mirroring the SRD class-table reading order:
  //   Prof Bonus → CLASS_TABLE_DATA / ambiguous columns (Cantrips, Prepared
  //   Spells, Rages, Sneak Attack) → SPELL_SLOTS (1st through 9th).
  // Within SPELL_SLOTS we re-sort by ordinal because Open5e doesn't
  // guarantee a stable order across the slot features.
  const categoryRank = (f) => {
    if (f.feature_type === 'PROFICIENCY_BONUS') return 0;
    if (f.feature_type === 'SPELL_SLOTS') return 2;
    return 1;
  };
  allCols.sort((a, b) => {
    const c = categoryRank(a) - categoryRank(b);
    if (c !== 0) return c;
    if (a.feature_type === 'SPELL_SLOTS' && b.feature_type === 'SPELL_SLOTS') {
      return spellSlotOrdinal(a.name) - spellSlotOrdinal(b.name);
    }
    return 0;
  });

  const columns = allCols.map((f) => ({
    key: columnKeyFor(f.name),
    label: shortColumnLabel(f.name),
  }));

  const table = [];
  for (let level = 1; level <= 20; level++) {
    const values = {};
    for (let i = 0; i < allCols.length; i++) {
      const col = allCols[i];
      const colKey = columns[i].key;
      const row = (col.data_for_class_table ?? []).find((r) => r.level === level);
      values[colKey] = row?.column_value ?? '—';
    }
    table.push({ level, values });
  }
  return { columns, table };
}

/** Stable JS-friendly key from a column display name. */
function columnKeyFor(name) {
  // "Proficiency Bonus" → "profBonus"; "Rage Damage" → "rageDamage"
  return String(name)
    .toLowerCase()
    .replace(/proficiency bonus/, 'prof bonus')
    .split(/\s+/)
    .map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('')
    .replace(/[^a-z0-9]+/gi, '');
}

/** Friendly compact label for the column header. */
function shortColumnLabel(name) {
  if (/^proficiency bonus$/i.test(name)) return 'Prof. Bonus';
  if (/^rage damage$/i.test(name)) return 'Rage Dmg';
  return name;
}

/** Map "1st" / "2nd" / ... "9th" to its ordinal for stable column ordering. */
function spellSlotOrdinal(name) {
  const m = String(name).match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : 99;
}

/**
 * Build the leveled feature list from CLASS_LEVEL_FEATURE entries.
 * Expand multi-level features (ASI at 4/8/12/16) into one row per (level,
 * feature) pair so the UI can render a per-level progression list.
 */
function buildFeatures(features) {
  /** @type {Array<{ level: number; name: string; description?: string; parentName?: string }>} */
  const out = [];
  for (const f of features) {
    if (f.feature_type !== 'CLASS_LEVEL_FEATURE') continue;
    const levels = (f.gained_at ?? []).map((g) => g.level).filter((l) => typeof l === 'number');
    if (levels.length === 0) continue; // skip ambiguous "no level" entries (Rages, Rage Damage)
    for (const lvl of levels) {
      const fullDesc = normalizeDescription(f.desc);
      const split = splitSubOptions(fullDesc);
      out.push({ level: lvl, name: f.name, description: split.parentDesc });
      for (const sub of split.children) {
        out.push({ level: lvl, name: sub.name, description: sub.desc, parentName: f.name });
      }
    }
  }
  // Stable sort: by level first, then preserving authored order so
  // children stay grouped under their parent (the post-pass in the
  // renderer also enforces this, but we keep the JSON tidy).
  out.sort((a, b) => a.level - b.level);
  return out.length > 0 ? out : undefined;
}

/**
 * Open5e ships sub-options of a feature as `**Name.** body` paragraphs
 * appended to the parent feature's description (e.g. Cleric's Divine
 * Order embeds `**Protector.** ...` and `**Thaumaturge.** ...`). The
 * client used to render these as inline bold text inside one paragraph;
 * splitting them into discrete child entries lets the modal indent them
 * under the parent the same way the imported-content path does for
 * 5e.tools refClassFeature blocks.
 *
 * Detection rule: only split when the parent description contains a
 * paragraph break followed by `**Name.**` and at least one other
 * `**Name.**` paragraph follows — a single `**Foo.**` mid-paragraph is
 * almost always inline emphasis (e.g. spell names), not a sub-option.
 * The parent keeps its non-`**Name.**` lead-in prose; children take
 * the body that follows their bold label up to the next label.
 */
function splitSubOptions(desc) {
  if (!desc || typeof desc !== 'string') return { parentDesc: desc, children: [] };
  // Find the first paragraph break that's immediately followed by `**Foo.**`.
  const splitMatch = desc.match(/\n\n(?=\*\*[^*\n]+?\.\*\*\s)/);
  if (!splitMatch || typeof splitMatch.index !== 'number') {
    return { parentDesc: desc, children: [] };
  }
  const head = desc.slice(0, splitMatch.index).trim();
  const tail = desc.slice(splitMatch.index + 2);
  // Pull out every `**Name.** body` paragraph from the tail. The body
  // runs until the next `\n\n**Name.**` boundary or end of string.
  const subRe = /\*\*([^*\n]+?)\.\*\*\s+([\s\S]+?)(?=\n\n\*\*[^*\n]+?\.\*\*\s|$)/g;
  const children = [];
  let m;
  while ((m = subRe.exec(tail)) !== null) {
    const name = m[1].trim();
    const body = m[2].trim();
    if (name && body) children.push({ name, desc: body });
  }
  // Need ≥ 2 children to confidently treat this as a sub-option list.
  // A single `**Name.**` is more likely inline emphasis (spell name,
  // term definition) than a real sub-feature, so we leave the
  // description untouched in that case.
  if (children.length < 2) return { parentDesc: desc, children: [] };
  return { parentDesc: head, children };
}

/**
 * Detect the subclass-unlock level: the level at which the class gains a
 * feature whose name matches /subclass|primal path|sacred oath|martial archetype|
 * monastic tradition|otherworldly patron|.../. Falls back to 3 (the default
 * for most classes in both editions).
 */
function detectSubclassUnlockLevel(features) {
  const subPatterns = [
    /subclass/i, /primal path/i, /sacred oath/i, /martial archetype/i,
    /monastic tradition/i, /otherworldly patron/i, /bard college/i,
    /druid circle/i, /sorcerous origin/i, /arcane tradition/i,
    /divine domain/i, /ranger archetype/i, /roguish archetype/i,
  ];
  for (const f of features) {
    if (f.feature_type !== 'CLASS_LEVEL_FEATURE') continue;
    if (!subPatterns.some((re) => re.test(f.name))) continue;
    const lvl = f.gained_at?.[0]?.level;
    if (typeof lvl === 'number') return lvl;
  }
  return 3;
}

/**
 * Hardcoded subclass-feature levels per class per edition. Open5e's
 * `/classes/` payload doesn't expose these as discrete events, so we
 * encode the canonical 5e schedule. The class table renders "Subclass
 * feature" at each level so rows like Barbarian L6/10/14 don't render as
 * blank dashes when the actual feature lives in the chosen subclass.
 *
 * Editions split where they diverge: 5.1 unlocked subclass at L1 for
 * Cleric/Sorcerer/Warlock and L2 for Druid/Wizard; 2024 standardized to
 * L3 across the board.
 */
const SUBCLASS_FEATURE_LEVELS = {
  'SRD_5.1': {
    Barbarian: [3, 6, 10, 14],
    Bard:      [3, 6, 14],
    Cleric:    [1, 6, 17],
    Druid:     [2, 6, 10, 14],
    Fighter:   [3, 7, 10, 15, 18],
    Monk:      [3, 6, 11, 17],
    Paladin:   [3, 7, 15, 20],
    Ranger:    [3, 7, 11, 15],
    Rogue:     [3, 9, 13, 17],
    Sorcerer:  [1, 6, 14, 18],
    Warlock:   [1, 6, 10, 14],
    Wizard:    [2, 6, 10, 14],
  },
  'SRD_2.0': {
    Barbarian: [3, 6, 10, 14],
    Bard:      [3, 6, 14],
    Cleric:    [3, 6, 17],
    Druid:     [3, 6, 10, 14],
    Fighter:   [3, 7, 10, 15, 18],
    Monk:      [3, 6, 11, 17],
    Paladin:   [3, 7, 15, 20],
    Ranger:    [3, 7, 11, 15],
    Rogue:     [3, 9, 13, 17],
    Sorcerer:  [3, 6, 14, 18],
    Warlock:   [3, 6, 10, 14],
    Wizard:    [3, 6, 10, 14],
  },
};

function transformOne(cls) {
  // Skip subclasses — they live in subclasses.json.
  if (cls.subclass_of) return null;

  const docKey = cls.document?.key;
  const srdVersion = DOC_TO_VERSION[docKey];
  if (!srdVersion) return null;

  // Top-level fields from Open5e's structured data
  const hitDie = HIT_DIE_MAP[cls.hit_dice] ?? 8;
  const savingThrows = (cls.saving_throws ?? []).map((s) => s.name).filter(Boolean);
  const primaryAbility = (cls.primary_abilities ?? []).map((a) => ABILITY_SHORT[a] ?? a).filter(Boolean);

  // Default fields from feature parsing
  let armorProficiencies = [];
  let weaponProficiencies = [];
  let toolProficiencies = [];
  let skillChoices = { count: 0, from: [] };
  let startingEquipment;

  // Try the 2024 markdown table first
  const coreFeat = cls.features.find((f) => f.feature_type === 'CORE_TRAITS_TABLE');
  if (coreFeat) {
    const map = parseCoreTraitsTable(coreFeat.desc);
    armorProficiencies = splitProficiencyList(map['armor training'] || map['armor proficiencies']);
    weaponProficiencies = splitProficiencyList(map['weapon proficiencies']);
    toolProficiencies = splitProficiencyList(map['tool proficiencies']);
    skillChoices = parseSkillChoices(map['skill proficiencies']);
    if (map['starting equipment']) {
      startingEquipment = parseStartingEquipment2024(map['starting equipment']);
    }
    // primary ability fallback if endpoint didn't ship it
    if (primaryAbility.length === 0 && map['primary ability']) {
      primaryAbility.push(...splitProficiencyList(map['primary ability']));
    }
  }

  // Fall back / supplement from 5.1 PROFICIENCIES
  const profFeat = cls.features.find((f) => f.feature_type === 'PROFICIENCIES');
  if (profFeat) {
    const map = parseProficienciesDesc(profFeat.desc);
    if (armorProficiencies.length === 0 && map['armor']) armorProficiencies = splitProficiencyList(map['armor']);
    if (weaponProficiencies.length === 0 && map['weapons']) weaponProficiencies = splitProficiencyList(map['weapons']);
    if (toolProficiencies.length === 0 && map['tools'] && !/^none$/i.test(map['tools'].trim())) {
      toolProficiencies = splitProficiencyList(map['tools']);
    }
    if (skillChoices.count === 0 && map['skills']) {
      skillChoices = parseSkillChoices(map['skills']);
    }
    if (savingThrows.length === 0 && map['saving throws']) {
      savingThrows.push(...splitProficiencyList(map['saving throws']));
    }
  }

  // 5.1 starting equipment (when 2024 didn't already populate)
  if (!startingEquipment) {
    const startFeat = cls.features.find((f) => f.feature_type === 'STARTING_EQUIPMENT');
    if (startFeat) startingEquipment = parseStartingEquipment51(startFeat.desc);
  }

  const { columns, table } = buildProgression(cls.features);
  const features = buildFeatures(cls.features);
  const subclassUnlockLevel = detectSubclassUnlockLevel(cls.features);
  const subclassFeatureLevels = SUBCLASS_FEATURE_LEVELS[srdVersion]?.[cls.name];
  // Open5e ships `caster_type: null` for every 5.1 class (data gap upstream),
  // so we can't rely on it alone. Falling back to the classes that have a
  // known spellcasting ability — that's the canonical SRD list of casters.
  const isCaster = (cls.caster_type && cls.caster_type !== 'NONE') || !!SPELLCASTING_ABILITY_BY_CLASS[cls.name];
  const spellcasting = isCaster;
  const spellcastingAbility = isCaster ? (SPELLCASTING_ABILITY_BY_CLASS[cls.name] ?? null) : null;

  const slug = slugify(cls.name);
  const out = {
    key: `${slug}-srd-${VERSION_TO_SLUG[srdVersion]}`,
    name: cls.name,
    type: 'class',
    tier: 'srd',
    system: 'dnd5e',
    srdVersions: [srdVersion],
    description: normalizeDescription(cls.desc),
    hitDie,
    primaryAbility,
    savingThrows,
    armorProficiencies,
    weaponProficiencies,
    toolProficiencies,
    skillChoices,
    spellcasting: !!spellcasting,
    spellcastingAbility,
    subclassUnlockLevel,
    data: {},
  };

  if (startingEquipment && startingEquipment.length > 0) out.startingEquipment = startingEquipment;
  if (columns) out.progressionColumns = columns;
  if (table) out.progressionTable = table;
  if (features) out.features = features;
  if (subclassFeatureLevels) out.subclassFeatureLevels = subclassFeatureLevels;

  const mc = MULTICLASS_BY_CLASS[cls.name];
  if (mc) {
    out.multiclassPrerequisite = mc.prerequisite;
    const profs = {};
    if (mc.armor) profs.armor = mc.armor;
    if (mc.weapons) profs.weapons = mc.weapons;
    if (mc.tools) profs.tools = mc.tools;
    if (mc.savingThrows) profs.savingThrows = mc.savingThrows;
    if (mc.skills) profs.skills = mc.skills;
    if (Object.keys(profs).length > 0) out.multiclassProficiencies = profs;
  }

  return out;
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`Snapshot missing: ${SRC}`);
    console.error(`Run \`node scripts/import-srd/fetch-open5e.js classes\` first.`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const out = raw.map(transformOne).filter(Boolean);

  // Stable sort: by name, then edition (5.1 before 2.0).
  out.sort((a, b) =>
    a.name.localeCompare(b.name) ||
    a.srdVersions[0].localeCompare(b.srdVersions[0]),
  );

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`Wrote ${out.length} classes → ${path.relative(process.cwd(), OUT)}`);

  const byVersion = out.reduce((acc, c) => {
    const k = c.srdVersions[0];
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  console.log('  By edition:', byVersion);
  console.log(`  Distinct names: ${new Set(out.map((c) => c.name)).size}`);

  // Spot-check feature counts
  const counts = out.map((c) => `${c.name} ${c.srdVersions[0]}: ${c.features?.length ?? 0} features, ${c.progressionColumns?.length ?? 0} cols`);
  counts.slice(0, 5).forEach((l) => console.log('  ', l));
}

main();
