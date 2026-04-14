# Feature 1: Character Creation & Sheet Manager

> Legal constraints relevant to this feature: see [Legal Constraints](../legal.md). Key points: SRD content requires CC-BY 4.0 attribution wherever displayed. User-uploaded content is parsed locally only and never transmitted. Character state (stats, HP, slots) may be stored and synced server-side. Spell descriptions from user uploads resolve locally — only content keys sync.

---

## Build Status (MVP)

| Phase | Status | Summary |
|---|---|---|
| Phase 1 — Content Foundation | ✅ Done | SRD seed data + ContentResolver. 19 species, 12 classes, 14 backgrounds in `packages/content/src/srd/data/`. |
| Phase 2 — Character Data Shape | ✅ Done | `Dnd5eStats` + `Dnd5eResources` interfaces; `getMyCharacters()` API; `useCharacterDraftStore`. |
| Phase 3 — Creation Wizard | ✅ Done | 6-step wizard. Ability score methods: Roll Dice (4d6 drop lowest), Standard Array, Point Buy, Manual. `campaign_id` nullable. Commit: `958a3b6`. |
| Phase 4 — Character Sheet | ✅ Done | Tabbed sheet (Overview + Combat). Live HP, conditions (14 SRD + exhaustion 0–6), skill proficiency indicators. |
| Phase 5 — Campaign Linking | ⬜ Up next | Character list screen + link to `campaign_members.character_id`. |

**MVP IN:** US-101–107, US-201–202, US-204, campaign linking
**MVP DEFERRED:** US-106 (equipment), US-203 (spell slots), US-205 (hit dice), US-206 (class resources), Epics 3–6

---

## Content Architecture

Three content tiers, all queried through `ContentResolver`. The character data model stores **content references** (key + sourceId), not description text. Descriptions are resolved at render time from whichever tier holds that content.

**Tier 1 — Bundled SRD:** Ships with the app. JSON seed files in the repo. CC-BY 4.0 attribution required.
**Tier 2 — User-Uploaded:** Parsed from local PDFs. Never transmitted to server. Content keys reference this tier.
**Tier 3 — Homebrew:** Authored in-app. User-owned. Stored and synced server-side.

### Built-In SRD Content

**Species (SRD 2.0 / 2024):** Aasimar, Dragonborn, Dwarf, Elf, Gnome, Goliath, Halfling, Human, Orc, Tiefling
**Species (SRD 5.1 / legacy):** Dwarf, Elf, Halfling, Human, Dragonborn, Gnome, Half-Elf, Half-Orc, Tiefling
**Classes (12):** Barbarian, Bard, Cleric, Druid, Fighter, Monk, Paladin, Ranger, Rogue, Sorcerer, Warlock, Wizard
**Subclasses (SRD 2.0, 1 per class):** Path of the Berserker, College of Lore, Life Domain, Circle of the Land, Champion, Way of the Open Hand, Oath of Devotion, Hunter, Thief, Wild Magic, The Fiend, School of Evocation
**Backgrounds (SRD 2.0 / 2024):** Acolyte, Artisan, Charlatan, Criminal, Entertainer, Farmer, Guard, Guide, Hermit, Merchant, Noble, Scribe, Soldier, Wayfarer
**Ability Score Methods:** Standard Array (15/14/13/12/10/8), Point Buy (27 pts, 8–15 pre-bonus), Manual

---

## Data Models

### Character
```typescript
Character {
  id: uuid
  userId: string
  name: string
  level: int (1–20)
  experiencePoints: int
  rulesetVersion: "SRD_5.1" | "SRD_2.0" | "CUSTOM"
  species: ContentRef
  background: ContentRef
  classes: ClassEntry[]
  abilityScores: AbilityScores
  hitPoints: HitPointBlock
  proficiencies: Proficiencies
  equipment: EquipmentItem[]
  spellbook: SpellbookBlock | null
  features: CharacterFeature[]
  conditions: Condition[]
  exhaustionLevel: int (0–6)
  currency: Currency
  personalityTraits: string
  ideals: string
  bonds: string
  flaws: string
  alignment: AlignmentKey
  notes: string
}

ContentRef { key: string, sourceId: string }

ClassEntry { classRef: ContentRef, level: int, subclassRef: ContentRef | null, hitDiceUsed: int }

AbilityScores { strength, dexterity, constitution, intelligence, wisdom, charisma: int }
// Derived: modifier = floor((score - 10) / 2)
// Derived: proficiencyBonus = ceil(level / 4) + 1

HitPointBlock {
  maximum: int
  current: int
  temporary: int
  deathSaveSuccesses: int (0–3)
  deathSaveFailures: int (0–3)
}

SpellbookBlock {
  spellcastingAbility: AbilityKey
  spellAttackBonus: int
  spellSaveDC: int   // 8 + profBonus + modifier
  spellsPrepared: ContentRef[]
  cantripsKnown: ContentRef[]
  slots: SpellSlotTracker  // slots[level] = { max, used }
  concentratingOn: ContentRef | null
}
```

---

## Epics & User Stories

### Epic 1 — Character Creation Wizard

**US-101 — Start a new character**
- "New Character" button on character list
- Player selects ruleset: SRD 5.1, SRD 2.0, or Custom
- Draft autosaved after each step, resumable
- Step progress indicator visible throughout

**US-102 — Choose a species**
- Bundled SRD species filtered to selected ruleset
- User-library species surfaced if available locally (labelled "From your library")
- Species traits applied automatically to derived stats
- CC-BY attribution footer on SRD species
- `ContentResolver.getSpecies(key, sourceId)` — no species logic hardcoded in UI

**US-103 — Choose a background**
- Bundled SRD backgrounds shown; user-library surfaces if available
- SRD 2.0 backgrounds grant: 2 skill proficiencies, 1 tool/language, 2 ability score increases (+1/+1 or +2/+0), 1 starting feat
- Player selects which ability scores receive increases within allowed options
- Proficiency stacking prevented with class-granted proficiencies

**US-104 — Choose a class**
- All 12 SRD classes shown; user-library surfaces if available
- Shows hit die, primary ability, saving throws, level-1 features
- Skills chosen from class's allowed skill list
- Subclass deferred to class's unlock level (level 1 for Cleric/Sorcerer/Warlock, level 3 for others)
- Spellcasting classes prompt for starting cantrips and prepared spells
- Class progression tables in structured JSON at `data/srd/classes/[classKey].json` — never hardcoded in logic

**US-105 — Assign ability scores**
- Standard Array: assign 15/14/13/12/10/8; each value assignable once
- Point Buy: 27 points, scores 8–15 pre-bonus. Cost: 8=0, 9=1, 10=2, 11=3, 12=4, 13=5, 14=7, 15=9
- Manual: any value 1–20 with out-of-range warning
- Species and background ASI shown as breakdown (base + bonuses = total)
- Derived modifiers update live

**US-106 — Select starting equipment** *(Deferred post-MVP)*
- Starting equipment options from class and background
- Choice trees (e.g., "a martial weapon or two simple weapons")
- Alternative gold option replaces equipment selection

**US-107 — Review and finalize**
- Summary: species, background, class, ability scores, HP, AC, proficiency bonus, saves, skills, equipment, features
- CC-BY attribution notice for any SRD content used
- Invalid state flagged inline; "Finish" disabled until resolved
- Can navigate back to any prior step
- On "Finish": saves character (state to server, content references only — no source text), takes player to sheet view

---

### Epic 2 — Character Sheet View

**US-201 — View the full character sheet**
- Tabs: Overview, Abilities & Skills, Combat, Spells (if applicable), Equipment, Features & Traits, Notes
- All derived values auto-calculated — never manually entered
- If description can't be resolved (Tier 2 source unavailable on this device): *"Description available when source is loaded on this device."*
- Fully responsive on mobile

**US-202 — Track hit points**
- Tapping HP block: Damage / Heal / Set
- Damage reduces temp HP first; can't exceed max HP
- At 0 HP: death saves activate (3 successes = stabilized, 3 failures = dead)
- All HP changes persist server-side immediately

**US-203 — Track spell slots** *(Deferred post-MVP)*
- Pip indicators per slot level (used/max)
- Short rest recovers Warlock Pact Magic slots only
- Long rest recovers all slots
- Slot state syncs to server

**US-204 — Track conditions and exhaustion**
- All SRD conditions: Blinded, Charmed, Deafened, Exhaustion, Frightened, Grappled, Incapacitated, Invisible, Paralyzed, Petrified, Poisoned, Prone, Restrained, Stunned, Unconscious
- Rules summary tooltip on each condition (SRD text served from backend)
- Exhaustion tracked as level 0–6 with per-level effect
- Active conditions shown prominently on Overview tab
- Conditions removable individually

**US-205 — Track hit dice** *(Deferred post-MVP)*
- Shows total available by die type
- "Spend Hit Die" deducts one die, shows roll result (die + CON mod) as healing
- Long rest recovers half total hit dice (rounded up)

**US-206 — Track class-specific resources** *(Deferred post-MVP)*
- Pip tracker or numeric counter per class resource
- Resets on correct rest type per SRD rules
- Required: Rage (Barbarian), Bardic Inspiration, Channel Divinity, Wild Shape, Second Wind + Action Surge, Ki, Pact Magic slots, Sorcery Points, Sneak Attack (passive)

---

### Epic 3 — Leveling Up

**US-301 — Level up**
- Manual trigger (no XP gate required)
- Flow: new class features → HP increase → spell selections → subclass (if unlock level) → ASI/feat
- HP: roll class hit die or take average (floor(die/2) + 1) + CON mod
- Proficiency bonus recalculates; all derived stats update

**US-302 — ASI or feat**
- ASI: +2 to one or +1/+1 to two abilities; no score may exceed 20
- Feat: select from SRD feat list (plus user-library feats); prerequisites validated

**US-303 — Select a subclass**
- Triggered at class's subclass unlock level
- SRD subclasses shown; user-library surfaces if available locally
- One subclass per class

---

### Epic 4 — Spell Management

**US-401 — Select spells (creation and level-up)**
- Prepared casters (Cleric, Druid, Paladin, Wizard): prepared count = spellcasting mod + class level
- Known casters (Bard, Ranger, Sorcerer, Warlock): locked known list; swap 1 on level-up
- Search and filter by level, school, text

**US-402 — View and reference the spellbook**
- Spells tab: cantrips first, then by slot level
- Collapsed summary row; expanding shows full description from content layer
- Concentration spells marked "C", ritual "R"
- Active concentration spell pinned to top with "End Concentration" button
- CC-BY attribution when SRD content is displayed

---

### Epic 5 — Multi-Character Management

**US-501 — Manage multiple characters** — Character list, each card shows name/class/level/species/ruleset/last updated. No enforced limit.
**US-502 — Duplicate a character** — Copy with " (Copy)" appended, fully independent.
**US-503 — Share a character sheet** — Read-only URL. Character state shown; user-library descriptions NOT included. URL revocable.

---

### Epic 6 — Multiclassing

**US-601 — Add a second class** — Available during level-up (not initial creation). Total level = sum of all class levels. Multiclassing prerequisites checked per SRD. Multiclass spell slot table from SRD caster level.

---

## Out of Scope
- Homebrew authoring (Feature 3) — but `ContentRef` with `sourceId: "homebrew"` must work from day one
- PDF parsing pipeline (Feature 3) — architecture supports querying local content from day one
- Real-time party sync (Feature 4)
- DM-facing tools (Feature 5)
- Magic item attunement, dice rolling, character import/export

---

## Suggested Build Order
1. `ContentRef` type + `ContentResolver` interface — foundation everything depends on
2. Seed static data: species, classes, subclasses, backgrounds, feats, spells (SRD 5.1 + 5.2 separately)
3. Data models + DB schema + REST API (CRUD for character state only — no content text)
4. Authentication
5. Character creation wizard (US-101 → US-107)
6. Character sheet view with derived stat calculation (US-201)
7. In-session tracking: HP, conditions (US-202, US-204)
8. Level-up flow (US-301 → US-303)
9. Spell management (US-401 → US-402)
10. Multi-character management (US-501 → US-503)
11. Multiclassing (US-601)
12. `ContentResolver` stub for local user content (so Feature 3 can plug in)
