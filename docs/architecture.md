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
| Local storage (mobile) | AsyncStorage + SQLite (Expo SQLite) | AsyncStorage for preferences. SQLite for local PDF content index and embedded SRD data. |
| Local storage (web) | IndexedDB | Equivalent offline capability on web. |
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
content_sources jsonb DEFAULT null  -- { label, key } for declared rulebook
created_at  timestamptz
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

**`homebrew_content`**
```sql
id            uuid PK
campaign_id   uuid FK (nullable — global if null)
user_id       uuid FK → users
content_type  text    -- spell, monster, item, class, species, feature
name          text
data          jsonb
is_shared     boolean
created_at    timestamptz
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
- `INSERT ... RETURNING` evaluates the SELECT policy; if it calls a security-definer function using `auth.uid()`, it can fail — fix: split INSERT and SELECT into separate queries
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
| SRD bundled | Ships with the app | Client bundle + backend CDN | Yes — CC-BY 4.0 |
| User-uploaded | User's legally owned PDFs | **Local device only** (SQLite FTS5) | No — never transmitted |
| Homebrew | Created in-app | Backend (Supabase) | Yes — user-owned |

### ContentResolver Interface

```typescript
ContentResolver.search(query, filters)       → ContentResult[]
ContentResolver.getByKey(contentKey)          → ContentResult | null
ContentResolver.getSpell(name, source?)       → SpellResult | null
ContentResolver.getCreature(name, source?)    → CreatureResult | null
```

Internally fans out to: SRD index → local PDF index (SQLite FTS5) → homebrew store. Results are merged and de-duplicated. Calling features never know which tier responded.

### Local PDF Processing Pipeline
1. User selects a PDF (no server upload)
2. App extracts text on-device using a local PDF parser
3. Text is chunked and stored in SQLite FTS5 with metadata
4. Search runs as a full-text query against the local index
5. Results surface through ContentResolver alongside SRD and homebrew

**No extracted text is ever transmitted to the backend or shared with party members.**

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
| User-uploaded PDF index | Always available — stored in local SQLite |
| Homebrew content | Cached locally; writes queue for sync on reconnect |
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
├── app/                              # Expo Router — file-based routing
│   ├── _layout.tsx                   # Root layout — auth guard, nav shell
│   ├── (auth)/
│   │   ├── login.tsx
│   │   └── signup.tsx
│   ├── (tabs)/
│   │   ├── campaigns.tsx
│   │   ├── characters.tsx
│   │   └── settings.tsx
│   ├── campaign/
│   │   └── [id]/
│   │       ├── index.tsx             # Campaign detail + party view
│   │       ├── session.tsx           # Live session mode
│   │       └── rulebook.tsx          # Local PDF viewer stub
│   └── character/
│       ├── new.tsx                   # Character builder
│       └── [id].tsx                  # Character sheet
│
├── packages/
│   ├── api/                          # Supabase client + typed query functions
│   │   └── src/
│   │       ├── client.ts
│   │       ├── auth.ts
│   │       ├── campaigns.ts
│   │       ├── characters.ts
│   │       ├── sessions.ts
│   │       └── homebrew.ts
│   │
│   ├── content/                      # ContentResolver — unified content query layer
│   │   └── src/
│   │       ├── resolver.ts
│   │       ├── srd/                  # Bundled SRD 5.1 + 5.2 JSON data (CC-BY 4.0)
│   │       ├── local/                # Local PDF index — SQLite FTS5
│   │       └── homebrew/             # Homebrew content queries
│   │
│   ├── systems/                      # GameSystemDefinition schemas
│   │   └── src/
│   │       ├── types.ts              # GameSystemDefinition interface
│   │       ├── dnd5e/                # D&D 5e reference implementation
│   │       └── custom/              # Open-ended custom system template
│   │
│   ├── store/                        # Zustand state stores
│   │   └── src/
│   │       ├── auth.store.ts
│   │       ├── campaign.store.ts
│   │       ├── character.store.ts
│   │       ├── character-draft.store.ts
│   │       ├── session.store.ts
│   │       └── content.store.ts
│   │
│   ├── ui/                           # Shared NativeWind component library
│   │   └── src/
│   │       ├── tokens.ts             # Design tokens
│   │       ├── primitives/
│   │       ├── session/
│   │       └── character/
│   │
│   └── types/                        # Shared TypeScript types
│       └── src/
│           ├── database.types.ts
│           ├── content.ts
│           ├── systems.ts
│           └── session.ts
│
├── supabase/
│   ├── migrations/                   # Versioned SQL migrations
│   ├── functions/                    # Edge Functions (Deno)
│   │   ├── generate-join-code/
│   │   ├── validate-session-event/
│   │   └── send-invite-email/
│   └── seed.sql
│
├── docs/                             # This documentation
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

All colors and fonts defined in `packages/ui/src/tokens.ts`. **Never hardcode hex values.**

| Token | Value |
|---|---|
| Brand color | `#534AB7` (purple) |
| App background | `#12110f` (dark slate) |
| Surface | `#0e0d0b` |
| Border | `#2e2b25` |
| Primary text | `#e8e0cc` |
| Secondary text | `#7a7568` |
| HP healthy | `#1D9E75` (teal) |
| HP warning | `#EF9F27` (amber) |
| HP danger | `#E24B4A` (red) |
| Display font | Cinzel (serif) |
| Body/UI font | Crimson Pro |

Dark mode is the primary design target. Light mode post-MVP.

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

**Post-MVP v2**
- Spellbook reference + concentration tracker
- GM Toolkit — encounter builder, bestiary browser
- Campaign journal and notes manager
- Local PDF upload and indexing pipeline
- Homebrew authoring tools
- World building toolkit
- Light mode
- Push notifications

---

## Resolved Design Decisions

| Question | Resolution |
|---|---|
| PDF search: embedding model vs keyword | **Keyword only (FTS5).** Text extracted from PDFs stored in local SQLite FTS5. No embedding model. Revisit semantic search if quality becomes a pain point. |
| Offline notes conflict resolution | **Last-write-wins.** Each note stores `updated_at`; later timestamp wins on sync. Acceptable tradeoff at this stage. |
| Multi-system support depth for MVP | **System definition layer from day one.** D&D 5e + custom at launch. PF2e post-MVP v2. Character builder fully driven by system schema — nothing hardcoded to 5e. |

---

> *Last updated April 2026. Stack choices reflect a solo/small team moving toward MVP. Revisit Supabase dependency if session scale or real-time control requirements change.*
