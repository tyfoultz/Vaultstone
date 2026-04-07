# Vaultstone — Claude Code Guide

System-agnostic TTRPG campaign management app for iOS, Android, and web.
GitHub: https://github.com/tyfoultz/Vaultstone

---

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React Native 0.79 + Expo ~53, Expo Router ~5 (file-based) |
| Web | React Native Web ~0.20 |
| Styling | NativeWind 4 (Tailwind for RN) + design tokens in `packages/ui/src/tokens.ts` |
| State | Zustand 5 (persist slices to AsyncStorage) |
| Local storage | AsyncStorage + Expo SQLite (PDF index / SRD) |
| Backend | Supabase (Postgres, Auth, Realtime, Storage, Edge Functions/Deno) |
| Types | Hand-written DB types in `packages/types/src/database.types.ts` — replace with `supabase gen types typescript` once project is connected |
| Build | EAS Build → App Store + Google Play; Expo web → Vercel/Netlify |

---

## Folder Structure

```
vaultstone/
├── app/                        # Expo Router screens
│   ├── _layout.tsx             # Root stack + session bootstrap via onAuthStateChange
│   ├── (auth)/                 # login.tsx, signup.tsx — COMPLETE
│   ├── (tabs)/                 # campaigns.tsx (COMPLETE), characters.tsx (stub), settings.tsx (COMPLETE)
│   ├── campaign/               # new.tsx (COMPLETE), join.tsx (COMPLETE), [id]/index.tsx (COMPLETE), [id]/session.tsx (stub)
│   └── character/              # [id].tsx (stub), new.tsx (stub)
├── packages/
│   ├── api/src/                # Supabase client + typed query functions
│   │   ├── client.ts           # createClient — reads env via expo-constants
│   │   ├── auth.ts             # signUp, signIn, signOut, getSession
│   │   ├── campaigns.ts        # campaign CRUD
│   │   ├── characters.ts       # character CRUD
│   │   ├── sessions.ts         # session + initiative_order ops
│   │   └── homebrew.ts         # homebrew_content CRUD
│   ├── content/src/            # ContentResolver (SRD / local PDF / homebrew)
│   │   └── resolver.ts         # Single query interface — STUB
│   ├── store/src/              # Zustand stores
│   │   ├── auth.store.ts       # session, user, initialized, setSession, setInitialized
│   │   ├── campaign.store.ts   # campaigns[], activeCampaign, setCampaigns, setActiveCampaign
│   │   ├── character.store.ts  # STUB
│   │   ├── session.store.ts    # STUB
│   │   └── content.store.ts    # STUB
│   ├── systems/src/            # GameSystemDefinition schemas
│   │   ├── types.ts            # re-exports from @vaultstone/types
│   │   ├── dnd5e/              # attributes, resources, creation-steps
│   │   └── custom/             # open-ended user template
│   ├── types/src/              # Shared TypeScript types
│   │   ├── database.types.ts   # Supabase DB shape (hand-written)
│   │   ├── systems.ts          # GameSystemDefinition, AttributeDefinition, etc.
│   │   ├── content.ts          # ContentItem, ContentSource
│   │   └── session.ts          # SessionEvent, InitiativeEntry
│   └── ui/src/                 # Shared NativeWind component library
│       ├── tokens.ts           # colors, fonts, spacing — SOURCE OF TRUTH for design
│       ├── primitives/         # STUB
│       ├── character/          # STUB
│       └── session/            # STUB
├── supabase/
│   ├── config.toml
│   ├── migrations/             # 000000_init, 000001_campaign_members, 000002_fix_rls_recursion, 000003_idempotent_full_fix
│   ├── functions/              # Edge Functions (Deno)
│   │   ├── generate-join-code/
│   │   ├── send-invite-email/
│   │   └── validate-session-event/
│   └── seed.sql                # Dev seed: dnd5e + custom game_systems rows
├── assets/images/              # icon, splash, adaptive-icon, favicon
├── app.config.ts               # Expo config — reads SUPABASE_URL, SUPABASE_ANON_KEY, EAS_PROJECT_ID from env
├── babel.config.js
├── tailwind.config.js
└── tsconfig.json
```

---

## Environment Setup

Create `.env` in the project root (never commit):

```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
EAS_PROJECT_ID=<eas-id>
```

Install dependencies:

```bash
npm install
```

Run dev server:

```bash
npm start          # Expo dev server (scan QR for device)
npm run web        # Browser
npm run ios        # iOS simulator (requires Xcode on macOS)
npm run android    # Android emulator
```

---

## Current Build Status

### Done (scaffold + stubs)
- [x] Monorepo structure, all packages wired up as workspaces
- [x] Supabase client (`packages/api/src/client.ts`) — reads env via expo-constants
- [x] Auth API functions (signUp, signIn, signOut, getSession)
- [x] Zustand auth store (`packages/store/src/auth.store.ts`)
- [x] Database types (`packages/types/src/database.types.ts`)
- [x] GameSystemDefinition type schema (`packages/types/src/systems.ts`)
- [x] D&D 5e system definition stubs (`packages/systems/src/dnd5e/`)
- [x] Design tokens (`packages/ui/src/tokens.ts`)
- [x] All Expo Router routes created (stubs)
- [x] Edge Function stubs (generate-join-code, send-invite-email, validate-session-event)
- [x] seed.sql (game_systems seed rows)

### Done
- [x] `.env` file with Supabase URL + anon key
- [x] Supabase hosted project created, schema migrated, seed data applied
- [x] `npm install` working cleanly
- [x] App boots and routes to login stub on web (`http://localhost:8082`)
- [x] `app/index.tsx` redirect to `/(auth)/login`
- [x] Root `_layout.tsx` route names fixed for Expo Router 5.1
- [x] **Auth flow** — login/signup screens, session persistence via `onAuthStateChange`, route guards in `(auth)` and `(tabs)` layouts, sign-out on settings screen, `initialized` flag prevents flash of wrong screen
- [x] **Campaign creation + join code** — DM creates campaign (name + 6-char join code), list loads all user campaigns via RLS, detail shows join code with copy-to-clipboard, DM/Player role badge
- [x] **Campaign join (player flow)** — `campaign_members` table for explicit membership, `get_campaign_by_join_code` security-definer RPC for pre-join lookup, join screen validates and records membership, campaigns list shows DM + player campaigns

### RLS gotchas (hard-won)
- `campaigns` ↔ `characters` policies were mutually recursive — fixed with security-definer helpers `is_campaign_dm` and `is_campaign_member` (migrations 001–003)
- `INSERT ... RETURNING` evaluates the SELECT policy on the returned row; if the policy calls a security-definer function that uses `auth.uid()`, it can fail in that context — fix: split INSERT and SELECT into separate queries in `createCampaign`
- FK violations on RLS-protected tables surface as RLS errors (not FK errors) — `campaigns.dm_user_id → profiles.id` failure showed as "new row violates row-level security policy"
- Campaigns SELECT policy must NOT use `is_campaign_member` (self-referential via security definer causes `auth.uid()` to behave unexpectedly during RETURNING) — use inline `auth.uid() = dm_user_id` check directly in the policy instead

### Key dependency notes
- `metro ~0.82.5` must stay pinned — Expo 53 doesn't declare it but needs it hoisted
- `metro-source-map ~0.82.5` same reason
- `nativewind` pinned to `4.0.36` — 4.1.x requires react-native-worklets which needs RN 0.81+ (we're on 0.79)
- `react-native-reanimated ~3.17.4` hoisted — required by nativewind/css-interop babel preset
- `react-native-css-interop ^0.2.3` hoisted — required by @expo/metro-runtime error overlay
- `scripts/patch-metro.js` removes `exports` field from metro packages — runs on postinstall
- Always use `npx expo install <pkg>` for new packages, not plain `npm install`, to get compatible versions

### Not started
- [ ] Character builder (5e, driven by GameSystemDefinition)
- [ ] Party view (DM sees all characters)
- [ ] Session mode (initiative, HP, conditions, real-time sync)
- [ ] Session event log

---

## MVP Build Order

Build strictly in this order — each phase depends on the previous:

1. **Supabase project + migrations** — DB must exist before auth works
2. **Auth flow** — root layout session guard, login/signup screens wired to auth store
3. **Campaign creation + join** — DM creates, player joins via code
4. **Character builder** — 5e, rendered from `GameSystemDefinition`
5. **Party view** — DM sees all characters (HP, conditions, spell slots)
6. **Session mode** — initiative tracker, HP adjustments, real-time sync via Supabase Realtime
7. **Session log** — append-only event feed from `session_events`

Post-MVP (do NOT build until MVP ships): Spellbook reference, GM Toolkit/bestiary, Notes manager, local PDF pipeline, Homebrew authoring, World building toolkit, light mode, push notifications.

---

## Key Architecture Patterns

### Auth guard
Root `_layout.tsx` must subscribe to `supabase.auth.onAuthStateChange`, update `useAuthStore`, and redirect to `/(auth)/login` when session is null. Use `<Redirect>` from `expo-router`.

### GameSystemDefinition
Character builder and session mode are rendered dynamically from the system definition — nothing is hardcoded to D&D 5e. `packages/systems/src/dnd5e/` is the reference implementation. Always go through this schema, never add D&D-specific logic to UI components.

### ContentResolver
`packages/content/src/resolver.ts` is the single query interface for all content (SRD, local PDF index, homebrew). UI components must never directly query SQLite or the homebrew table — always go through the resolver.

### Real-time sessions
Supabase Realtime channel: `session:{session_id}`. Use optimistic updates on the client. All session state changes emit an event to `session_events` (append-only — `Update: never` in types).

### Local PDF indexing
PDF parsing and indexing happens entirely on-device using Expo SQLite with FTS5. PDF content is NEVER transmitted to the server or other users. This is a hard legal constraint.

---

## Design Tokens

All colors, fonts, and spacing live in `packages/ui/src/tokens.ts`. Never hardcode hex values elsewhere.

```
brand:           #534AB7
hpHealthy:       #1D9E75
hpWarning:       #EF9F27
hpDanger:        #E24B4A
background:      #12110f
surface:         #0e0d0b
border:          #2e2b25
textPrimary:     #e8e0cc
textSecondary:   #7a7568

Fonts: Cinzel (display), Crimson Pro (body)
```

Dark mode only for MVP. Light mode is post-MVP.

---

## Legal Constraints

- Bundle SRD 5.1 + SRD 2.0 content only (CC-BY 4.0 — attribution required in app)
- User-uploaded PDFs: local device only, never transmitted to server or other users
- Party sync: character state + homebrew only — no source text from any publisher
- App is not affiliated with WotC or any publisher
- ToS must state users are responsible for lawful rights to uploaded content

---

## Database Schema (from `database.types.ts`)

Tables: `profiles`, `game_systems`, `campaigns`, `characters`, `sessions`, `initiative_order`, `session_events` (append-only), `homebrew_content`

Migrations live in `supabase/migrations/` — currently empty, need to be written.

---

## Package Names

Internal packages use the `@vaultstone/` scope:
- `@vaultstone/api`
- `@vaultstone/content`
- `@vaultstone/store`
- `@vaultstone/systems`
- `@vaultstone/types`
- `@vaultstone/ui`
