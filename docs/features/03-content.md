# Feature 3: Homebrew & Uploaded Content

> The content pipeline powering the app's extensibility. Two legally separate flows: local parsing of user-owned PDFs (on-device only, never transmitted) and in-app authoring of original homebrew. This feature fulfills the ContentResolver's Tier 2 and Tier 3 contract established in Features 1 and 2. See [Legal Constraints](../legal.md) — particularly: user-uploaded content must NEVER leave the device.

**Status:** Post-MVP

---

## Content Architecture

**Tier 2 — User-Uploaded (local only)**
User selects a PDF. App parses on-device, extracts structured content, falls back to full-text. All data written to local SQLite. Nothing transmitted. ContentResolver on this device can now resolve content keys from this source.

**Tier 3 — Homebrew (server-synced)**
User creates original content using in-app authoring forms. Stored server-side under the user's account, synced across devices. Scoped to a campaign or marked global. GM can share homebrew with party — but only homebrew, never Tier 2 source text.

---

## Data Models

### UserContentSource (stored locally only — server never sees this)
```typescript
UserContentSource {
  id: uuid
  userId: string
  label: string              // user-assigned, e.g. "Pathfinder 2e Core"
  filename: string
  fileHash: string           // SHA-256 for dedup detection
  system: string | null      // user-assigned system label
  indexedAt: timestamp | null
  indexStatus: "pending" | "processing" | "complete" | "error"
  indexError: string | null
  pageCount: int | null
  entryCount: int | null
  storageLocation: "local"   // always local
}
```

### LocalContentEntry (Tier 2 — local SQLite only)
```typescript
LocalContentEntry {
  id: uuid
  sourceId: string
  key: string                // normalized, e.g. "fireball"
  contentType: ContentType   // spell | creature | item | class | species | feature | generic
  name: string
  level: int | null
  school: string | null
  challengeRating: string | null
  rarity: string | null
  rawText: string            // full extracted text block
  structuredData: json | null
  embedding: float[] | null  // local vector embedding if device supports it
  pageRef: string | null     // e.g. "p.243"
}
```

### HomebrewEntry (Tier 3 — server-synced)
```typescript
HomebrewEntry {
  id: uuid
  userId: string
  campaignId: uuid | null    // null = global
  contentType: ContentType
  key: string                // app-generated slug
  name: string
  system: string | null
  data: json                 // schema varies by contentType (see below)
  isShared: boolean          // true = visible to party members in linked campaigns
  tags: string[]
  createdAt: timestamp
  updatedAt: timestamp
}
```

### HomebrewSpell (data field schema)
```typescript
{
  level: int (0–9), school, castingTime, castingTimeType, range,
  components: ComponentBlock, duration, concentration, ritual,
  description, higherLevels, classes: string[]
}
```

### HomebrewCreature (data field schema)
```typescript
{
  size, type, alignment, armorClass, armorType, hitPoints, hitDice,
  speed: SpeedBlock, abilityScores: AbilityScores,
  savingThrows, skills, damageImmunities, conditionImmunities,
  senses, languages, challengeRating, xp,
  traits, actions, bonusActions, reactions, legendaryActions: ActionBlock[]
}
```

### HomebrewItem (data field schema)
```typescript
{
  itemType, rarity, requiresAttunement, attunementCondition,
  description, properties, damage, weight
}
```

---

## Epics & User Stories

### Epic 1 — PDF Upload & Local Indexing

**US-101 — Upload a source document**
- "Add Source" button in Content Library section
- Accepted format: PDF (ePub/plain text deferred but interface must be abstracted)
- ToS acknowledgment required before processing begins: *"By uploading this file, you confirm that you have lawful rights to use this content for personal reference within this app. Content is stored on your device only and is not shared with other users or transmitted externally."*
- Local acceptance logged (timestamp + file hash) — file contents never sent to server
- `UserContentSource` created locally with `indexStatus: "pending"`
- If same SHA-256 hash already exists, prompt to re-index or cancel

**US-102 — Parse and index source content locally**
- Parser runs entirely on-device — no content, embeddings, or intermediate data transmitted
- Attempts structured extraction first (stat blocks, spell entries, item descriptions)
- Falls back to chunked full-text for unrecognizable content
- `indexStatus`: "processing" during, "complete" or "error" when done
- Progress indicator shown; runs in background thread, doesn't block UI
- Embeddings generated locally with on-device model (quantized MiniLM) if device supports it; otherwise keyword-only
- **Technical note:** PDF parsing library must run in client environment. Web: `pdf.js`. React Native: native PDF bridge or `expo-file-system` + `pdf-lib`. No cloud OCR or NLP APIs.

**US-103 — View and manage uploaded sources**
- Content Library lists all `UserContentSource` records: label, filename, system, status badge, entry count, indexed date
- Status badges: Pending / Processing (with %) / Complete / Error
- Tapping a source shows breakdown by contentType (e.g., "47 spells, 23 creatures, 12 items")
- "Re-index" option to re-run parsing against an existing file
- Rename label and assign/change system tag

**US-104 — Remove an uploaded source**
- Confirmation: *"Removing this source will delete all indexed content from your device. Any characters referencing content from this source will show fallback descriptions. Continue?"*
- Deletes `UserContentSource` + all associated `LocalContentEntry` records from local storage
- Original PDF file is NOT deleted — only the app's index
- Characters with refs to this source display fallback message (Feature 2, US-403) — not broken

**US-105 — Handle indexing errors**
- `indexStatus: "error"` with human-readable `indexError`
- Error badge + "Retry" button in Content Library
- Partial results from failed index not exposed to ContentResolver — only complete entries
- Device storage error: clear message suggesting freeing space

---

### Epic 2 — Homebrew Spell Authoring

**US-201 — Create a homebrew spell**
- "New Homebrew" button → content type selector (Spell, Creature, Item, Class, Species, Feature)
- Structured form matching `HomebrewSpell` schema; all required fields validated before save
- Live preview renders spell in same format as Spellbook Reference detail view
- On save: `HomebrewEntry` created with `contentType: "spell"`, synced to server, immediately available via ContentResolver under `sourceId: "homebrew"`

**US-202 — Edit a homebrew spell** — Same form pre-populated. Updated description reflects on next render of any character that has this spell prepared.

**US-203 — Delete a homebrew spell** — Confirmation warns if prepared by any character. On confirm: deletes `HomebrewEntry`, removes from ContentResolver, removes from `spellsPrepared` on affected characters.

**US-204 — Duplicate a homebrew spell** — Copy with " (Copy)" appended, new UUID, opens in edit mode. Duplicating an SRD spell creates a homebrew copy pre-populated from SRD fields.

---

### Epic 3 — Homebrew Creature Authoring

**US-301 — Create a homebrew creature**
- Stat block editor matching `HomebrewCreature` schema
- Sections: Identity, Defense (AC/HP/speed), Ability Scores, Saves & Skills, Immunities, Senses & Languages, CR, Action blocks
- Ability modifiers auto-calculated; XP auto-calculated from CR (user may override)
- Live stat block preview alongside the form
- On save: available via ContentResolver and in GM Toolkit bestiary

**US-302 — Edit and delete** — Deletion warns if used in any saved encounter template; deletes creature from those templates (GM notified).

**US-303 — Duplicate** — "Duplicate" on any creature (including SRD creatures → copies to homebrew tier). Opens in edit mode with " (Variant)" appended.

---

### Epic 4 — Homebrew Item Authoring

**US-401 — Create, edit, and delete a homebrew item**
- Form matching `HomebrewItem` schema: type, rarity, attunement, damage, properties (structured), description (rich text)
- Preview renders in same format as equipment list detail view
- Deleted items removed from any character equipment lists that reference them, with notification to the owning character

---

### Epic 5 — Homebrew Class, Species & Feature Authoring

**US-501 — Create a homebrew species**
- Fields: name, description, size, speed, dynamic trait list (name + description per trait)
- Traits with mechanical benefits (proficiencies, ability bonuses, resistances) as structured fields for auto-application during character creation
- On save: available in character creation species selector (Feature 1, US-102) under "Homebrew" section

**US-502 — Create a homebrew class**
- Fields: name, description, hit die, primary ability, saving throw proficiencies, armor/weapon proficiencies, skill choices, level progression table (1–20)
- Each level: features unlocked, spell slot table (optional), subclass unlock level, ASI levels
- On save: available in character creation and level-up flows under "Homebrew" section
- GM responsible for balance; form does not enforce mechanical consistency

**US-503 — Create a homebrew feature/feat**
- Fields: name, description, prerequisites (freeform), optional structured mechanical effects
- On save: available in feat selection during character creation and level-up

---

### Epic 6 — Content Visibility & Campaign Scoping

**US-601 — Enable/disable content sources per campaign**
- Each campaign has a Content Settings screen listing all sources: bundled SRD, GM's homebrew, GM's uploaded local sources
- Toggle per source; disabled sources excluded from ContentResolver in that campaign's context
- Stored in `CampaignContentConfig`: homebrew toggles synced server-side; local source toggles stored locally only
- GM cannot enable/disable a player's local uploads — those are private to the player

**US-602 — Share homebrew with party**
- `isShared` toggle on `HomebrewEntry`; `true` = visible to all players in same campaign
- Shared homebrew descriptions **may** be transmitted (user-authored, not extracted from copyrighted source)
- Appears in party members' ContentResolver under `sourceId: "shared-homebrew"` with "Shared by GM" badge
- Players receive read-only access; un-sharing removes on next sync
- **`isShared` has NO effect on `LocalContentEntry` records — those are always private**

---

### Epic 7 — Content Organization

**US-701 — Tag and categorize content** — Freeform tags on any `HomebrewEntry`. Content Library filterable by tag. Tags synced server-side.

**US-702 — Browse and search the full content library**
- Top-level management view for Tier 2 + Tier 3 content (SRD is read-only, browsed via Spellbook Reference and Bestiary)
- Grouped by contentType; full-text search and tag filtering
- Bulk actions: delete selected, assign tag, toggle share

---

## Suggested Build Order
1. `UserContentSource`, `LocalContentEntry`, `HomebrewEntry` schemas + local SQLite schema
2. ContentResolver Tier 2 path: routing to local SQLite for user-upload sources
3. ContentResolver Tier 3 path: routing to server API for homebrew
4. ToS acknowledgment UI + local acceptance logging
5. PDF ingestion pipeline: file picker, local parsing, structured extraction, fallback to full-text, local indexing
6. Content Library management screen
7. Homebrew spell authoring form + preview
8. Homebrew creature stat block editor + preview
9. Homebrew item authoring form
10. Homebrew species and class authoring
11. Campaign content scoping config
12. Homebrew sharing with party (depends on Feature 4 party infrastructure)
13. Content Library tagging and bulk management
