# Build Status

Tracks progress from initial setup through MVP launch. Work through phases in order — each unlocks the next.

---

## Phase 1: Admin & Accounts

- [x] Pick a name — **Vaultstone**
- [x] USPTO trademark search — clear
- [ ] Register the domain — grab `vaultstone.app` or `vaultstone.io`
- [ ] Apple Developer Program — enroll ($99/yr, required for iOS/TestFlight)
- [ ] Google Play Console — register ($25 one-time, required for Android)
- [x] Supabase project — hosted free project "Vaultstone" created. URL + anon key in `.env` (gitignored).
- [x] GitHub repo — https://github.com/tyfoultz/Vaultstone

---

## Phase 2: Local Dev Environment

- [x] Node.js 20 LTS
- [x] Git
- [ ] Xcode (Mac only — required for iOS simulator)
- [ ] Android Studio (optional, defer until Android testing needed)
- [x] VS Code
- [x] Repo cloned, dependencies installed, dev server running
- [x] App boots to Login stub on web (localhost:8082)
- [x] Expo Router 5.1 file-based routing confirmed working

> See `SETUP.md` for full onboarding steps and known dependency quirks.

---

## Phase 3: Supabase Setup

- [x] App connected to Supabase — `packages/api/src/client.ts` reads env vars via expo-constants
- [x] Initial migration applied — all 8 tables created with indexes and triggers
- [x] RLS enabled and policies written for all tables
- [x] Security-definer helpers (`is_campaign_dm`, `is_campaign_member`) prevent recursive policy issues
- [x] `session_events` append-only (no UPDATE policy)
- [x] `game_systems` table seeded — `dnd5e` and `custom` rows
- [x] Netlify web deployment — Expo web export deployed, login confirmed working (2026-04-13)
- [ ] Enable Realtime on `initiative_order` and `session_events` in Supabase dashboard
- [ ] Test auth flow end-to-end

---

## Phase 4: GameSystemDefinition Schema

- [x] `GameSystemDefinition` TypeScript interface — `packages/types/src/systems.ts`
- [x] D&D 5e definition — `packages/systems/src/dnd5e/` (all 6 ability scores + modifiers, combat stats, resource pools, 6 sheet sections)
- [x] Custom system definition — `packages/systems/src/custom/` (open-ended empty template)
- [x] Both systems seeded to `game_systems` table
- [ ] Peer review the schema — try expressing a second system (PF2e, CoC) in it before locking

---

## Phase 5: MVP Feature Build

### 1. Auth ✅ Complete
Sign up, log in, log out, persist session. Route guards in `(auth)` and `(tabs)` layouts. `initialized` flag prevents flash-of-wrong-screen. Forgot/reset password flow complete (2026-04-13).

### 2. Campaign Creation ✅ Complete
DM creates campaign with name, 6-char join code (client-side generated), stored in DB. Campaign list shows all user campaigns via RLS. Campaign detail shows join code with copy-to-clipboard.

### 3. Campaign Join ✅ Complete
Player enters 6-char join code. Campaign looked up via security-definer RPC (bypasses RLS safely). Membership recorded in `campaign_members`. Player sees DM vs Player role badge.

### 4. Character Builder ✅ MVP Complete

| Phase | Status | Summary |
|---|---|---|
| Phase 1 — Content Foundation | ✅ Done | SRD seed data + ContentResolver. 19 species, 12 classes, 14 backgrounds in `packages/content/src/srd/data/`. |
| Phase 2 — Character Data Shape | ✅ Done | `Dnd5eStats` + `Dnd5eResources` interfaces; `getMyCharacters()` API; `useCharacterDraftStore` (persisted to AsyncStorage). |
| Phase 3 — Creation Wizard | ✅ Done | 6-step wizard (ruleset → species → class → background → ability scores → review). Roll Dice, Standard Array, Point Buy, Manual methods. `campaign_id` nullable. Commit: `958a3b6`. |
| Phase 4 — Character Sheet | ✅ Done | Tabbed sheet (Overview + Combat). Overview: identity, ability scores, saves, 18 skills. Combat: live HP block + HpModal, AC/Init/Speed/Hit Die, death saves, ConditionsPanel (14 SRD conditions + exhaustion 0–6). |
| Phase 5 — Campaign Linking | ⬜ Up next | Character list screen + link character to `campaign_members.character_id`. |
| Epic 7 — Sheet Import & Hyperlinking | ⬜ Planned (post-MVP) | Long-running plan: upload existing sheet (PDF/image/JSON) → extract stats → resolve content via Feature 8 index → hyperlinked sheet rendering. See [01-character.md Epic 7](features/01-character.md#epic-7--character-sheet-import--auto-population--planned-post-mvp). |

**MVP scope IN:** US-101–107, US-201–202, US-204, character ↔ campaign linking
**MVP scope DEFERRED:** US-106 (equipment), US-203 (spell slots), US-205 (hit dice spending), US-206 (class resources), Epics 3–6, Epic 7 (sheet import)

### 5. Party View ✅ MVP Complete
Read-only roster at `/campaign/[id]/party`. Each linked character renders a
card with name, species · class + level, HP bar + numeric (+ temp HP), AC,
Speed, Hit Die, active condition chips, and exhaustion (if > 0). Owner
display name and role on each card. Empty state deep-links back to the
campaign. Refresh on screen focus + pull-to-refresh. Reachable from the
"View Party" link on the Party card on the campaign detail screen.

**MVP scope IN:** on-focus snapshot; DM + Player both see full detail.
**MVP scope DEFERRED:** presence indicators, DM-only / player-masked views,
reactive updates via Supabase Realtime (rolls in with Session Mode).

### 6. Session Mode 🟡 In Progress

| Phase | Status | Summary |
|---|---|---|
| 1 — Lifecycle + Realtime shell | ✅ Done | DM Start/End Session; players see Rejoin when active; session screen subscribes to `sessions` row via `supabase.channel('session:{id}')` and bounces everyone back to the campaign when `ended_at` flips. ContentSyncFilter (`sanitizeSyncPayload`) whitelists Realtime payloads so PDF-extracted text can never broadcast. |
| 2 — Initiative tracker | ⬜ Planned | Add/reorder combatants, round advance, turn cursor via `initiative_order`. |
| 3 — HP + conditions sync | ⬜ Planned | Live character HP/conditions via `CharacterStateUpdate` sanitized payloads. |

**Realtime prerequisite:** enable Realtime on `sessions`, `initiative_order`, and `session_events` in the Supabase dashboard. Phase 1 only needs `sessions`; the others land with Phase 2.

### 7. Session Log ⬜ Not started
Append-only event feed. Displays what happened during a session.

### 8. PDF Rulebook 🟡 In Progress

| Phase | Status | Summary |
|---|---|---|
| 1 — Campaign source metadata | ✅ Done | `content_sources` JSONB on campaigns; System Card preset picker. |
| 2 — Local PDF upload | ✅ Done | ToS gate, document picker, FileSystem/IndexedDB persistence. |
| 3 — In-app PDF viewer | ✅ Done | `react-native-pdf` (native) / iframe (web). |
| 4 — Player-facing source prompt | ✅ Done | Per-PDF rows on System Card, Read + Remove actions. |
| 5a — Indexing scaffold | ✅ Done | FTS5 (native) + IndexedDB (web) search framework; search screen; viewer accepts `page` param. |
| 5b — Web PDF text extraction | ✅ Done | `pdfjs-dist` in `pdf-parser.web.ts`; worker copied to `public/` via postinstall. |
| 5c — Native PDF text extraction | ✅ Code complete · ⏳ **Native verification deferred** | `pdfjs-dist/legacy/build/pdf.mjs` in fake-worker mode; Hermes polyfills (btoa/atob via `base-64`, structuredClone fallback, no-op DOMMatrix/Path2D/OffscreenCanvas/ImageData); bytes read via `FileSystem.readAsStringAsync` (base64). **Untested on iOS/Android** — verify during Phase 6 (TestFlight) or whenever the first `expo run:ios`/`run:android` happens. See *Deferred verification* below. |
| 5d — Wire parsing into upload | ✅ Done | Fire-and-forget `reindexSource` kicked off after `saveSource` on web. |
| 5e — Progress UI polish | ✅ Done | Per-PDF `IndexStatusLine` with Retry; 500ms polling while indexing. |
| 5f — ContentResolver Tier 2 | ⬜ | Route typed queries through `content_fts`. |
| 6 — Structured extraction | ⬜ | Tag pages with content type for Spellbook / Bestiary. |
| 7 — In-session "Look it up" panel | ⬜ Planned | Slide-over search on session screen; reuses `searchCampaign`. |
| 8 — Bookmarks / page pins | ⬜ Planned | Local `pdf_bookmarks` table; "Pinned" section on search; pin filter. |
| 9 — DM-shared search results | ⬜ Planned | Citation-only sharing via Realtime; new `session_lookups` table (no PDF text server-side). |

**Legal:** PDFs never leave the device. See [legal.md](legal.md). Phase 9
shares page citations only — never extracted page text.

#### Deferred verification — to run on first iOS/Android build

These items shipped with web-only verification and need a smoke test the
first time we build a native dev client (likely during Phase 6 TestFlight
prep, or sooner if any feature work needs `expo run:ios`/`run:android`).

- **PDF Rulebook Phase 5c — native text extraction.** Code is in place
  (`pdf-parser.native.ts` + Hermes polyfills) but has never run on Hermes.
  Specific risks to watch:
  - Metro may reject `pdfjs-dist/legacy/build/pdf.mjs` over `import.meta.url`.
    Fallback: swap to `.../pdf.js` (non-mjs) or add a postinstall patch
    script (mirror `scripts/patch-metro.js`).
  - First parse may surface a missing polyfill not exercised on web.
  - Memory on 300+ page books is unverified — may need incremental
    indexing (file as a follow-up if it's a problem).
  - Smoke test: upload small PDF in dev build → confirm `IndexStatusLine`
    cycles `not_indexed → indexing N/M → ✓ Indexed` → search returns hits
    with sensible snippets. **Expo Go cannot run this** — needs
    `npx expo run:ios`/`run:android` for the dev client.
  - See [features/08-pdf-rulebook.md Phase 5c](features/08-pdf-rulebook.md#phase-5c--native-pdf-text-extraction--done-2026-04-14)
    for full polyfill list and the implementation rationale.

---

## Phase 6: TestFlight / Internal Testing

*After all 7 MVP features are working:*

- [ ] Configure EAS Build — `eas build:configure`, set up `eas.json` profiles
- [ ] Build for iOS — `eas build --platform ios --profile preview`
- [ ] Submit to TestFlight — `eas submit --platform ios`
- [ ] Invite players — add testers in App Store Connect
- [ ] Run a real session
- [ ] **Run deferred native smoke tests** — see *Deferred verification*
      under Phase 5 above (currently: Phase 5c PDF text extraction)
- [ ] File bugs in GitHub Issues

---

## Useful References

| Resource | URL |
|---|---|
| Expo docs | https://docs.expo.dev |
| Supabase docs | https://supabase.com/docs |
| EAS Build docs | https://docs.expo.dev/build/introduction |
| NativeWind docs | https://www.nativewind.dev |
| SRD 5.1 + 5.2 | https://www.dndbeyond.com/srd |
| Apple Developer Program | https://developer.apple.com/programs |
| Google Play Console | https://play.google.com/console |
