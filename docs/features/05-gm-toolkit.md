# Feature 5: GM Toolkit

> Bestiary browser, encounter builder, and encounter template library. Pushes encounters into Feature 4's initiative tracker. SRD creature stat blocks require CC-BY 4.0 attribution. Creature stat blocks from user-uploaded sources resolve locally only. See [Legal Constraints](../legal.md).

**Status:** Post-MVP

---

## Three Surfaces
1. **Bestiary** — browsable, searchable creature compendium across all content tiers
2. **Encounter Builder** — workspace for assembling creatures, calculating difficulty, saving templates
3. **Session Integration** — handoff where a built encounter is pushed into Feature 4's initiative tracker

Turn-by-turn combat tracking (HP, turn advance, conditions during a live session) is in Feature 4 (US-401–405). This feature ends when an encounter is pushed to a session.

---

## Content Architecture

| Tier | Storage | Notes |
|---|---|---|
| SRD bundled | Backend CDN | CC-BY 4.0 attribution required |
| User-uploaded | Local device only | Mechanical fields (HP, AC, CR) may be used for encounter difficulty even when descriptions unavailable |
| Homebrew | Backend (Supabase) | May be shared with party via Feature 3 `isShared` flag |

When pushing an encounter to a session, only `ContentRef` + mechanical values (HP, AC) are transmitted. Description text from Tier 2 sources is never included.

---

## Data Models

### CreatureEntry
```typescript
CreatureEntry {
  key: string, sourceId: string, name: string,
  size: "tiny"|"small"|"medium"|"large"|"huge"|"gargantuan",
  type: string, tags: string[], alignment: string | null,
  armorClass: int, armorType: string | null,
  hitPoints: int, hitDice: string,
  speed: SpeedBlock,
  abilityScores: AbilityScores,
  savingThrows: Record<AbilityKey, int> | null,
  skills: Record<SkillKey, int> | null,
  damageVulnerabilities, damageResistances, damageImmunities: string[] | null,
  conditionImmunities: ConditionKey[] | null,
  senses: string, passivePerception: int, languages: string,
  challengeRating: string,   // "0", "1/8", "1/4", "1/2", "1"..."30"
  xp: int,
  traits, actions, bonusActions, reactions, legendaryActions: ActionBlock[],
  legendaryResistances: int | null,
  environments: string[] | null
}
// ActionBlock { name: string, description: string }
// Description for Tier 2 entries resolved locally only.
```

### CreatureFilter
```typescript
CreatureFilter {
  query: string | null,
  crMin: string | null, crMax: string | null,  // supports "1/4", "1/2", integers
  sizes: SizeKey[], types: string[], environments: string[], sources: string[],
  sortBy: "name" | "cr" | "type" | "size",
  sortDir: "asc" | "desc"
}
```

### EncounterTemplate
```typescript
EncounterTemplate {
  id: uuid, userId: string, campaignId: uuid | null,
  name: string, description: string | null, environment: string | null,
  tags: string[],
  creatureSlots: EncounterCreatureSlot[],
  difficultyConfig: DifficultyConfig,
  createdAt: timestamp, updatedAt: timestamp
}

EncounterCreatureSlot {
  id: uuid, creatureRef: ContentRef, quantity: int,
  customLabel: string | null, notes: string | null
}

DifficultyConfig {
  system: "dnd5e" | "custom",
  customDifficultyLabel: string | null
}

GMPartyConfig {
  id: uuid, userId: string, campaignId: uuid | null, label: string,
  members: GMPartyMember[]
}
GMPartyMember { label: string, level: int, characterId: uuid | null }
```

---

## Epics & User Stories

### Epic 1 — Bestiary Browser

**US-101 — Browse all available creatures**
- Accessible from main navigation independent of any session
- Default: all tiers; each card shows name, CR, size, type, source badge, HP summary
- Sortable by name (default), CR, type; virtualized for performance

**US-102 — Search creatures by keyword**
- Matches against name, type, tags; Tier 1 and 3 include trait/action name text
- Tier 2 search performed locally and merged; debounced ~300ms

**US-103 — Filter creatures**
- CR range (dual slider or two inputs; accepts "1/8", "1/4", "1/2" plus integers 1–30)
- Type (multi-select), size (multi-select), environment (multi-select), source (multi-select)
- Filters = intersection; active count shown; Tier 2 filtered locally before merge

**US-104 — View full creature stat block**
- Full stat block layout: name, size/type/alignment, AC, HP + hit dice, speed, ability scores + modifiers, saves, skills, immunities, senses, languages, CR + XP, traits, actions, bonus actions, reactions, legendary actions
- Ability modifiers always shown alongside raw scores
- Tier 2 unavailable fallback: *"Full stat block available when [source name] is loaded on this device."* Mechanical fields still shown if extracted.
- CC-BY 4.0 attribution footer for Tier 1 creatures (shared `AttributionFooter` component)
- "Add to Encounter" shortcut opens Encounter Builder with this creature pre-added

**US-105 — Browse by type**
- "By Type" view groups under headers: Aberration, Beast, Celestial, Construct, Dragon, Elemental, Fey, Fiend, Giant, Humanoid, Monstrosity, Ooze, Plant, Undead, plus custom types
- Within each type: sorted by CR ascending

---

### Epic 2 — Encounter Builder

**US-201 — Create a new encounter**
- "New Encounter" from GM Toolkit screen or from any creature detail view
- Two panels: creature picker (compact bestiary with search/filter) + encounter roster
- Adding same creature again increments quantity rather than creating duplicate
- Each roster entry: creature name, CR, quantity, source badge, remove button, +/− quantity, custom label field

**US-202 — Set party composition for difficulty**
- "Party" section in encounter workspace
- "Use campaign party" option auto-populates from campaign's linked characters at their current levels
- Manual `GMPartyConfig` — add members by level with a label, no linked character required
- Multiple preset `GMPartyConfig` instances saveable; selectable from dropdown

**US-203 — Calculate encounter difficulty**
- Auto-updates live as creatures added/removed or quantities changed
- **D&D 5e campaigns:**
  - Total XP = sum of creature XP × multiplier (×1 for 1, ×1.5 for 2, ×2 for 3–6, ×2.5 for 7–10, ×3 for 11–14, ×4 for 15+)
  - Adjusted XP compared against per-player Easy/Medium/Hard/Deadly thresholds summed across party (from SRD threshold table)
  - Difficulty badge: **Easy**, **Medium**, **Hard**, **Deadly**, or **Varies**
  - Expandable breakdown: raw XP per creature, total XP, adjusted XP, threshold values
- **Non-D&D 5e / custom systems:** Manual difficulty label field; note explaining auto-calc is D&D 5e only
- Logic isolated in `EncounterDifficultyCalculator` module keyed to `system` parameter

**US-204 — Scale an encounter**
- "Target Difficulty" selector (Easy / Medium / Hard / Deadly) in D&D 5e difficulty panel
- Advisory suggestion: e.g., "Remove 1 Goblin to reach Hard" or "Add 2 Skeletons to reach Deadly"
- Suggestions advisory only — GM applies manually; app does not auto-modify roster
- If no single adjustment reaches target, shows closest achievable and notes gap

---

### Epic 3 — Encounter Templates

**US-301 — Save as template**
- "Save Template" dialog: name (required), description, environment tag, campaign scope ("This campaign" or "Personal library")
- Stores `ContentRef` values (not resolved stat block data), so template stays correct if creature stats update
- Saving does not start the encounter

**US-302 — Browse and load templates**
- "Encounter Templates" section in GM Toolkit
- Cards show: name, creature summary (e.g., "3 Goblins, 1 Bugbear"), difficulty badge, environment tag, scope badge
- Search by name; filter by environment and scope
- Loading creates a working copy in the workspace without modifying the template

**US-303 — Edit and delete templates**
- Edit mode modifies existing template; "Save as New Template" creates a copy
- Delete requires confirmation; session history referencing the template is unaffected

**US-304 — Duplicate a template** — Copy with " (Copy)" appended, opens in edit mode, fully independent.

---

### Epic 4 — Session Integration

**US-401 — Push an encounter to an active session**
- "Run in Session" button in encounter workspace (only when active Feature 4 session exists for current campaign)
- Sends each `EncounterCreatureSlot` to initiative tracker as `InitiativeEntry` with ContentRef, HP, and AC
- quantity > 1 creates numbered entries ("Goblin 1", "Goblin 2", etc.)
- Custom labels from encounter roster used as entry names
- Entries created with `isVisible: false` by default
- Only ContentRef + mechanical values (HP, AC) transmitted — no action text from Tier 2 sources
- If no active session: button disabled with tooltip *"Start a session to run this encounter."*

**US-402 — Quick-add a creature to a running session**
- "Add to Combat" button in Bestiary detail view when session is active
- Adds creature directly to Feature 4 initiative tracker as new entry with base HP, AC, and prompt for initiative roll
- Does not modify any saved template

---

### Epic 5 — Content Tier Integration

**US-501 — Unified view across all tiers** — Default view, source filtering opt-in. Deduplication: Tier 3 > Tier 2 > Tier 1. Soft notice if Tier 2 unavailable.
**US-502 — CC-BY attribution** — Shared `AttributionFooter` component on all Tier 1 creature detail views and in encounter workspace if any roster creature is Tier 1.
**US-503 — Handle unavailable Tier 2 stat blocks** — Action/trait descriptions show fallback; mechanical fields still shown and usable for difficulty calculations and session push.

---

## Suggested Build Order
1. Seed SRD 5.1 + SRD 2.0 creature data into `data/srd/creatures/`
2. `ContentResolver.getCreatures(filter, userId)` routing to all three tiers
3. Backend: creature list endpoint (Tier 1 + Tier 3 only)
4. Bestiary browser with virtualized list (US-101)
5. Search (US-102) and filter (US-103)
6. Creature detail view with stat block layout and attribution footer (US-104, US-502)
7. Fallback rendering for unavailable Tier 2 (US-503)
8. By-type grouping view (US-105)
9. `GMPartyConfig` model + party preset CRUD (US-202)
10. Encounter workspace: roster builder with creature picker (US-201)
11. `EncounterDifficultyCalculator` module for D&D 5e XP model (US-203)
12. Difficulty scaling suggestions (US-204)
13. Encounter template CRUD (US-301–304)
14. Session push integration (US-401–402)
15. Unified tier display, deduplication, source filter (US-501)
