# Feature 2: Spellbook Reference

> Builds on top of the ContentResolver from Feature 1. All spell data — SRD, user-uploaded, or homebrew — queried through that unified interface. See [Legal Constraints](../legal.md) for CC-BY 4.0 attribution requirements and rules on user-uploaded description text.

**Status:** Post-MVP

---

## Content Architecture

| Tier | Storage | Shareable? |
|---|---|---|
| SRD bundled | Client bundle / backend CDN | Yes — CC-BY 4.0 |
| User-uploaded | Local device only (SQLite) | No — never transmitted |
| Homebrew | Backend (Supabase) | Yes — user-owned |

Each spell entry shows a **content source badge** (e.g., "SRD 5.1", "SRD 2.0", "Your Library", "Homebrew").

**Attribution requirement:** Any view displaying a Tier 1 SRD spell description must include: *"Spell content from the Systems Reference Document 5.1 / 2.0 is available under the Creative Commons Attribution 4.0 International License."* Rendered via a shared `AttributionFooter` component keyed to `sourceId`.

---

## Data Models

### SpellEntry
```typescript
SpellEntry {
  key: string                     // e.g. "fireball"
  sourceId: string                // "SRD_5.1" | "SRD_2.0" | "user-upload-xyz" | "homebrew"
  name: string
  level: int (0–9)                // 0 = cantrip
  school: SchoolKey
  castingTime: string
  castingTimeType: "action" | "bonus_action" | "reaction" | "minute" | "hour" | "special"
  range: string
  components: ComponentBlock      // { verbal, somatic, material, materialDescription }
  duration: string
  concentration: boolean
  ritual: boolean
  description: string             // resolved locally for user-upload tier
  higherLevels: string | null
  classes: ClassKey[]
  tags: string[]
}
```

### SpellIndexEntry (list views — lightweight)
```typescript
SpellIndexEntry {
  key, sourceId, name, level, school, castingTime, concentration, ritual, classes
}
// Full SpellEntry (including description) fetched on demand when expanded.
// Tier 2 description resolved locally — never pre-fetched from server.
```

### PreparedSpellState (character-linked, synced server-side)
```typescript
PreparedSpellState {
  characterId: uuid
  spellRef: ContentRef            // { key, sourceId } — no description text
  isPrepared: boolean
  isConcentrating: boolean
  slotLevelLastCastAt: int | null
}
```

### SpellFilter
```typescript
SpellFilter {
  query: string | null
  levels: int[]
  schools: SchoolKey[]
  classes: ClassKey[]
  castingTimeTypes: string[]
  concentration: boolean | null
  ritual: boolean | null
  sources: string[]               // sourceId values
  sortBy: "name" | "level" | "school" | "castingTime"
  sortDir: "asc" | "desc"
}
```

---

## Epics & User Stories

### Epic 1 — Spell Compendium Browser

**US-101 — Browse all available spells**
- Accessible from main navigation, independent of any character
- Shows all tiers; cards show name, level, school, cast time, concentration/ritual badges, source badge
- Sorted alphabetically by default; virtualized for mobile performance

**US-102 — Search by keyword**
- Matches against name, description, tags, school
- Tier 2 search performed locally and merged with results
- Debounced at ~300ms; "No results" empty state

**US-103 — Filter spells**
- Filter panel: level (multi-select 0–9), school, class, casting time type, concentration, ritual, source
- Multiple filters = intersection; active filter count shown
- Tier 2 filtering performed locally before merge

**US-104 — View full spell details**
- Detail view: name, level, school, casting time, range, components, duration, concentration/ritual, source badge, full description, "At Higher Levels" section
- Tier 2 unavailable fallback: *"Full description available when [source name] is loaded on this device."*
- CC-BY attribution footer for Tier 1 spells
- "Add to Character" shortcut if user has a character with access to this spell

**US-105 — Browse by class**
- "By Class" view mode: tabs or sections per class
- Each class shows only its spells, grouped by level
- Pre-selects character's class if navigating from a character sheet

---

### Epic 2 — Character-Linked Spell Preparation

**US-201 — Prepare and unprepare spells** *(Prepared casters: Cleric, Druid, Paladin, Wizard)*
- "Prepare Spells" mode toggle on character's Spells tab
- Running count of prepared / maximum (max = spellcasting mod + class level)
- Cannot prepare more than maximum; shows tooltip explaining limit
- State stored in `PreparedSpellState` and synced server-side

**US-202 — View prepared spells during a session**
- Defaults to showing only prepared spells + cantrips in session mode
- Toggle: "Prepared Only" vs "Full Spell List"
- Fallback message for unavailable Tier 2 descriptions

**US-203 — Mark a spell as cast**
- "Cast" button per prepared spell
- Slot level selector showing available slots for that level and above
- If cast spell requires concentration: prompt to drop current concentration
- Deducts one slot; updates both Spells tab and Combat section
- Cantrips: no slot selector, no slot consumed

**US-204 — Swap known spells on level-up** *(Known casters: Bard, Ranger, Sorcerer, Warlock)*
- Triggered as part of level-up flow (Feature 1, US-301)
- Player may optionally replace one known spell with a new one of castable level
- Skip is allowed

**US-205 — Recover spell slots on rest**
- "Take a Rest" control on Spells tab: Short Rest or Long Rest
- Long rest: restores all slots to max; updates `SpellSlotTracker`
- Short rest: Warlock Pact Magic slots fully restored only
- Confirmation prompt before applying either rest
- Active concentration spell unaffected

---

### Epic 3 — Concentration Tracker

**US-301 — Set and display active concentration spell**
- When a concentration spell is cast, prompt to set as active concentration
- Active spell pinned at top of Spells tab with "Concentrating" label and duration
- Only one concentration spell active at a time
- State stored on `SpellbookBlock.concentratingOn`, synced server-side

**US-302 — End concentration**
- "End Concentration" button on pinned entry; no confirmation needed (low friction)
- Clears `concentratingOn`; slot previously used is not recovered

**US-303 — Prompt on new concentration spell**
- Modal warning: *"Casting [new spell] will end your concentration on [current spell]. Continue?"*
- Confirming replaces active concentration

**US-304 — Concentration check reminder on taking damage**
- When HP is reduced while concentrating, surfaces: *"You took damage while concentrating on [spell]. Make a DC [X] Constitution saving throw (DC = max(10, half damage taken), rounded down)."*
- DC auto-calculated from damage entered
- Two actions: "Concentration Held" (dismiss) and "Concentration Broken" (clears active concentration)
- Triggered by HP damage event from Feature 1; Feature 2 listens to shared character state

---

### Epic 4 — Content Tier Integration

**US-401 — Unified view across all tiers**
- Default view shows all tiers; source filtering is opt-in
- Deduplication by `key`: Tier 3 > Tier 2 > Tier 1
- Soft notice if Tier 2 unavailable on this device

**US-402 — Display CC-BY attribution**
- Shared `AttributionFooter` component keyed to `sourceId`
- Visible without scrolling or expanding a hidden element

**US-403 — Handle unavailable Tier 2 descriptions**
- Fallback: *"Full description available when [source name] is loaded on this device."*
- All metadata still shown; visually distinct from loading state
- App never fetches Tier 2 description text from server

**US-404 — Filter by content source**
- Source multi-select in filter panel populated dynamically from available sourceId values
- Display names: "SRD 5.1", "SRD 2.0", user-assigned upload labels, "Homebrew"

---

### Epic 5 — Offline Support

**US-501 — SRD spells offline** — All Tier 1 spell data available without network (bundle or service worker cache or local SQLite seeded at install). Search and filter fully offline.
**US-502 — User-uploaded spells offline** — Tier 2 is inherently local; always available on the device where indexed.
**US-503 — Homebrew spells offline** — Cached after first sync; edits queued for sync when connectivity restored. "Synced" vs "pending sync" visual indicator.

---

## Suggested Build Order
1. Define `SpellEntry` + `SpellIndexEntry`; seed SRD 5.1 + SRD 2.0 spell data into `data/srd/spells/`
2. `ContentResolver.getSpells(filter, userId)` — routes to correct tier, merges results
3. Backend: spell list endpoint (Tier 1 + Tier 3 only)
4. Spell compendium browser with virtualized list (US-101)
5. Search (US-102) and filter (US-103)
6. Spell detail view with attribution footer (US-104, US-402)
7. Fallback rendering for unavailable Tier 2 (US-403)
8. By-class view (US-105)
9. Prepared caster UI (US-201, US-202)
10. Cast spell flow with slot consumption (US-203)
11. Spell slot recovery on rest (US-205)
12. Known-spell swap on level-up (US-204)
13. Concentration tracker (US-301 → US-303)
14. Concentration check reminder (US-304)
15. Source filter (US-404)
16. Offline caching for SRD (US-501)
17. Offline queue for homebrew edits (US-503)
