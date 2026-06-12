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
- [docs/features/](docs/features/) — full requirements for all 7 features (PDF rulebook spec is superseded; see CLAUDE.md "Imported content tier" + "PDF reader" sections below)

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

**ContentResolver** — `packages/content/src/resolver.ts` is the single query interface for all content. Never query the `homebrew_content` / `imported_content` tables directly from UI; go through ContentResolver so SRD + authored homebrew + imports merge with consistent tier priority and dedupe. **Edition scoping gotcha:** SRD rows are keyed under the legacy `'dnd5e'` system with the edition conveyed via `srdVersion`, while homebrew packs carry edition-suffixed system ids (`dnd5e_2014` / `dnd5e_2024`) — and the homebrew tier treats bare `'dnd5e'` as the 2024 alias. Campaign-context callers must translate `campaign.system` through `systemQueryArgs()` (exported from `@vaultstone/content`) instead of hardcoding `system: 'dnd5e'`; hardcoding silently drops every 2014-edition pack from the results (the encounter-builder "imported monster missing" bug).

**Real-time sessions** — Supabase Realtime channel `session:{session_id}`. Optimistic updates on client. Session state changes emit to `session_events` (append-only — `Update: never` in types).

**Imported content** — Users extend a Game System with structured JSON content (e.g. 5e.tools per-content-type exports). The picked file is parsed and transformed in the browser/native runtime via `packages/content/src/imported/transform/*` (subclasses, feats, spells, backgrounds, items, species, monsters, classes — one transform per content type, all driven from a single `IMPORT_KINDS` registry in `components/imported/ImportContentModal.tsx`), then upserted into the Supabase `imported_content` table under a `homebrew_packs` row owned by the importer. Imports surface alongside authored homebrew under the unified content-pack concept; the homebrew tier reader merges both tables. Hard legal constraint: users are responsible for the rights to anything they import; the user accepts an in-app ToS callout before each import.

**Pack export / import** — A pack owner can export an entire pack (authored entries + imported JSON content) to a `vaultstone-pack/v1` JSON file via the Export button on the pack detail page. Another user can pick that file from the system page's Import tile to restore the pack under their own account. Implementation lives in `packages/api/src/pack-transfer.ts`; the new pack is created fresh under `auth.uid()`, all entries re-stamped to the new owner — no shared state, just a one-way handoff. Importer must accept the per-import ToS callout (same posture as the JSON-import path) before the pack lands. See [docs/legal.md](docs/legal.md) Part 3.

**PDF reader** — Campaign-side PDF upload + in-app reader at `app/campaign/[id]/rulebook.tsx` and `pdf-viewer.tsx`. Uses `expo-document-picker` + `expo-file-system` (native) / IndexedDB (web) for storage; `react-native-pdf` for the viewer. Read-only — no text extraction or full-text search (those were removed when the imported-content arc shipped). Distinct legal posture from imports: PDFs stay on the uploader's device and never reach Supabase, while imported JSON is server-stored under the importer's pack. See [docs/legal.md](docs/legal.md).

**World members** — Direct user membership in a world without requiring a linked campaign. `world_members` table with `is_world_member` security-definer helper. Members see the world in their worlds list, all `visible_to_players` pages (in non-hidden sections), and any pages with explicit `world_page_permissions` grants. Owner manages members via WorldSettingsModal. Non-owner view is read-only unless the user has an 'edit' grant (checked via `effective_page_permission` RPC on mount + Realtime subscription for live permission changes). `buildPageTree` promotes sub-pages whose parent is RLS-filtered to root level. Edit lock RPCs (`claim_world_page_edit` / `release_world_page_edit`) honor `user_can_edit_page` for edit grantees.

**Split-screen page view** — Web-only. `useSplitPaneStore` (non-persisted Zustand) holds `splitPageId | null`, `splitRatio` (0.2–0.8), and `focusedPane`. The URL-driven `[pageId].tsx` route reads the store and renders `SplitPaneShell.web.tsx` (draggable divider) wrapping two `PagePaneContent` instances when split is active. `PagePaneContent` is the extracted page-kind dispatcher that both panes render — it owns edit locks, mention data, save state, and delegates to the specialized view (Location/NPC/Faction/Timeline/PCStub) or the default generic wiki view. Each pane runs its own heartbeat independently. Entry: right-click sidebar page → "Open in split view".

**AI assistant** — `@vaultstone/ai` chat assistant on **Google Gemini Flash (free tier)**. **Thin relay + client-side tools:** the `ai-chat` Edge Function (`supabase/functions/ai-chat`) is a stateless secret-holder — it verifies the JWT, authorizes the caller against the campaign, and forwards one Gemini `generateContent` turn with a **server-pinned model** (never trust a client-supplied model). The **client** owns the agentic loop (`runAssistantTurn`) and every tool; tools run under the user's Supabase session so **RLS is the scoping mechanism** (a player can't fetch DM-only content). Context is fetched on demand via Gemini function calling — never pre-stuffed. The Gemini key is a Supabase secret, never in the client (so it's free to the developer; the free tier shows a data-processing disclosure — see [docs/legal.md](docs/legal.md) Part 7). Chat history is **device-local only** (`ai-chat.store.ts` → AsyncStorage); no message tables. Player access is gated per-campaign by `campaigns.ai_settings.playerAccessEnabled` (DM toggles it in the assistant panel; the Edge Function re-checks server-side). A `bump_ai_usage` RPC enforces a per-user daily cap (the only server-side row written). UI reuses the floating-notes overlay chassis. **Tools are read-only; the SRD bundle is client-only, so tools must run client-side.** Adding a tool = one entry in `packages/ai/src/tools/registry.ts`. See [docs/architecture.md](docs/architecture.md#ai-assistant).

---

## RLS Gotchas (hard-won)

- `campaigns` ↔ `characters` policies were mutually recursive — fixed with security-definer helpers `is_campaign_dm` and `is_campaign_member`.
- `INSERT ... RETURNING` evaluates the SELECT policy; if it calls a security-definer function using `auth.uid()`, it can fail. Historical workaround was splitting INSERT and SELECT into separate client queries. **Preferred pattern:** wrap multi-step create flows in a `security definer` RPC (see `create_campaign_with_gm` in `supabase/migrations/20260419000000_*.sql` and its caller in `packages/api/src/campaigns.ts`). The RPC sidesteps the RETURNING-triggered policy re-eval, keeps the flow atomic (no orphan rows on partial failure), and lets the server own `auth.uid()` and generated values like join codes.
- Campaigns SELECT policy must NOT use `is_campaign_member` — use inline `auth.uid() = dm_user_id` check directly in the policy.
- FK violations on RLS-protected tables surface as RLS errors, not FK errors.
- `world_members` ↔ `worlds` policies were mutually recursive — the `worlds_member_select` policy queried `world_members`, whose `world_members_owner_all` policy queried back into `worlds`. Fixed with `is_world_member(p_world_id)` security-definer helper that only queries `world_members` (never `worlds`), breaking the cycle. Same pattern as `is_campaign_member` — always use a security-definer helper that doesn't join back to the table the calling policy lives on.
- **Realtime respects the SELECT policy.** Supabase `postgres_changes` only delivers a row change to a client that passes the table's RLS SELECT policy. When the DM-pinned campaign scene wasn't updating for players, the cause was twofold: (1) `campaigns` had to be added to the `supabase_realtime` publication (migration `20260618…`), and (2) `world_images_member_select` gated reads on the *source page's* visibility, so players couldn't load an image pinned from a GM-only page. Fix: an additive `world_images_campaign_pin_select` policy (migration `20260622…`) lets campaign members read any image pinned as that campaign's `scene_image_id`/`subject_image_id`. Same shape for DM-shared session notes: a `shared` flag + a "members read shared" policy + `session_notes` added to the realtime publication (migration `20260623…`). Lesson: sharing features need both a publication entry AND a SELECT policy that grants the *recipients* read access to the explicitly-shared row.

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

1. **Tier 1 — `npm run typecheck`.** Run on every push. Goal is "no net new errors," not "zero errors." The repo has a known baseline of 6 error lines across 3 files (`app/campaign/[id]/index.tsx`, `app/character/[id].tsx`, `packages/api/src/characters.ts` — Supabase join typings + a `Dnd5eStats` null-narrowing case + an unmodeled `avatar_url` column); track the count before and after your changes.
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

## SRD Content Import

Bundled SRD content lives in `packages/content/src/srd/data/*.json` and is sourced from [Open5e v2](https://api.open5e.com/v2/) (CC-BY 4.0; see http://open5e.com/legal). The pipeline pulls from both `srd-2014` (5.1 SRD) and `srd-2024` (5.2 SRD) documents and merges them per content type.

1. **Fetch snapshots** from the Open5e v2 API into `vendor/srd/open5e/`:
   ```
   node scripts/import-srd/fetch-open5e.js              # all types
   node scripts/import-srd/fetch-open5e.js spells       # one type
   ```
   Each snapshot file contains entries from *both* documents — the `document.key` field on each entry tells the transform which edition it came from. Snapshots are checked into the repo so imports are reproducible.
2. **Transform** the snapshot into our `*Result` shape:
   ```
   node scripts/import-srd/transforms/spells.js
   ```
   Each transform groups entries by name and unions their edition tags. `srdVersions` ends up `['SRD_5.1']`, `['SRD_2.0']`, or `['SRD_2.0', 'SRD_5.1']` depending on which documents had the entry. When descriptions diverge between editions the 2024 text is preferred; per-edition description support is a future schema extension.
3. **Augment item flavor text** (items only) by patching from a second source:
   ```
   node scripts/import-srd/augment-flavor.js
   ```
   Open5e's `/items/` endpoint strips most descriptive prose — especially in the SRD 2024 dataset, which often reduces a paragraph to a one-liner ("A breastplate."). The augment step reads the vendored BTMorton SRD 5.1 snapshot at `vendor/srd/btmorton/{equipment,magic-items}.json` (also CC-BY 4.0), harvests `***Name.*** flavor text` entries plus magic-item leaves, and patches `items.json` for any entry with a thin/stub description. The same SRD 5.1 flavor is applied to both 5.1 and 5.2 entries — the underlying physical object is unchanged and 5.2 dropped flavor prose entirely. Run after `transforms/items.js`. Idempotent.
4. **Drop the seed flag** from `SEED_ONLY_TYPES` (in `packages/content/src/srd/index.ts`) for any type whose bundle is now full.

Coverage as of last refresh:
- ✅ spells — 341 entries (317 in both editions, 22 new in 2024, 2 dropped from 2024)
- ✅ conditions — 30 entries (15 conditions × 2 editions; per-edition descriptions, since 5.1 and 2024 diverge meaningfully — most notably Exhaustion's level-track redesign)
- ✅ feats — 18 entries (1 SRD 5.1, 17 SRD 5.2; per-edition entries — Grappler is the only feat in both, with diverged text). Categories: origin (4), general (3), fighting-style (4), epic-boon (7)
- ✅ backgrounds — 5 entries (1 SRD 5.1: Acolyte; 4 SRD 5.2: Acolyte, Criminal, Sage, Soldier). The hand-curated seed had 14 PHB-flavored entries; replaced with strict SRD coverage. Non-SRD backgrounds (Folk Hero, Charlatan, etc.) belong to a future homebrew-pack feature.
- ✅ species — 22 entries (13 SRD 5.1 base + subspecies, 9 SRD 5.2). 5.1 ships subspecies (High Elf, Hill Dwarf, Lightfoot, Rock Gnome) as their own entries with size/speed inherited from parent; 5.2 dropped subspecies in favor of in-species choices. Half-Elf and Half-Orc are 5.1-only — folded into Human/Orc in 2024.
- ✅ items (mundane equipment) — 295 entries (158 SRD 5.1 + 137 SRD 5.2). Per-edition entries because Open5e's /items/ data has wildly inconsistent naming across editions ("Crossbow, hand" vs "Hand Crossbow", "Half plate" vs "Half Plate Armor"). Categories: weapon (81), armor (25), shield (1), adventuring-gear (188). Spellcasting foci (druidic foci, holy symbols, arcane focuses, component pouches) flow into adventuring-gear since the SRD lists them alongside other personal gear, not as crafting tools. Magic-item categories (wondrous-item, potion, scroll, rod, wand, staff, ring) are intentionally excluded from `transforms/items.js` — the /items/ endpoint produces stub entries for those (just "Wand", "Rod") that collide with the proper variant-level catalog from /magicitems/. The /weapons/ and /armor/ endpoints are sub-views of /items/ — the weapon{} and armor{} sub-objects on each item entry carry the mechanical detail, so we pull only /items/.
- ✅ magic items — 1,256 entries (499 SRD 5.1 + 757 SRD 5.2) from Open5e's /magicitems/ endpoint. Per-edition entries because 2024 rewrote magic-item rules (Bag of Holding gained Astral Plane breathing limits, etc.). Each entry carries rarity, attunement requirement, attunement_detail prose, weapon{} or armor{} sub-objects when applicable, and a `data.magicItemKind` discriminator (wand/ring/potion/scroll/wondrous-item/weapon/armor/shield/ammunition/rod/staff). Open5e quirks: the /magicitems/ document filter is broken (returns mixed sources including third-party Vault of Magic), so we drop entries whose `key` doesn't start with `srd_*` or `srd-2024_*`; same dedupe-by-key step as /items/ since fetching both editions returns each entry twice. Loaded into the same `ItemResult[]` stream as mundane items, so the existing UI sub-tabs (Weapons/Armor/Magic Items/etc.) flow them through unchanged. By rarity: 5 common, 304 uncommon, 481 rare, 294 very-rare, 170 legendary, 2 artifact. 512 require attunement.
- ✅ creatures (monsters) — 655 entries (325 SRD 5.1 + 330 SRD 5.2). Per-edition keyed because the 2024 SRD is a full stat-block rewrite (revised action economy, restructured saves/skills, Bonus Action attacks). Includes structured ability scores, modifiers, proficient saves/skills, senses, languages, traits, actions, resistances/immunities, environments, hit dice, XP. Proficient saves are derived by comparing each ability's saving-throw bonus to its raw modifier — Open5e's `saving_throws` field is unreliable as a proficient-only subset. CR distribution: 221 CR <1, 209 CR 1-4, 130 CR 5-10, 55 CR 11-16, 40 CR 17+.
- ✅ classes — 24 entries (12 SRD 5.1 + 12 SRD 5.2). Per-edition keyed because feature lists diverge significantly (2024 introduces Weapon Mastery, Brutal Strike, Epic Boon; 5.1 has Brutal Critical/Primal Path naming). Each entry carries hit die, primary ability, saves, armor/weapon/tool proficiencies, skill choices, full leveled feature list, and per-level progression table (Prof Bonus + class-specific columns like Rages, Sneak Attack, Spell Slots). 2024's `CORE_TRAITS_TABLE` markdown is parsed for the proficiency block; 5.1 uses a separate `PROFICIENCIES` feature with bold-labeled lines. Subclasses (`subclass_of !== null`) are filtered out and live in the separate `subclasses.json` catalog. Open5e ships `caster_type: null` for every 5.1 class (data gap upstream), so spellcasting is detected via a known-caster name list. Skill list typo fix: 2024 Wizard's "In sight" → "Insight". Multiclass prerequisites and proficiencies are hand-curated in the transform since Open5e doesn't ship that table.
- ✅ subclasses — 24 entries (12 SRD 5.1 + 12 SRD 5.2). Pulled from the same `/classes/` snapshot, filtered to `subclass_of !== null`. Per-edition keyed because the feature levels diverge (Champion's Remarkable Athlete shifts L7→L3 in 2024, Heroic Warrior is 2024-only) and several subclasses were renamed (Wizard "School of Evocation" → "Evoker", Sorcerer "Draconic Bloodline" → "Draconic Sorcery", Monk "Way of the Open Hand" → "Warrior of the Open Hand", Warlock "The Fiend" → "Fiend Patron"). `parentClassKey` is edition-suffixed (`barbarian-srd-5-1`, `wizard-srd-2-0`) so the class detail page filter `parentClassKey === c.key` matches the right edition. 2024 standardizes subclass unlock at L3 for every class; 5.1 had Cleric/Sorcerer/Warlock at L1 and Wizard at L2.
- ✅ tools — 74 entries (35 SRD 5.1 + 39 SRD 5.2). Per-edition because the 2024 SRD restructures tool names into "Family, Variant" form ("Musical Instrument, Bagpipes", "Gaming Set, Dragonchess") and bakes prices into the display name ("Smith's Tools (15 GP)"); the transform strips both for the canonical name. 2024 entries carry structured `ability` (which ability the proficiency check uses — Alchemist's Supplies → Intelligence), `utilize` (quick-reference DC bullets), and `craft` (item names this tool can craft) fields parsed out of Open5e's flattened "Ability: X. Utilize: Y. Craft: Z" desc string; 5.1 entries don't ship those structured fields. Categories: artisan (27), gaming-set (4), musical-instrument (19), other (24 — Thieves'/Disguise/Forgery/Healer's/Herbalism/Climber's/Poisoner's/Navigator's kits and tools, plus 5.1 entries without family prefixes).
- ✅ rules (rules-of-play) — 283 entries (227 SRD 5.1 + 56 SRD 5.2) from Open5e's `/rules/` endpoint. Each entry is a leaf section ("Advantage and Disadvantage", "Cover", "Initiative", etc.) with a `chapter` label derived from Open5e's `ruleset` slug and an `order` field preserving per-chapter document order. Per-edition entries because 2014 and 2024 use entirely different chapter taxonomies (the 2024 SRD reorganized rules into 9 chapters: Combat, Damage and Healing, Exploration, Multiclassing, etc.; 5.1 has 29 chapters covering more ground including monsters, planes, pantheons). There is no separate `/rule-sections/` endpoint — `/rules/` already returns leaves. `RuleResult.data` carries `headerLevel` (h2/h3/h4 from the source) and `rulesetSlug` (raw chapter key) for future hierarchy rendering. Surfaced under the new "Game Rules" group on the per-system detail page, grouped by chapter and rendered through MarkdownText to handle embedded pipe tables.

---

## Legal Constraints

- Bundle SRD 5.1 + SRD 2.0 only (CC-BY 4.0 — attribution required in app)
- **User-uploaded PDFs**: local device only, never transmitted, never indexed. Reader is private to the uploader.
- **User-imported structured JSON content** (e.g. 5e.tools): stored on Supabase under the importer's `homebrew_packs` row. Distinct posture from PDFs because the user can choose to attach the pack to a campaign they DM and share its entries with that party. **The user must accept a per-import in-app ToS callout** before each import affirming they have lawful rights to the content.
- Party sync: character state + homebrew (authored or imported via attached pack) — never raw publisher source text or PDF contents.
- The full posture, including the rationale for why imports leave the device while PDFs do not, lives in [docs/legal.md](docs/legal.md). Update both in lockstep when policy changes.
