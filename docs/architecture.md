# Architecture

> Living reference for architecture decisions. Update as decisions evolve. For content and sharing rules, see [Legal Constraints](legal.md).

---

## Tech Stack

### Frontend

| Layer | Choice | Rationale |
|---|---|---|
| Framework | React Native + Expo | Single codebase for iOS, Android, and web. Shared business logic across all platforms. |
| Web renderer | React Native Web (via Expo) | Avoids a separate React codebase for web. |
| Monorepo | Expo monorepo with shared `packages/` | Shared types, API clients, content resolver, and SRD data. |
| State | Zustand | Lightweight, works well with RN, easy to persist slices to AsyncStorage. |
| Local storage (mobile) | AsyncStorage + Expo FileSystem | AsyncStorage persists Zustand slices (auth, character drafts pre-server-sync, preferences). FileSystem holds uploaded PDF binaries — never extracted, never indexed. Bundled SRD ships as JSON in the app bundle, not in SQLite. |
| Local storage (web) | IndexedDB | Holds uploaded PDF binaries on web. |
| Styling | NativeWind (Tailwind for RN) | Consistent design tokens. Dark mode via `dark:` variant. |

### Backend

| Layer | Choice | Rationale |
|---|---|---|
| Platform | Supabase | Postgres, auth, realtime, file storage, and edge functions in one. Migrate if fine-grained control is needed at scale. |
| Database | PostgreSQL (via Supabase) | Relational model fits campaign/character/session data. JSONB for flexible per-class resource pools. |
| Auth | Supabase Auth | JWT-based. Email/password + OAuth (Google, Apple). RLS enforced at DB layer. |
| Real-time | Supabase Realtime | WebSocket pub/sub over Postgres changes. One channel per active session. |
| File storage | Supabase Storage | Avatar images, campaign assets. **User PDFs never stored here.** |
| Edge functions | Supabase Edge Functions (Deno) | Join code generation, session event validation, invite emails. |

GitHub Repo: https://github.com/tyfoultz/Vaultstone.git

---

## Database Schema

### Core Tables

**`users`** — Managed by Supabase Auth. Extended with `profiles` (display name, avatar, preferences).

**`campaigns`**
```sql
id          uuid PK
name        text
dm_user_id  uuid FK → users
join_code   text UNIQUE
system      text FK → game_systems  -- which ruleset this campaign uses
created_at  timestamptz
```
`content_sources` was removed when content packs landed — campaigns now reference content packs via the `campaign_packs` join table.

**`campaign_packs`** — many-to-many between campaigns and homebrew_packs.
```sql
campaign_id uuid FK → campaigns
pack_id     uuid FK → homebrew_packs
attached_at timestamptz
PRIMARY KEY (campaign_id, pack_id)
```

**`campaign_members`**
```sql
id           uuid PK
campaign_id  uuid FK → campaigns
user_id      uuid FK → users
role         text  -- 'gm' | 'player'
character_id uuid (nullable FK → characters)
joined_at    timestamptz
```

**`characters`**
```sql
id            uuid PK
campaign_id   uuid FK → campaigns (nullable)
user_id       uuid FK → users
name          text
system        text    -- e.g. "dnd5e", "custom"
base_stats    jsonb   -- ability scores, species, class, background
resources     jsonb   -- HP, spell slots, class resource pools
conditions    text[]
exhaustion_level int DEFAULT 0
created_at    timestamptz
updated_at    timestamptz
```

**`sessions`**
```sql
id            uuid PK
campaign_id   uuid FK → campaigns
name          text (nullable)
started_at    timestamptz
ended_at      timestamptz (nullable — null = live)
round         integer DEFAULT 1
```

**`initiative_order`**
```sql
id              uuid PK
session_id      uuid FK → sessions
character_id    uuid (nullable — null for NPCs)
display_name    text
init_value      integer
hp_current      integer
hp_max          integer
ac              integer
is_active_turn  boolean DEFAULT false
is_visible      boolean DEFAULT true
sort_order      integer
```

**`session_events`** — Append-only. Never mutate rows.
```sql
id           uuid PK
session_id   uuid FK → sessions
event_type   text    -- hp_changed, condition_added, turn_advanced, spell_cast, etc.
actor_id     uuid (nullable)
payload      jsonb
created_at   timestamptz
```

**`homebrew_packs`** — parent table for the unified content-pack concept. A pack groups together its owner's authored homebrew + imported entries; campaigns attach packs via `campaign_packs`.
```sql
id              uuid PK
owner_user_id   uuid FK → users
system          text FK → game_systems
name            text
description     text
created_at      timestamptz
updated_at      timestamptz
```
Pack sharing is unified — there's no `campaign_id` or `is_published` column. Sharing happens by attaching a pack to a campaign via `campaign_packs`.

**`homebrew_content`** — entries the owner authored in-app via the homebrew authoring forms.
```sql
id            uuid PK
pack_id       uuid FK → homebrew_packs
user_id       uuid FK → users
content_type  text    -- spell, creature, item, feat, class, species
name          text
data          jsonb
created_at    timestamptz
```

**`imported_content`** — entries derived from a user-supplied JSON import (e.g. 5e.tools community packs). Same parent (`homebrew_packs`) as authored entries, separate table because the data shape is richer (full `*Result`-shaped payload from the on-device transforms).
```sql
id            uuid PK
pack_id       uuid FK → homebrew_packs
user_id       uuid FK → users
content_type  text    -- spell, creature, item, feat, class, species, subclass, background
name          text
data          jsonb   -- full *Result payload, ready for ContentResolver
entry_key     text    -- stable key for upsert-on-reimport
source_code   text    -- e.g. 'PHB', 'XPHB', 'TCE'
source_name   text    -- display form
source_page   int
source_url    text    -- original filename
imported_at   timestamptz
UNIQUE (pack_id, entry_key)
```
Re-imports of the same source file replace existing entries via the `(pack_id, entry_key)` unique constraint.

**`character_drafts`** — server-side persistence for the character creation wizard. Replaced the old AsyncStorage-only draft state.
```sql
id            uuid PK
user_id       uuid FK → users
campaign_id   uuid FK → campaigns (nullable — drafts can be unattached)
state         jsonb   -- the in-progress wizard state
created_at    timestamptz
updated_at    timestamptz
```

**`game_systems`**
```sql
id            text PK   -- e.g. "dnd5e", "custom"
display_name  text
version       text
license       text      -- e.g. "CC-BY-4.0"
is_bundled    boolean
definition    jsonb     -- full GameSystemDefinition schema
created_at    timestamptz
```

### RLS Notes (hard-won)
- `campaigns` ↔ `characters` policies were mutually recursive — fixed with security-definer helpers `is_campaign_dm` and `is_campaign_member`
- `INSERT ... RETURNING` evaluates the SELECT policy; if it calls a security-definer function using `auth.uid()`, it can fail. Historical workaround was splitting INSERT and SELECT into separate client queries. **Preferred pattern:** wrap multi-step create flows in a `security definer` RPC (see `create_campaign_with_gm`) — it sidesteps the RETURNING-triggered policy re-eval, keeps the flow atomic, and lets the server own `auth.uid()` and generated values like join codes
- Campaigns SELECT policy must NOT use `is_campaign_member` — use inline `auth.uid() = dm_user_id` check directly
- FK violations on RLS-protected tables surface as RLS errors, not FK errors

---

## Multi-System Architecture

Each supported system ships as a `GameSystemDefinition` — a structured schema describing the character model. The app renders character sheets and creation flows dynamically from this schema. **Nothing in the UI hardcodes D&D 5e structure.**

A `GameSystemDefinition` contains:
- **Identity:** `id`, display name, version, license type, whether bundled SRD content is available
- **Attribute schema:** Stats a character has, data types, and how derived values are calculated
- **Resource pools:** Limited resources (spell slots, rages, etc.), structure, and recharge conditions
- **Character creation steps:** Ordered sequence of choices and content collections that feed each step
- **Sheet layout config:** Which sections appear on the character sheet

### Launch Systems

| System | ID | Content Source | Status |
|---|---|---|---|
| D&D 5th Edition (2024) | `dnd5e` | SRD 5.1 + SRD 2.0, CC-BY 4.0, bundled | Launch |
| Custom | `custom` | User-defined, no bundled content | Launch |
| Pathfinder 2e | `pf2e` | ORC License content | Post-MVP v2 |

The `custom` system ships at launch as an open-ended template — no bundled content, fully user-defined attributes and resources.

---

## Content Architecture

All features query content through a single abstraction — the `ContentResolver` — without knowing the source.

### Content Tiers

| Tier | Source | Storage | Shareable? |
|---|---|---|---|
| SRD bundled | Ships with the app | Client bundle (JSON in `packages/content/src/srd/data/`) | Yes — CC-BY 4.0 |
| Homebrew (unified) | Authored in-app via homebrew forms (`homebrew_content`) **or** imported from user-supplied JSON via the eight transforms (`imported_content`) | Supabase, scoped to the importer/author's `homebrew_packs` row | Yes — pack attaches to a campaign via `campaign_packs` |

Both authoring and imports surface under one tier — the homebrew tier — because they share the same `homebrew_packs` parent and the same sharing model. The `ContentResolver` reads from both tables and merges them under that tier.

The legacy "user-uploaded PDF" tier was removed when the imported-content arc shipped — PDFs no longer extend the system content. The PDF reader stays as a separate per-campaign upload + viewer, but contributes nothing to ContentResolver search results. See [legal.md](legal.md) for the legal posture distinction between PDFs (local-only) and imported JSON (server-stored under the importer's pack).

### ContentResolver Interface

```typescript
ContentResolver.search(query, filters)       → ContentResult[]
ContentResolver.getByKey(contentKey)          → ContentResult | null
ContentResolver.getSpell(name, source?)       → SpellResult | null
ContentResolver.getCreature(name, source?)    → CreatureResult | null
```

Internally fans out to: SRD JSON index → homebrew tier (which itself merges `homebrew_content` + `imported_content` from Supabase). Results are merged and de-duplicated by `(type, lowercased name)` with a tier priority table — homebrew > SRD. Calling features never know which tier responded.

### Imported Content Pipeline
1. User picks a JSON file (e.g. a 5e.tools `class-fighter.json` or `spells/spells-phb.json`).
2. The Import modal probes the payload's top-level keys and reports counts per content kind to the user — driven by the `IMPORT_KINDS` registry in [components/imported/ImportContentModal.tsx](../components/imported/ImportContentModal.tsx).
3. User accepts a per-import Terms-of-Service callout confirming they have lawful rights to the content.
4. The modal runs every applicable transform from [packages/content/src/imported/transform/](../packages/content/src/imported/transform/) (subclasses, feats, spells, backgrounds, items, species, monsters, classes — one transform per content type, all sharing helpers in `entries.ts`). Each transform produces `*Result`-shaped payloads ready for the resolver.
5. Entries are upserted into the Supabase `imported_content` table under a `homebrew_packs` row owned by the importer (existing pack with the same name → upsert in place; new name → new pack). Re-imports replace via `(pack_id, entry_key)` so removed source entries don't linger.
6. Imported entries surface to the importer alongside SRD content via ContentResolver, with their source-book code shown via `SourceBadge`. The importer can attach the pack to a campaign they DM (via `campaign_packs`) to make it available to that party.

The eight-transform set is registered in `IMPORT_KINDS`; adding a new content type is one transform file plus one registry entry. The disclosure list, Confirm-step probe rows, diagnostic copy ("a `subclass`, `feat`, `spell`, … array"), and upsert loop all read from that single registry.

---

## Real-Time Session Architecture

### Session Rooms
Each active session maps to a Supabase Realtime channel: `session:{session_id}`.

### Optimistic Updates
1. Client applies state change locally (optimistic update)
2. Client broadcasts event to the Realtime channel
3. Supabase writes event to `session_events` and updates `initiative_order`
4. Other clients receive the broadcast and update their local state
5. If the write fails, the originating client rolls back

### Event Types

| Event | Payload |
|---|---|
| `hp_changed` | `{ character_id, old_hp, new_hp, cause }` |
| `condition_added` | `{ character_id, condition, source }` |
| `condition_removed` | `{ character_id, condition }` |
| `turn_advanced` | `{ session_id, new_active_id, round }` |
| `initiative_set` | `{ character_id, init_value }` |
| `spell_slot_used` | `{ character_id, slot_level, remaining }` |
| `session_started` | `{ session_id, campaign_id }` |
| `session_ended` | `{ session_id }` |

### Reconnection
On reconnect, client fetches the current snapshot of `initiative_order` for the active session. This gives authoritative live state without replaying the full event log.

---

## Offline Strategy

| Data | Offline behavior |
|---|---|
| SRD content | Always available — bundled in app |
| Character sheets | Cached in AsyncStorage / IndexedDB on last sync |
| Uploaded PDFs | Always available on the uploader's device (binary stored locally; never indexed) |
| Homebrew + imported content | Read-cached from last fetch; writes require network (round-trip to Supabase) |
| Live session state | Requires network — real-time feature |
| Campaign notes | Cached locally; edits merge on reconnect (last-write-wins) |

---

## Platform & Build

| Concern | Decision |
|---|---|
| iOS | Expo managed → EAS Build for App Store |
| Android | EAS Build pipeline |
| Web | Expo web export → Netlify |
| OTA updates | Expo Updates for JS-layer patches |
| Environment config | `app.config.ts` with EAS Secrets |

---

## Project Folder Structure

```
vaultstone/
├── app/                                # Expo Router — file-based routing
│   ├── _layout.tsx                     # Root layout — auth guard, nav shell
│   ├── (auth)/
│   │   ├── login.tsx
│   │   └── signup.tsx
│   ├── (drawer)/                       # Authenticated app — drawer nav shell
│   │   ├── characters.tsx              # Character list
│   │   ├── game-systems/
│   │   │   ├── index.tsx               # Game systems hub (list)
│   │   │   └── [id].tsx                # Per-system detail (catalog, rules, packs)
│   │   └── homebrew-pack/
│   │       └── [id].tsx                # Per-pack detail + entry list
│   ├── campaign/
│   │   ├── new.tsx
│   │   └── [id]/
│   │       ├── index.tsx               # Campaign detail + party view + system/packs
│   │       ├── pick-character.tsx
│   │       ├── rulebook.tsx            # Read-only PDF reader
│   │       └── pdf-viewer.tsx          # PDF viewer screen
│   ├── character/
│   │   ├── new.tsx                     # Character creation wizard
│   │   └── [id].tsx                    # Character sheet
│   └── world/
│       └── [worldId]/
│           ├── index.tsx               # World root (sections + nested pages)
│           ├── page/[pageId].tsx       # Page editor (Faction/Location/NPC/Timeline/etc.)
│           └── relations.tsx           # Relations web
│
├── components/
│   ├── campaign/                       # CampaignPacksCard, CharacterPickerModal,
│   │                                   # ManageCampaignContentModal
│   ├── character-sheet/                # CombatTab and friends
│   ├── character-wizard/               # SheetSoFar + Step* components
│   ├── game-systems/                   # SystemPacksRow, useSystemHomebrewContent
│   ├── homebrew/                       # CreateHomebrewPackModal +
│   │   └── forms/                      #   per-content-type authoring forms (6 types)
│   ├── imported/                       # ImportContentModal + importContentJson
│   ├── rulebook/                       # uploadPdf + ToS modal (PDF reader only)
│   └── world/                          # World-builder UI: sidebar, page views,
│                                       # share modal, lock banner, recently-deleted,
│                                       # session prep, relations web
│
├── packages/
│   ├── api/                            # Supabase client + typed query functions
│   │   └── src/
│   │       ├── client.ts
│   │       ├── auth.ts
│   │       ├── campaigns.ts
│   │       ├── campaign-packs.ts
│   │       ├── characters.ts
│   │       ├── character-drafts.ts
│   │       ├── homebrew-packs.ts
│   │       ├── homebrew-entries.ts
│   │       ├── imported-content.ts
│   │       ├── pages.ts                # World pages
│   │       ├── trash.ts                # Recently-deleted
│   │       └── sessions.ts
│   │
│   ├── content/                        # ContentResolver — unified content query layer
│   │   └── src/
│   │       ├── resolver.ts
│   │       ├── srd/                    # Bundled SRD JSON data (CC-BY 4.0)
│   │       ├── imported/
│   │       │   ├── transform/          # Eight 5e.tools → *Result transforms
│   │       │   │   ├── entries.ts      # Shared helpers (entriesToText, slugify, …)
│   │       │   │   ├── markup.ts       # `{@tag}` markup stripper
│   │       │   │   ├── subclasses.ts
│   │       │   │   ├── feats.ts
│   │       │   │   ├── spells.ts
│   │       │   │   ├── backgrounds.ts
│   │       │   │   ├── items.ts
│   │       │   │   ├── species.ts
│   │       │   │   ├── monsters.ts
│   │       │   │   └── classes.ts
│   │       │   └── index.ts
│   │       └── homebrew/               # Reads homebrew_content + imported_content
│   │
│   ├── systems/                        # GameSystemDefinition schemas
│   │   └── src/
│   │       ├── registry.ts
│   │       ├── dnd5e/                  # D&D 5e reference implementation
│   │       └── custom/                 # Open-ended custom system template
│   │
│   ├── store/                          # Zustand state stores
│   ├── ui/                             # Shared NativeWind primitives
│   │   └── src/
│   │       ├── tokens.ts
│   │       └── primitives/             # Surface, Card, Button, MarkdownText, SourceBadge, …
│   │
│   └── types/                          # Shared TypeScript types
│       └── src/
│           ├── database.types.ts
│           ├── content.ts
│           ├── homebrew.ts
│           └── systems.ts
│
├── scripts/
│   └── import-srd/                     # Open5e snapshot fetch + per-type transforms
│       ├── fetch-open5e.js
│       ├── augment-flavor.js
│       └── transforms/                 # spells, classes, subclasses, items, …
│
├── vendor/srd/                         # Vendored Open5e + BTMorton snapshots
├── supabase/
│   └── migrations/                     # Versioned SQL migrations
├── docs/                               # This documentation
├── app.config.ts
├── eas.json
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

### Package Dependency Map

| Package | Depends on |
|---|---|
| `packages/api` | `packages/types` |
| `packages/content` | `packages/api`, `packages/types` |
| `packages/systems` | `packages/types` |
| `packages/store` | `packages/api`, `packages/content`, `packages/systems`, `packages/types` |
| `packages/ui` | `packages/types` |
| `app/` | All packages |

No circular dependencies. `packages/types` and `packages/ui` have zero internal dependencies.

---

## Design Tokens

The current palette is **Vaultstone Noir — "Magical Midnight"** (dark-only, Material 3-styled void-first surface hierarchy with violet/blue accents). Full token list and Tailwind/NativeWind mapping live in [CLAUDE.md → Design Tokens](../CLAUDE.md#design-tokens) and the source of truth is `packages/ui/src/tokens.ts` (mirrored in `tailwind.config.js`). Light mode post-MVP.

The pre-Noir palette (Cinzel + Crimson Pro on dark slate, brand `#534AB7`) was retired during the Noir overhaul; legacy `colors.surface` / `colors.brand` aliases still resolve so screens that haven't yet migrated to primitives keep rendering correctly.

---

## MVP Scope

Build in this order. Everything below the line is post-MVP.

**MVP (required to run a real session)**
- Auth — sign up, log in, profile
- Campaign creation + join code flow
- Character builder — SRD 5e content only
- Party view — DM sees all characters
- Session mode — initiative tracker, HP management, conditions, live sync
- Session log — append-only event feed

**Shipped post-MVP**
- Game Systems hub — full SRD catalog browser (classes, subclasses, items, magic items, creatures, species, feats, conditions, backgrounds, spells, rules) + per-system rulebooks page
- Homebrew authoring — six in-app authoring forms (spells, creatures, items, feats, classes, species) writing to `homebrew_content`
- JSON content imports — eight 5e.tools transforms (subclasses, feats, spells, backgrounds, items, species, monsters, classes) writing to `imported_content`, both surfaced under unified content packs
- World builder — sections, nested pages, Faction/Location/NPC/Timeline page views, share modal, edit lock banner, recently-deleted, session prep, relations web
- Read-only PDF reader — campaign-side upload + viewer (no extraction or indexing)
- Server-side character drafts — wizard state persisted to `character_drafts`

**Still post-MVP**
- Spellbook reference + concentration tracker (catalog browser exists; sheet-side concentration tracker doesn't)
- Encounter builder (bestiary browser shipped via Game Systems hub; encounter-builder UI doesn't exist yet)
- Light mode
- Push notifications

---

## Resolved Design Decisions

| Question | Resolution |
|---|---|
| Extending system content beyond SRD | **Imported tier merged into the homebrew tier — user-supplied JSON, server-stored.** PDF text extraction was investigated but dropped (extraction quality + maintenance burden + legal exposure). Users import structured JSON content packs (e.g. from community 5e.tools exports) via the eight transforms; entries land in `imported_content` under the importer's `homebrew_packs` row alongside any authored homebrew. The user accepts a per-import ToS callout before each import; the importer's pack is private until they attach it to a campaign they DM. PDF reader stays as a separate read-only campaign-side reader — never indexed, never synced. See [legal.md](legal.md). |
| Offline notes conflict resolution | **Last-write-wins.** Each note stores `updated_at`; later timestamp wins on sync. Acceptable tradeoff at this stage. |
| Multi-system support depth for MVP | **System definition layer from day one.** D&D 5e + custom at launch. PF2e post-MVP v2. Character builder fully driven by system schema — nothing hardcoded to 5e. |

---

> *Last updated May 2026 (post imported-content arc). Stack choices reflect a solo/small team moving toward MVP. Revisit Supabase dependency if session scale or real-time control requirements change.*
