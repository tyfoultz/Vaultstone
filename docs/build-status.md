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

### 4. Character Builder 🟡 In Progress

| Phase | Status | Summary |
|---|---|---|
| Phase 1 — Content Foundation | ✅ Done | SRD seed data + ContentResolver. 19 species, 12 classes, 14 backgrounds in `packages/content/src/srd/data/`. |
| Phase 2 — Character Data Shape | ✅ Done | `Dnd5eStats` + `Dnd5eResources` interfaces; `getMyCharacters()` API; `useCharacterDraftStore` (persisted to AsyncStorage). |
| Phase 3 — Creation Wizard | ✅ Done | 6-step wizard (ruleset → species → class → background → ability scores → review). Roll Dice, Standard Array, Point Buy, Manual methods. `campaign_id` nullable. Commit: `958a3b6`. |
| Phase 4 — Character Sheet | ✅ Done | Tabbed sheet (Overview + Combat). Overview: identity, ability scores, saves, 18 skills. Combat: live HP block + HpModal, AC/Init/Speed/Hit Die, death saves, ConditionsPanel (14 SRD conditions + exhaustion 0–6). |
| Phase 5 — Campaign Linking | ⬜ Up next | Character list screen + link character to `campaign_members.character_id`. |

**MVP scope IN:** US-101–107, US-201–202, US-204, character ↔ campaign linking
**MVP scope DEFERRED:** US-106 (equipment), US-203 (spell slots), US-205 (hit dice spending), US-206 (class resources), Epics 3–6

### 5. Party View ⬜ Not started
DM sees all characters in their campaign with live HP, conditions, spell slots.

### 6. Session Mode ⬜ Not started
Start a session, initiative tracker, HP management, conditions. Real-time sync via Supabase Realtime.

### 7. Session Log ⬜ Not started
Append-only event feed. Displays what happened during a session.

---

## Phase 6: TestFlight / Internal Testing

*After all 7 MVP features are working:*

- [ ] Configure EAS Build — `eas build:configure`, set up `eas.json` profiles
- [ ] Build for iOS — `eas build --platform ios --profile preview`
- [ ] Submit to TestFlight — `eas submit --platform ios`
- [ ] Invite players — add testers in App Store Connect
- [ ] Run a real session
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
