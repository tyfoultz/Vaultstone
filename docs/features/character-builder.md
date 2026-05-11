# Character Builder Options

> Cross-cuts Feature 1 (Character Creation & Sheet) and Feature 5 (GM Toolkit). The DM picks campaign-level rules in the campaign wizard; the data those rules gate lives in Game Systems; the character wizard + sheet enforce them at creation/edit time.

---

## Why this exists

The campaign wizard already exposes a Character Creation Rules panel — multiclassing on/off, customize origin on/off, optional class features on/off, feats at level 1 on/off, enforce feat prerequisites on/off, etc. Until this arc shipped those toggles were stored on the campaign row but had nothing to gate against — the underlying data (feat catalog with prereqs, multiclass prereqs per class, species swap permissions, optional class feature variants) wasn't structured.

This feature does **not** add new toggles to the campaign wizard. It builds the data layer + enforcement surfaces those toggles need to be meaningful.

## Architecture

Three cooperating layers, one per concern:

```
 Game System definition (per-edition data + rules)
       │
       ▼
 Campaign rules (DM picks per-campaign overrides)
       │
       ▼
 Character wizard / sheet (consumes both, enforces at point-of-use)
```

### Layer 1 — Game System data

Source of truth for *what* options exist and *what shape* they take. Lives under `packages/content/src/srd/data/` for bundled SRD content and `imported_content` / `homebrew_content` Supabase tables for user-authored packs. SRD 5.1 and SRD 2024 are emitted as separate per-edition entries (matching the existing per-edition strategy for spells, classes, etc.).

The structured shapes are defined in [packages/types/src/character-builder.ts](../../packages/types/src/character-builder.ts):

| Shape | Lives on | What it carries |
|---|---|---|
| `FeatPrerequisite` (kinds: `ability-score` / `character-level` / `class-feature` / `prose`) | `FeatResult.prerequisitesRaw` | AND-joined clauses; the wizard checks against character state. |
| `MulticlassPrereq[]` | `ClassResult.multiclassPrerequisiteRaw` | AND of OR-groups; e.g. Fighter is `[{abilities:['strength','dexterity'], minimum:13}]`, Paladin is `[{strength,13}, {charisma,13}]`. |
| `SpeciesSwapRules` | `SpeciesResult.swapRules` | Per-species permissions for the wizard's Customize Origin step. 2014 species ship all-false, 2024 species ship all-true. |
| `'class-feature-variant'` (a kind on `OptionalFeatureKind`) | `OptionalFeatureResult` | Tasha's-style alternates that *replace* a base class feature, distinct from the picks-within-a-feature kinds (invocations, metamagic, maneuvers). Reuses the existing `OptionalFeatureResult` content type. |

The bundled SRD ships no Tasha's content (no CC-BY licensed source for it), so the `class-feature-variant` catalog lands empty for the bundled systems — but the schema is in place for homebrew packs to populate.

### Layer 2 — Campaign rules

Already implemented in [packages/systems/src/dnd5e/optional-rules.ts](../../packages/systems/src/dnd5e/optional-rules.ts). The DM toggles `scope: 'campaign'` rules in the campaign wizard; players see `scope: 'character'` rules during character creation. Both kinds resolve to a flat bag stored on `campaigns.character_creation_rules` (jsonb).

The rules from this arc that are now load-bearing:

| Rule | Default | What enforcement does |
|---|---|---|
| `multiclassing` | `'enforced'` | When `'disabled'`, the level-up flow's "add a class" button never appears. When `'enforced'`, the picker checks `multiclassPrerequisiteRaw` against character ability scores. When `'relaxed'`, the picker shows but does not enforce. (No-op at character creation since the wizard creates a single L1 character.) |
| `customize_origin` | `true` | When false, `StepSpecies` locks species choices to bundled defaults. When true, the wizard surfaces swap UI per species — but only for fields that species's `swapRules` permits (so a homebrew species can be locked even with the campaign rule on). |
| `optional_class_features` | `true` | When true, `StepClass` and the level-up flow surface `class-feature-variant` entries alongside their base counterparts; players pick one per slot. When false, only base features show. |
| `feats_at_level_1` | `true` | When true, the wizard inserts a Feats step after Background, filtered to `category: 'origin'`. When false, the step is skipped entirely. |
| `enforce_feat_prerequisites` | `true` | When true, every feat picker (wizard + sheet "+ feat" button) checks `prerequisitesRaw` against character state. When false, all feats are selectable. |

### Layer 3 — Character wizard + sheet

Where enforcement lands. Each step in the wizard reads the campaign rules + the system's structured data, and decides what to render or filter:

- `StepSpecies` reads `customize_origin` × species `swapRules`. Renders ASI / language / skill swap pickers per `swapRules` entry that's true on the species AND the rule is on.
- `StepClass` reads `optional_class_features`. Filters `OptionalFeatureResult[]` to surface variants with `kinds: ['class-feature-variant']` that target this class.
- New `StepFeats` (inserted between Background and Ability Scores) is gated by `feats_at_level_1`. Filters `FeatResult[]` to `category: 'origin'`. Each feat row shows prereq chips. The Continue button enforces selectability when `enforce_feat_prerequisites` is on.
- The character sheet's `AbilitiesTab` "+ feat" button (currently a freeform name/description modal) is replaced by a catalog picker that uses the same prereq checker as the wizard.

The shared prereq checker lives in [packages/systems/src/dnd5e/prerequisites.ts](../../packages/systems/src/dnd5e/prerequisites.ts) (built as part of this arc) — takes a candidate character + a prereq array and returns `{ ok: true } | { ok: false, reason: string }`.

## Game Systems surface

Per-system detail page (`/(drawer)/game-systems/[id]`) gets a new **Character Builder** group alongside Spells / Backgrounds / Classes / etc. Read-only for bundled SRD; editable only via homebrew packs (matches the existing posture for every other content type).

What's surfaced:

- **Feats** — already exists; gains a Prereqs column with structured chips (linked to ability/level/feature) and a Prereqs facet filter.
- **Multiclass Prerequisites** — new table view: class × ability minimums, sourced from `multiclassPrerequisiteRaw` + the human-readable `multiclassPrerequisite` field for display.
- **Customize Origin Rules** — new table: species × `swapRules.{abilityScores, languages, skills}` flags.
- **Optional Class Features** — surfaces `OptionalFeatureResult[]` filtered to `kinds: ['class-feature-variant']`. Empty for SRD; populated when a homebrew pack adds them.

## Build phases

| Phase | Status | Summary |
|---|---|---|
| 1 — Type definitions | ✅ Done | `FeatPrerequisite`, `MulticlassPrereq`, `SpeciesSwapRules` in `packages/types/src/character-builder.ts`. `'class-feature-variant'` added to `OptionalFeatureKind` enum. |
| 2 — Feat prereq transform | ✅ Done | Open5e feat transform parses 14/14 prereq-bearing SRD feats into structured `prerequisitesRaw[]`. Six known prose forms covered: ability-score, character-level, class-feature, AND-combined. |
| 3 — Multiclass prereqs | ✅ Done | Class transform parses `multiclassPrerequisite` prose into `multiclassPrerequisiteRaw[]`. All 24 SRD classes (12 × 2 editions) parse cleanly: single-ability, OR-grouped, AND-conjoined. |
| 4 — Species swap rules | ✅ Done | `swapRules` populated per species: 5.1 species locked (all-false), 5.2 species swap-everything (all-true). |
| 5 — Optional class feature schema | ✅ Done | `'class-feature-variant'` kind added; reuses existing `OptionalFeatureResult`. SRD ships empty; homebrew authoring populates. |
| 6 — Homebrew feat authoring form | ⬜ Up next | Modal in `components/homebrew/` with name, category, prereq builder (composite), benefits, description. Writes to `homebrew_content`. |
| 7 — System detail page Character Builder group | ⬜ | New tab on `/(drawer)/game-systems/[id]`: feats with prereq chips, multiclass table, customize-origin rules per species, optional class features list. |
| 8 — Character wizard wiring | ⬜ | New `StepFeats` (gated by `feats_at_level_1`); customize-origin UI in `StepSpecies` (gated by `customize_origin` × species swap rules); optional class features filter in `StepClass` (gated by `optional_class_features`); prereq enforcement in feat pickers (gated by `enforce_feat_prerequisites`). Multiclassing enforcement deferred to the level-up flow (which doesn't exist in the wizard today). |
| 9 — Character sheet feat picker | ⬜ | Replace the freeform feat-add modal in `AbilitiesTab` with a catalog picker that runs the same prereq checker as the wizard. |
| 10 — Docs | 🟡 In progress | This file + cross-references in `architecture.md` and `build-status.md`. |

## Level-up arc (follow-up)

A separate branch (`feature/character-leveling`) extends the
character-builder arc with the level-up flow. Concrete shape:

- **Multi-class data model.** `Dnd5eClassEntry[]` on `Dnd5eStats`, with the legacy `classKey` / `level` / `hitDie` fields kept as primary-class mirrors so existing readers (sheet header, party view, character list) work unchanged. `getClassEntries(stats)` and `getPrimaryClassEntry(stats)` in `@vaultstone/types` are the helpers that hide the migration shim.
- **Pure leveling library.** `packages/systems/src/dnd5e/leveling.ts` — `spellSlotsForClassAtLevel`, `spellSlotsForCharacter` (handles multiclass caster-level summing), `hpGainForLevel`, `classFeaturesAtLevel`, `isSubclassUnlockLevel`, `isAsiLevel` (recognizes Fighter L6/L14, Rogue L10 bonus slots), `checkMulticlassPrereqs` (honors `multiclassing` rule).
- **applyLevelUp.** `packages/systems/src/dnd5e/apply-level-up.ts` — pure state transition: `{stats, resources}` + `LevelUpPick` → new `{stats, resources}`. Used by both the level-up wizard and the `starting_level > 1` bootstrap.
- **`starting_level > 1` bootstrap.** `app/character/new.tsx` `handleFinish` builds L1 then loops `applyLevelUp` 2..startingLevel with sensible defaults (max HP, all class features unlocked, no subclass / ASI / feat picked). Subclass + ASI picks are left as "owed" for the level-up wizard to resolve later.
- **Level-up wizard route.** `app/character/[id]/level-up.tsx`. Steps adapt to character state: class pick (when `multiclassing` allows or character is multi-class), subclass (when leveling into the unlock level OR resolving an owed pick), HP (fixed/rolled), ASI/Feat (only at ASI levels), confirm.
- **Multiclass entry on level-up.** Class step lists existing classes to advance plus new-class candidates, gated by `checkMulticlassPrereqs` honoring the campaign rule. `'enforced'` shows prereq violations as locked rows; `'relaxed'` shows prose but allows; `'disabled'` hides the new-class section entirely.
- **Sheet integration.** Level Up button on the character sheet header (desktop and mobile chrome), visible to the owner when level < 20.

## Out of scope (this arc)

- **Spell pick step on level-up.** `applyLevelUp` recomputes spell slot totals automatically, so casters see correct slots after level-up; new known/prepared spells get added through the existing sheet spell tab. A dedicated spell-pick step is its own arc.
- **Feat picker at ASI.** Scaffolded — UI in place, picker invocation deferred. Players pick ASI (+2 / +1+1) at level-up; feats get added via the sheet's feat picker as a follow-up.
- **Tasha's content for SRD systems.** Tasha's Cauldron of Everything is not CC-BY licensed; bundled SRD ships no `class-feature-variant` entries. Homebrew packs may author them.

## Legal

- All transforms operate on the existing CC-BY 4.0 Open5e snapshots; no new content sources.
- Homebrew feat authoring is subject to the same posture as every other homebrew authoring form: pack author certifies they have rights to the content, pack is server-stored under the author's `homebrew_packs` row, party access is gated by `campaign_packs.enabled`.
- See [legal.md](../legal.md) for the full posture.
