# Vaultstone — Claude Code Guide

System-agnostic TTRPG campaign management app for iOS, Android, and web.
GitHub: https://github.com/tyfoultz/Vaultstone

## Project Tracking (Notion)

Build status, user story progress, and feature requirements are tracked in Notion — not in this file.

- [Main project page](https://www.notion.so/33a5be47bc8280ea9af7cf38ee912d70)
- [Feature requirements](https://www.notion.so/33a5be47bc82801facfdfaf437304f40)
- [Party Hub Epic 1–6 (user story statuses)](https://www.notion.so/33a5be47bc828163ab32e084eed34216)
- [Build Kickoff Checklist](https://www.notion.so/33a5be47bc828102bdbcf2c9ca1d6547)

---

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React Native 0.79 + Expo ~53, Expo Router ~5 (file-based) |
| Styling | NativeWind 4 + design tokens in `packages/ui/src/tokens.ts` |
| State | Zustand 5 (persist slices to AsyncStorage) |
| Backend | Supabase (Postgres, Auth, Realtime, Storage, Edge Functions/Deno) |
| Types | Hand-written DB types in `packages/types/src/database.types.ts` |
| Build | EAS Build → App Store + Google Play; Expo web → Netlify |

Internal packages: `@vaultstone/api`, `@vaultstone/store`, `@vaultstone/types`, `@vaultstone/ui`, `@vaultstone/systems`, `@vaultstone/content`

---

## Key Architecture Patterns

**Auth guard** — Root `_layout.tsx` subscribes to `supabase.auth.onAuthStateChange`, updates `useAuthStore`, redirects to `/(auth)/login` when session is null.

**GameSystemDefinition** — Character builder and session mode render dynamically from the system definition. `packages/systems/src/dnd5e/` is the reference. Never hardcode D&D-specific logic in UI.

**ContentResolver** — `packages/content/src/resolver.ts` is the single query interface for all content. Never query SQLite or homebrew table directly from UI.

**Real-time sessions** — Supabase Realtime channel `session:{session_id}`. Optimistic updates on client. Session state changes emit to `session_events` (append-only — `Update: never` in types).

**Local PDF indexing** — PDF parsing happens on-device via Expo SQLite with FTS5. PDF content is NEVER transmitted to server. Hard legal constraint.

---

## RLS Gotchas (hard-won)

- `campaigns` ↔ `characters` policies were mutually recursive — fixed with security-definer helpers `is_campaign_dm` and `is_campaign_member`.
- `INSERT ... RETURNING` evaluates the SELECT policy; if it calls a security-definer function using `auth.uid()`, it can fail — fix: split INSERT and SELECT into separate queries (see `createCampaign` in `packages/api/src/campaigns.ts`).
- Campaigns SELECT policy must NOT use `is_campaign_member` — use inline `auth.uid() = dm_user_id` check directly in the policy.
- FK violations on RLS-protected tables surface as RLS errors, not FK errors.

---

## Dependency Notes

- `metro ~0.82.5` and `metro-source-map ~0.82.5` must stay pinned — Expo 53 needs them hoisted
- `nativewind` pinned to `4.0.36` — 4.1.x requires RN 0.81+
- `react-native-reanimated ~3.17.4` and `react-native-css-interop ^0.2.3` hoisted — required by NativeWind
- `scripts/patch-metro.js` removes `exports` field from metro packages (runs on postinstall)
- Always use `npx expo install <pkg>`, not plain `npm install`

---

## Design Tokens

All colors/fonts in `packages/ui/src/tokens.ts`. Never hardcode hex values.

```
brand: #534AB7 | background: #12110f | surface: #0e0d0b | border: #2e2b25
textPrimary: #e8e0cc | textSecondary: #7a7568
hpHealthy: #1D9E75 | hpWarning: #EF9F27 | hpDanger: #E24B4A
Fonts: Cinzel (display), Crimson Pro (body) — Dark mode only for MVP
```

---

## GitHub Workflow

- **Push only after user confirms** a feature is tested and working — never push speculatively.
- **Branch before pushing** any new feature or change that could conflict with parallel work. Name branches `feature/<short-description>` or `epic/<epic-name>`. Push the branch and open a PR; do not push directly to `master`.
- **Pull before starting work** — always run `git pull origin master` (or rebase the current branch onto master) before making new changes, to minimize drift.
- **Merging to master** — only after the user has confirmed the feature works. Prefer squash or rebase merge to keep history clean.
- When the user says a feature is done and ready to ship, commit → push the feature branch → prompt them to merge the PR rather than merging automatically.

---

## Legal Constraints

- Bundle SRD 5.1 + SRD 2.0 only (CC-BY 4.0 — attribution required in app)
- User-uploaded PDFs: local device only, never transmitted to server or other users
- Party sync: character state + homebrew only — no source text from any publisher
- ToS must state users are responsible for lawful rights to uploaded content
