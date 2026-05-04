# Feature 3: Content Packs (Authored Homebrew + JSON Imports)

> The content pipeline powering the app's extensibility beyond the bundled SRD. Two flows feed one unified content-pack concept: in-app authoring forms write `homebrew_content`, and JSON imports run through eight 5e.tools transforms and write `imported_content`. Both share the same `homebrew_packs` parent table and surface together under the homebrew tier of the ContentResolver. See [Legal Constraints](../legal.md) for the user-rights and per-import ToS posture.

**Status:** ✅ Shipped (post-MVP, ahead of original plan).

The original Feature 3 spec (PDF text-extraction + on-device SQLite full-text index) was **superseded** when the imported-content arc shipped. The PDF reader stays as a separate read-only viewer; it contributes nothing to ContentResolver search results. See [08-pdf-rulebook.md](08-pdf-rulebook.md).

---

## Architecture

### Content Tiers (today)

| Tier | Source | Storage | Surfacing |
|---|---|---|---|
| SRD bundled | Ships with the app — full Open5e snapshots transformed into `*Result` JSON | Client bundle | ContentResolver always has it |
| Homebrew (unified) | Authored in-app **or** imported from user-supplied JSON | Supabase `homebrew_packs` parent + `homebrew_content` (authored) + `imported_content` (imported) | Surfaced when a campaign attaches the pack via `campaign_packs` |

The homebrew tier reader merges both child tables under one umbrella, so calling features (Game Systems hub, character wizard, character sheet, GM bestiary browser) treat authored vs imported entries the same way.

### Data Model

**`homebrew_packs`** — parent table for the unified content-pack concept.
```
id              uuid PK
owner_user_id   uuid FK → users
system          text FK → game_systems
name            text
description     text
created_at      timestamptz
updated_at      timestamptz
```
Pack sharing is unified across authoring + imports. There is no `campaign_id` or `is_published` column on the pack itself — sharing happens by attaching a pack to a campaign via `campaign_packs`.

**`homebrew_content`** — entries the owner authored in-app via the homebrew authoring forms.
```
pack_id      uuid FK → homebrew_packs
content_type text   -- spell | creature | item | feat | class | species
name         text
data         jsonb  -- form-shaped per content type
```

**`imported_content`** — entries derived from a JSON import file. Same parent table, separate child because the data shape is the full `*Result` payload (richer than the authoring form).
```
pack_id      uuid FK → homebrew_packs
content_type text   -- spell | creature | item | feat | class | species | subclass | background
name         text
data         jsonb  -- *Result payload, ready for ContentResolver
entry_key    text   -- stable upsert key
source_code  text   -- e.g. 'PHB', 'XPHB', 'TCE'
source_name  text   -- display form
source_page  int
source_url   text   -- original filename
imported_at  timestamptz
UNIQUE (pack_id, entry_key)
```
Re-imports replace via `(pack_id, entry_key)`, so editing a source file and re-importing doesn't duplicate.

**`campaign_packs`** — attaches a pack to a campaign so its entries reach that party's character wizard, bestiary browser, etc.

---

## What Shipped

### Authoring forms (six content types)

In-app forms that write `homebrew_content` rows under the user's pack. Live in [components/homebrew/forms/](../../components/homebrew/forms/):

- `SpellFormModal` — level/school/casting time/range/components/duration/concentration/ritual/classes/description
- `CreatureFormModal` — full stat block (size/type/alignment/AC/HP/speed/abilities/saves/skills/resistances/immunities/senses/languages/CR/traits/actions)
- `ItemFormModal` — category/cost/weight/rarity/attunement/properties/description
- `FeatFormModal` — category/prerequisites/benefits/description
- `ClassFormModal` — hit die/primary ability/saves/proficiencies/skill choices/spellcasting/subclass unlock level
- `SpeciesFormModal` — size/speed/description/traits-as-prose

All six share the `HomebrewFormShell` for consistent header/save/cancel chrome. Each form pre-validates required fields before save. Forms render a live preview wherever the SRD bundle has an equivalent renderer.

### JSON imports (eight 5e.tools transforms)

User picks a JSON file (typically a 5e.tools per-content-type export). The import modal probes the payload's top-level keys and reports counts to the user. The user accepts a per-import in-app ToS callout. The transforms run, produce `*Result`-shaped entries, and the modal upserts them into `imported_content` under the importer's pack.

| Transform | Source key(s) | Output |
|---|---|---|
| Subclasses | `subclass[]` + `subclassFeature[]` | `SubclassResult[]` with leveled features resolved from pipe-encoded refs |
| Feats | `feat[]` | `FeatResult[]` with category code mapping (G/FS/EB/O) and structured prerequisite flattening |
| Spells | `spell[]` | `SpellResult[]` with school letter expansion, duration/range/component formatting |
| Backgrounds | `background[]` | `BackgroundResult[]` with skill/tool/language/ability/feat extraction |
| Items | `baseitem[]` + `item[]` | `ItemResult[]` covering mundane gear, weapons, armor, magic items; `data.magicItemKind` discriminator preserved |
| Species | `race[]` + `subrace[]` | `SpeciesResult[]` (subraces become standalone "Race (Subrace)" entries) |
| Monsters | `monster[]` | `CreatureResult[]` with full stat-block conversion + CR→XP lookup + spellcasting flattened to a trait |
| Classes | `class[]` + `classFeature[]` | `ClassResult[]` with progression table from `classTableGroups` (incl. spell-slot expansion) |

All eight live in [packages/content/src/imported/transform/](../../packages/content/src/imported/transform/) and share helpers in `entries.ts` (the recursive `entries[]` flattener) and `markup.ts` (the `{@tag}` stripper).

The eight transforms are registered in `IMPORT_KINDS` in [components/imported/ImportContentModal.tsx](../../components/imported/ImportContentModal.tsx). That single registry drives the disclosure list, Confirm-step probe rows, diagnostic copy ("a `subclass`, `feat`, `spell`, … array"), and upsert loop. Adding a new content type is one transform file plus one registry entry plus one counter in `probeContent()`.

### Sharing (per-campaign attach)

A pack is private to its owner until they attach it to a campaign they DM. The Manage Campaign Content modal (campaign-side) lists every pack the GM owns and lets them toggle which ones the campaign uses. The character wizard inherits the campaign's attached packs as the available content set.

Authored entries and imported entries flow through the same attach mechanism — there's no separate "share homebrew" toggle. Either the pack is attached or it isn't.

---

## Build Status

| Item | Status |
|---|---|
| `homebrew_packs` parent table + RLS | ✅ Shipped |
| `homebrew_content` table + RLS | ✅ Shipped |
| `imported_content` table + RLS | ✅ Shipped |
| `campaign_packs` join + Manage Campaign Content modal | ✅ Shipped |
| Six authoring forms (spell/creature/item/feat/class/species) | ✅ Shipped |
| Eight 5e.tools import transforms | ✅ Shipped |
| Per-system pack list + per-pack detail page | ✅ Shipped |
| Source provenance (`ImportSource` + `SourceBadge`) | ✅ Shipped |
| Re-import upsert (`(pack_id, entry_key)`) | ✅ Shipped |
| Per-import ToS gate | ✅ Shipped |
| ~~Tag and categorize entries (`HomebrewEntry.tags`)~~ | ⬜ Deferred — the original spec called for freeform tags; pack name + content type cover most needs today, revisit if users ask |
| Bulk actions (multi-select delete / assign tag) | ⬜ Deferred — single-entry actions in the per-pack detail page are sufficient for v1 |
| Hover preview for `@mentions` of imported entries | ⬜ Future — would let the world-builder editor preview imports inline |

---

## Removed (originally in this spec, now dead)

- **PDF text extraction + indexing** (`UserContentSource`, `LocalContentEntry`). Replaced by structured JSON imports. The PDF reader still exists as a read-only viewer; it doesn't index.
- **Per-device source toggles** (`CampaignContentConfig.local_source_toggles`). Imports are server-stored under user-scoped packs; "what's on my device" is no longer a distinction.
- **`isShared` toggle on each entry**. Replaced by pack-level attach/detach via `campaign_packs`.
- **`HomebrewEntry.campaignId`**. Packs are owner-scoped, not campaign-scoped; sharing is via attach.
- **"Shared homebrew" tier** (`sourceId: "shared-homebrew"`). Entries surface under the importer/author's pack name; the `SourceBadge` shows pack name as the source code.

---

## Notes for Future Work

- **PF2e launch** would need its own bundled SRD pipeline + transforms. The existing transform machinery is system-agnostic in shape but each per-content-type transform encodes 5e.tools/D&D semantics — PF2e would need new ones (or a different community-export source).
- **Class/subclass key linkage on imports** — imported subclasses currently key against an SRD edition (`barbarian-srd-5-1`). If a user imports both classes and subclasses from the same file, the subclasses still target SRD parents. Wiring imported subclasses to imported parent classes is a small follow-up.
- **Material-component prose on imported spells** is dropped (matches SRD shape — components are letters only). Surfacing it would be a small enhancement.
- **`_copy` and `_versions`** entries (3rd-party variants in 5e.tools) are skipped on import. Resolving them needs base-entry walking + `_mod` patching; nobody's asked for it yet.
