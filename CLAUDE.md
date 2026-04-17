# Vaultstone — Claude Code Guide

System-agnostic TTRPG campaign management app for iOS, Android, and web.
GitHub: https://github.com/tyfoultz/Vaultstone

## Project Docs

All project tracking, feature requirements, and architecture decisions live in `docs/` in this repo.

- [docs/README.md](docs/README.md) — master index
- [docs/architecture.md](docs/architecture.md) — tech stack, DB schema, content architecture, MVP scope
- [docs/legal.md](docs/legal.md) — content licensing rules, user-uploaded PDF constraints, party sync rules
- [docs/build-status.md](docs/build-status.md) — phase-by-phase build checklist and current status
- [docs/dev-workflow.md](docs/dev-workflow.md) — local verification workflow (Tier 1 typecheck + Tier 4 Playwright functional check)
- [docs/features/](docs/features/) — full requirements for all 7 features + PDF rulebook feature

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
- `INSERT ... RETURNING` evaluates the SELECT policy; if it calls a security-definer function using `auth.uid()`, it can fail. Historical workaround was splitting INSERT and SELECT into separate client queries. **Preferred pattern:** wrap multi-step create flows in a `security definer` RPC (see `create_campaign_with_gm` in `supabase/migrations/20260419000000_*.sql` and its caller in `packages/api/src/campaigns.ts`). The RPC sidesteps the RETURNING-triggered policy re-eval, keeps the flow atomic (no orphan rows on partial failure), and lets the server own `auth.uid()` and generated values like join codes.
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

All colors/fonts in `packages/ui/src/tokens.ts` (mirrored in `tailwind.config.js`). Never hardcode hex values.

**Vaultstone Noir — "Magical Midnight"** (dark-only). Foundation landed via the Noir overhaul; screens not yet migrated to primitives still render through the legacy token aliases below, so the new palette applies everywhere automatically.

```
Surface hierarchy (void-first):
  surface #121416 | surface-container-lowest #0c0e10
  surface-container #1e2022 | surface-container-high #282a2c | surface-container-highest #333537

Accents:
  primary #d3bbff | primary-container #6d28d9 | on-primary #3f008d
  secondary #adc6ff | secondary-container #0566d9

Text + lines:
  on-surface #e2e2e5 | on-surface-variant #ccc3d7
  outline #958da1 | outline-variant #4a4455

Semantic state (preserved):
  hp-healthy #1D9E75 | hp-warning #EF9F27 | hp-danger #E24B4A

Fonts: Space Grotesk (headline/display) + Manrope (body/label).
Legacy aliases (brand, background, border, textPrimary, textSecondary) remap onto the Noir palette for backward compat.
```

**Token semantics gotcha — `surface` vs `surfaceCanvas`.** Legacy `colors.surface` is a *card/elevated* alias mapped to `surfaceContainerHigh` (#282a2c) so existing StyleSheets pop against the canvas without per-screen edits. The explicit void canvas is `colors.surfaceCanvas` (#121416) — use it when you need the page background. The Tailwind config keeps the canonical Noir naming (`bg-surface = #121416 = canvas`), so NativeWind classes follow Material 3 semantics directly. This split is intentional scaffolding for the Phase C reskin: legacy StyleSheet code reads `colors.surface` as cards, NativeWind code reads `bg-surface` as canvas.

**Primitives** — prefer `@vaultstone/ui` primitives (`Surface`, `Card`, `GradientButton`, `GhostButton`, `Input`, `Chip`, `MetaLabel`, `SectionHeader`, `ScreenHeader`, `Text`, `GlassOverlay`, `Icon`) over raw RN components on new screens. Screen-level reskin (Phase C) is incremental — existing `StyleSheet`-based screens keep rendering with the new palette via legacy aliases.

---

## Local Verification Before Push

Full procedure in [docs/dev-workflow.md](docs/dev-workflow.md).

1. **Tier 1 — `npm run typecheck`.** Run on every push. Goal is "no net new errors," not "zero errors." The repo has a known baseline of ~13 errors (stale `.expo/types/router.d.ts` + Supabase join typings); track the count before and after your changes.
2. **Tier 4 — Playwright against `npm run web`.** **Run only when Tyler explicitly asks.** Playwright MCP opens a visible Chromium window that steals desktop focus, so running it unprompted is disruptive. When asked: sign in as the test user (`.env.test` → `TEST_USER_EMAIL`/`TEST_USER_PASSWORD`), drive the 1–2 golden-path interactions, confirm the expected DOM / screenshot, then stop the dev server you started.

Default pre-push = Tier 1 + push + Netlify preview. Tiers 2 (`expo export` pre-push) and 3 (Netlify deploy watch) were intentionally excluded — Netlify itself is the backstop for bundler-only regressions.

---

## GitHub Workflow

- **Sync with `origin/master` at the start of every session**, before planning, building, or answering "is X done?" questions. Parallel work lands on master via PRs from other sessions, devices, or collaborators, and local branches go stale fast. Run these two commands first thing:
  - `git -C <repo> fetch origin`
  - `git -C <repo> log origin/master --oneline -20` — scan for recently merged PRs that may have built or changed what you're about to touch.
  If master has moved ahead of the current branch, surface that to the user *before* you start work — don't re-invent a feature that already shipped, and don't plan against stale code. When in doubt, `git diff <branch>..origin/master --stat` on the files you're about to modify.
- **Update relevant documentation before pushing.** Before every push, review whether your changes affect anything tracked in `docs/` (architecture, build-status, feature specs, dev-workflow, legal) or in `CLAUDE.md` itself, and update those files in the same commit. Docs and code ship together — a push that moves the codebase past its documentation is a broken push.
- **Push feature branches before user testing.** Netlify builds previews from GitHub branches, so the user needs the branch pushed in order to exercise the web build. Commit + push as soon as a feature is implementation-complete and locally type-checks; don't wait for user confirmation to push.
- **Never push directly to `master`.** All work lands on a feature branch (`feature/<short-description>` or `epic/<epic-name>`) and merges through a PR.
- **Branch before making changes** that could conflict with parallel work. If you're already on a feature branch for the active task, keep using it — don't open a new branch per commit.
- **Pull before starting work** — always run `git pull origin master` (or rebase the current branch onto master) before making new changes, to minimize drift.
- **Merging to master** — only after the user has confirmed the feature works in the Netlify preview / on device. Prefer squash or rebase merge to keep history clean.
- When the user says a feature is done and ready to ship, prompt them to merge the PR rather than merging automatically.

---

## Claude Code Tooling

- Never chain commands with `&&` or `;` when each individual command is already allowed by `Bash(git:*)` or similar rules. Use separate parallel Bash tool calls instead — they run concurrently and don't trigger permission prompts.
- **Never prefix git (or other project) commands with `cd <path> && ...`.** The permission system flags any `cd` + `git` compound as a potential bare-repository attack and asks for approval, even though `git:*` would otherwise allow it. Instead, use `git -C <absolute-path> <subcommand>` — it scopes git to the target repo without `cd`, so the call matches `Bash(git:*)` directly. The same pattern applies to other CLIs that accept a working-directory flag (e.g. `npm --prefix <path> ...`).

---

## Legal Constraints

- Bundle SRD 5.1 + SRD 2.0 only (CC-BY 4.0 — attribution required in app)
- User-uploaded PDFs: local device only, never transmitted to server or other users
- Party sync: character state + homebrew only — no source text from any publisher
- ToS must state users are responsible for lawful rights to uploaded content
