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
- [x] Realtime enabled on `sessions`, `initiative_order`, `characters`, `session_events` (Session Mode Phases 1–4 all rely on it; verified live in production)
- [x] Auth flow end-to-end — sign up, log in, log out, reset password (2026-04-13)

---

## Phase 4: GameSystemDefinition Schema

- [x] `GameSystemDefinition` TypeScript interface — `packages/types/src/systems.ts`
- [x] D&D 5e definition — `packages/systems/src/dnd5e/` (all 6 ability scores + modifiers, combat stats, resource pools, 6 sheet sections)
- [x] Custom system definition — `packages/systems/src/custom/` (open-ended empty template)
- [x] Both systems seeded to `game_systems` table
- [x] Schema exercised against the full SRD bundle (24 classes × 2 editions, 22 species, 1,256 magic items, 655 monsters, etc.) plus eight 5e.tools imported transforms — sufficient validation for the dnd5e + custom launch scope. Re-evaluating against PF2e remains a Post-MVP v2 task before that system lands.

---

## Phase 5: MVP Feature Build

### 1. Auth ✅ Complete
Sign up, log in, log out, persist session. Route guards in `(auth)` and `(tabs)` layouts. `initialized` flag prevents flash-of-wrong-screen. Forgot/reset password flow complete (2026-04-13).

### 2. Campaign Creation ✅ Complete
DM creates campaign with name, 6-char join code (server-generated with collision retry via the `create_campaign_with_gm` RPC — atomic with the GM membership insert), stored in DB. Campaign list shows all user campaigns via RLS. Campaign detail shows join code with copy-to-clipboard.

### 3. Campaign Join ✅ Complete
Player enters 6-char join code. Campaign looked up via security-definer RPC (bypasses RLS safely). Membership recorded in `campaign_members`. Player sees DM vs Player role badge.

### 4. Character Builder ✅ MVP Complete

| Phase | Status | Summary |
|---|---|---|
| Phase 1 — Content Foundation | ✅ Done | SRD seed data + ContentResolver. Full bundle in `packages/content/src/srd/data/`: 22 species, 24 classes (12×2 editions), 24 subclasses, 5 backgrounds, 18 feats, 30 conditions, 295 items, 1,256 magic items, 655 creatures, 341 spells, 283 rules, plus 13 catalog types. |
| Phase 2 — Character Data Shape | ✅ Done | `Dnd5eStats` + `Dnd5eResources` interfaces; `getMyCharacters()` API; **server-side wizard drafts** via `character_drafts` table + API (replaced AsyncStorage-only persistence). |
| Phase 3 — Creation Wizard | ✅ Done | 6-step wizard (ruleset → species → class → background → ability scores → review). Roll Dice, Standard Array, Point Buy, Manual methods. Campaign linking on the Ruleset step; system + content packs inherit from selected campaign. Standalone homebrew pack picker. |
| Phase 4 — Character Sheet | ✅ Done | Tabbed sheet (Combat / Spells / Skills / Traits / Gear / Lore). Live ContentResolver content scoped to the character's campaign + pack opt-in: class & subclass features (filtered by entry level, multiclass-aware), species traits, background body, origin feat with full description + benefits, conditions catalog (homebrew flows through), proficiencies merged from class + background with source attribution, spell management modal (filter by class + level, scoped to packs), equipment catalog picker (parses ItemResult properties into damage / AC / dexCap / shield bonus), skill descriptions on long-press. Header (species + class names) resolves through ContentResolver so imported keys like `imported_dnd5e_2014_class_efa_artificer` render as "Artificer". `resources.classFeatures[]` / `speciesTraits[]` retained as a "Custom" subsection so player-added entries survive. |
| Phase 5 — Campaign Linking | ✅ Done | Character ↔ campaign linking landed via the wizard's Ruleset step (links the draft to a campaign and its content packs) and via the campaign-side "Create character in this campaign" entry point. Both surfaces write to `campaign_members.character_id`. |
| Phase 6 — Character Builder Options | ✅ Done | Data layer + enforcement surfaces behind the campaign rules toggles. Structured types (FeatPrerequisite / MulticlassPrereq / SpeciesSwapRules), feat prereq transform (14/14 SRD feats parsed), multiclass prereq transform (24/24 classes), species swap rules (5.1 locked, 5.2 swap-everything), `class-feature-variant` kind on OptionalFeatureKind, homebrew feat authoring with composite prereq builder, system page surfaces, character-sheet catalog feat picker, wizard rules step + L1 feat picker. See [features/character-builder.md](features/character-builder.md). |
| Phase 7 — Character Leveling | 🟡 In Progress | Level-up flow + multi-class data model + `starting_level > 1` bootstrap. Multi-class entries on Dnd5eStats with legacy fallback for older characters; pure leveling library (HP / spell slot / class feature / subclass-unlock / ASI-level / multiclass-prereq helpers); `applyLevelUp` pure state transition; level-up wizard at `/character/[id]/level-up` with class / subclass / HP / ASI / confirm steps; multiclass entry gated by the `multiclassing` campaign rule; Level Up button on the character sheet header. Spell-pick step on level-up + feat picker invocation at ASI deferred to follow-up. See [features/character-builder.md](features/character-builder.md#level-up-arc-follow-up). |
| Epic 7 — Sheet Import & Hyperlinking | ⬜ Planned (post-MVP) | Long-running plan: upload an existing sheet (PDF/image/JSON) → extract stats → resolve content via ContentResolver → hyperlinked sheet rendering. The original spec referenced a Feature 8 PDF text-extraction index that has since been deleted; this epic now resolves against the SRD bundle + homebrew packs (authored + imported) instead. See [01-character.md Epic 7](features/01-character.md#epic-7--character-sheet-import--auto-population--planned-post-mvp). |

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
| 2 — Initiative tracker | ✅ Done | DM adds combatants (name/init/HP/AC), removes them, and advances the turn cursor; `advanceTurn` wraps to the top and bumps `session.round`. Full list refetched on any `initiative_order` change for the session so all clients stay in sync. Includes "Add Party" picker: pulls campaign members with linked characters, stats (HP/AC/init mod) pulled from the character sheet. |
| 2.5 — Initiative rolling + combat start | ✅ Done | Combatant rows store an **init modifier** (not total); dedicated rolling phase. DM can Roll All, roll per-row, or manually enter the player's announced final total (written to `init_override`, which takes precedence over mod + d20 and hides the d20 breakdown — physical-dice tabletop flow); players can roll for their own PC via `roll_combatant_initiative` RPC (security-definer ownership check). Start Combat locks in `combat_started_at` and sets round 1; Next Turn only enabled after. Sort: total desc → mod desc → PC > NPC → id. Reset Initiative clears rolls + overrides and reopens setup. |
| 3 — HP + conditions sync | ✅ Done | DM can +/- HP per combatant row; for PCs the change mirrors back to `characters.resources.hpCurrent` so the character sheet reflects post-combat state. Conditions modal uses the standard 14 SRD conditions; writes to `characters.conditions`. All clients get live updates via a `characters` subscription filtered by `campaign_id`. NPC conditions are deferred — `initiative_order` has no conditions column and a later migration will add it. |
| 4 — Participants, per-user notes, history | ✅ Done (PR #15) | DM picks participants on Start Session; each player + DM gets a private `session_notes` row during play. Migration `20260417000000_session_participants_notes_summary.sql` adds `session_participants`, `session_notes`, and `sessions.summary` with RLS that hides live notes until `ended_at` flips, then opens them to every campaign member. Session History card on the campaign detail page lists ended sessions with recap + everyone's notes (440px scroll cap). Party view filters to `{DM} ∪ participants` when a session is live. Hero (cover) card absorbs campaign description + Start/End Session action; old standalone Session + About cards removed. `app/campaign/[id]/session.tsx` renamed to `combat.tsx`; lifecycle moves to campaign detail page. Combat tracker adds End Combat button (clears `combat_started_at` without destroying rolls). Notes panel uses single-editor BroadcastChannel model so the `/campaign/[id]/notes` pop-out and inline rail stay in lockstep. End Session is confirm-only — inline recap field removed in favor of Epic 8 (Campaign Notes Hub, scaffolded as a "Coming soon" DM-only card). |
| 5 — Campaign Notes Hub (Epic 8 in 06-notes.md) | ✅ Done | Dedicated DM-only route `/campaign/[id]/recap`: collapsible session sidebar on the left and a `react-mosaic-component` dock on the right that lets the DM resize, drag-rearrange, and pop out each panel (Recap, Your Session Notes, Player Notes) into its own browser window. Layout persists per-device via `useRecapLayoutStore`. Pop-out coordination is presence-only via BroadcastChannel — the dock-side panel goes read-only with a banner while a pop-out is alive, then refetches/rehydrates when it closes. RLS migration `20260418000000` lets DMs edit their own notes on any session, ever. Native devices fall back to a stacked single-column layout (no drag/resize/pop-out). All editors use the shared `RichTextEditor` / `RichTextRenderer` Markdown surface. "Insert from player" text-lift intentionally deferred. |
| 5.1 — Notes Hub polish pass | ✅ Done | (a) Dark mosaic theme — dropped `mosaic-blueprint-theme` class and bumped scoped overrides to 3-class specificity so toolbar + body backgrounds stop rendering white; explicit `textarea { background }` kills RN-web's default light textarea. (b) Editors flex to fill their tile — `RichTextEditor` defaults to `flex: 1` when no `minHeight` prop is passed; recap + DM notes panels drop their fixed heights. Session Mode notes rail still passes explicit values so it keeps a scrollable min. (c) "Session N" labels (oldest = 1) in the hub sidebar and Session History card; date + duration become secondary metadata. (d) Publish flow made reliable — parent state updates in the same render via an `onPublished` callback so the recap shows immediately (no page reload); `SessionHistoryCard` switched to `useFocusEffect` so returning to the campaign page refetches; "Published hh:mm" pill persists until the DM edits again instead of being clobbered by the effect that reset it. (e) Back button uses `router.canGoBack() ? back() : replace('/campaign/[id]')` so a browser refresh on the hub route still lands you back on the campaign page. |

**Realtime prerequisite:** enable Realtime on `sessions`, `initiative_order`, `characters`, and `session_events` in the Supabase dashboard. Phase 1 uses `sessions`; Phase 2 adds `initiative_order`; Phase 3 adds `characters`; `session_events` is now required by Feature 7 (Session Log) — the live feed silently degrades to a refetch-on-focus view if Realtime isn't enabled, but the DM-visible "LIVE" pill will lag until it is.

**Known limitation (Phase 2):** `initiative_order` uses default `REPLICA IDENTITY`, so DELETE Realtime events don't match the `session_id` filter. The session screen refetches on any change rather than applying payloads piecemeal, which masks this — but a later phase should switch to `REPLICA IDENTITY FULL` if we move to incremental updates.

### 7. Session Log ✅ MVP Complete
Append-only event feed backed by the existing `session_events` table.
Events are emitted from the API layer (`packages/api/src/sessions.ts`,
`packages/api/src/characters.ts`) whenever Session Mode mutations run
with a `SessionEventContext` attached — edits outside a live session
skip the log by design. First-pass event types: `combat_started`,
`combat_ended`, `hp_changed`, `condition_added`, `condition_removed`,
`turn_advanced`, `initiative_rolled`. Payload schema is self-describing
(names baked in) so a later recap-summary generator can consume the log
standalone; a `narration` variant is reserved for future DM free-text.
Viewer components live at `components/session/SessionLog{Row,Feed,Card}.tsx`:
Combat screen mounts the full live feed, Party view + campaign detail
page mount a compact card that resolves to the active-or-most-recent
session via `getMostRecentSessionForCampaign`. Realtime delivery uses the
`session-log:{id}` channel on INSERT — the earlier `session:{id}` channel
is still used for the combat state subscriptions.

### 8. Imported Content + PDF Reader ✅ Shipped

The original "PDF Rulebook" feature spec was superseded — see commit
history on `feature/imported-content`. PDFs as a *content-extension*
mechanism (text extraction → FTS index → typed search) was dropped in
favor of structured JSON imports. The PDF reader stays as a separate
in-app reading affordance.

| Component | Status | Summary |
|---|---|---|
| Campaign-side PDF reader | ✅ Done | Upload (`expo-document-picker` + `expo-file-system` / IndexedDB) + ToS gate + viewer (`react-native-pdf`). Read-only — no text extraction or indexing. |
| Imported content tier (merged into homebrew tier) | ✅ Done | Imports land in the Supabase `imported_content` table parented under the importer's `homebrew_packs` row — same parent table as authored homebrew. The `ContentResolver`'s homebrew tier reader merges both tables and surfaces them under one unified content-pack concept. Re-imports replace via the `(pack_id, entry_key)` upsert key. |
| 5e.tools content transforms | ✅ Done | Eight per-content-type transforms in `packages/content/src/imported/transform/` cover subclasses, feats, spells, backgrounds, items (mundane + magic), species (race + subrace), monsters, and classes. Each parses the matching 5e.tools array(s) into our `*Result` shape; shared `entries.ts` flattens `entries[]` blocks and strips inline `{@tag}` markup. |
| Import UI | ✅ Done | Three-state file-pick + ToS + progress modal at `components/imported/ImportContentModal.tsx`. Local file pick only — no URL fetch. Driven by an `IMPORT_KINDS` registry so the disclosure list, Confirm probe rows, diagnostic copy, and upsert loop are all single-source-of-truth. Adding a new content type is one transform file plus one registry entry. |
| Game-Systems-side surface | ✅ Done | Per-system detail page surfaces every authored + imported pack in a unified Content Packs row with per-pack toggles. Per-pack detail page lists entries grouped by content type. |
| Source provenance | ✅ Done | `ImportSource` field on every `ContentResult`; `SourceBadge` primitive renders codes ("PHB", "SRD 2024", pack name) on every entry across the app. |
| Authoring forms | ✅ Done | Six in-app authoring forms for spells, creatures, items, feats, classes, species writing to `homebrew_content` under the same `homebrew_packs` parent. |
| PDF parsing/FTS pipeline | ⬛ Removed | The original PDF text-extraction + on-device FTS index was deleted entirely when the imported-content arc shipped. The reader stays as a separate read-only viewer. |

**Legal:** Distinct posture between PDFs and imports. Uploaded PDFs stay on the
uploader's device only and are never indexed. Imported structured JSON content
goes to the importer's user-scoped pack on Supabase; the user accepts a
per-import in-app ToS callout affirming they have lawful rights to the content,
and only entries from packs the GM explicitly attaches to a campaign reach the
party. See [legal.md](legal.md).

### 9. World Builder & Campaign Knowledge Base 🟡 Polish Sprint In Progress

Full rewrite of Feature 7. Notion/OneNote-style world workspace with sections,
unlimited nested pages, rich editor with `@mention` chips, uploaded maps with
categorized pins, per-page player reveal + per-user sharing grants, pessimistic
page-level edit locks, timelines as first-class pages with DM-defined calendar
schemas, unified search, and a campaign-side world lookup drawer. See
[features/07-world-building.md](features/07-world-building.md) for the full
refined spec and [plans/world-builder-rewrite.md](plans/world-builder-rewrite.md)
for the short-form plan.

**Status:** Phases 1–7e shipped to master. Polish sprint in progress on
`feature/world-builder-polish`. Shipped incrementally:

- **3a** — Tiptap rich body editor on web with StarterKit + Noir ProseMirror
  styling, native TextInput fallback, 800ms debounced autosave writing
  `body` + `body_text`. Commit `1f958c7`.
- **3b** — `@`-mention typeahead with pages-in-this-world, styled chip
  inserted into the doc, `body_refs[]` persisted on save, GIN-indexed
  backlinks panel ("Linked from") rendering pages that mention this one.
  Commit `5cfff80`.
- **3c** — `claim_world_page_edit` / `release_world_page_edit` RPCs
  (migration `20260422000000_world_pages_edit_lock.sql`, 90s TTL),
  `claimPageEdit` / `releasePageEdit` API wrappers, `EditLockBanner`
  component, claim-on-mount / 30s heartbeat / release-on-unmount wired
  into the page-detail screen with the editor + structured-fields surface
  disabled (pointer-events none + dimmed) when another editor holds the
  lock. BEFORE-trigger body derivation + native 10tap editor + mention
  deleted-target chip + Android perf flag still outstanding.
- **3d — Design fidelity pass.** Page-detail screen now matches the
  handoff `.wiki-wrap`: 780px main scroll column (28/48/64 padding) +
  280px `WikiRightPanel` with Sub-pages / Backlinks / History tabs.
  `PageHead` rebuilt as `.wiki-head` (76px accent-tinted gradient tile,
  42px display title, icon+label meta pills via `metaPills` prop, legacy
  `meta` kept for world landing + section-detail). `EditLockBanner`
  rebuilt as `.takeover-banner` (amber gradient + 3px left accent,
  pencil icon, live countdown, Request Takeover pill). Tiptap editor
  prose restyled to `.wiki-p` / `.wiki-h2` (15px/1.7 body, bordered h2),
  mention chips restyled as tight accent pills (3px radius, nowrap,
  no double `@`).

Phase 2 (Sections + Pages + Templates, design-integrated) shipped on
`feature/world-builder-phase-2`. Design handoff checked in at
`docs/design/vaultstone-handoff/` and now locks the three-column shell
(rail + contextual sidebar + main), the serif display typography
(Fraunces + Cormorant Garamond, scoped to `/world/*`), and the semantic
accent palette (`player`, `gm`, `cosmic`, plus existing `hpDanger` for
danger). Feature 6 (Session Notes & Campaign Notes Hub) stays on its
existing Markdown editor and is untouched, aside from one Phase 6
integration (manual "Add to world timeline" button on published recaps).

| Phase | Status | Summary |
|---|---|---|
| 1 — Foundation | ✅ | `worlds` + `world_campaigns` tables, `is_world_owner` RLS helper, `create_world_with_owner` atomic RPC, `/worlds` list + create modal, `/world/[id]` shell with sidebar + gear-triggered settings modal (rename / link / archive / soft-delete), lens dropdown placeholder. |
| 2 — Sections & pages (no editor) | ✅ | `world_sections`, `world_pages` (with `template_version` + edit-lock columns reserved), section templates v1 + registry + CI hash check, sidebar with unlimited nesting, structured-fields form, move-page-across-sections, Recently Deleted scaffold. Three-column shell (rail + sidebar + main), serif display typography scoped to `/world/*`, semantic accent palette, `Card tier="hero"`, `VisibilityBadge`, `PageHead`, Atlas landing, section grid/list views. |
| 3 — Editor, chips, backlinks, edit lock | ✅ | 3a/3b/3c/3d done: Tiptap web editor + debounced autosave, `@`-mention typeahead + `body_refs` backlinks, edit-lock RPCs + banner + 30s heartbeat, handoff fidelity pass. **Polish sprint additions:** BEFORE-trigger for server-side `body_text` / `body_refs` derivation (migration `20260513000000`), deleted-target mention chips (grey inert pills with strikethrough + blocked navigation), force-unlock RPC (`force_release_world_page_edit`, migration `20260511000000`) + "Force Unlock" button on EditLockBanner. Still outstanding: native 10tap editor, web hover preview on mentions, Android perf benchmark + progressive-disable flag. |
| 4 — Visibility, lens, PC stubs, permissions | ✅ | **4a** VisibilityBadge interactive toggle + optimistic write. **4b** section visibility overrides (`force_hidden_from_players`, `default_pages_visible`). **4c** RLS helpers (`user_can_view_page` / `user_can_edit_page`) + updated world/section/page policies. **4d** `world_page_permissions` table + recursive `effective_page_permission` CTE + `ShareModal` with direct / inherited source chips, cascade toggle, profile search. **4e** `LensDropdown` (`.campaign-switch` crown+chevron chrome) + `?lens=<campaignId>` entry heuristic in world layout. **4f** Player View preview toggle (owner-only pill) + teal preview banner + client-side mirror of visibility rules in sidebar. **4g** `OrphanBanner` on pages whose parent is missing locally (re-link via `movePage` to section root) + `LensSwitchBanner` (amber 6s auto-dismiss on lens transition). **4h** PC stub lifecycle triggers — `character_id` / `campaign_id` / `title_overridden` / `is_orphaned` columns on `world_pages`, `(world_id, character_id)` partial unique index, `materialize_pc_stub(world_id, character_id, campaign_id)` SECURITY DEFINER fn with ON CONFLICT relink + `title_overridden` preservation. Triggers drive off `campaign_members` (the real player↔campaign linkage): `tr_campaign_members_sync_stubs` covers INSERT/UPDATE/DELETE (materialize on add, orphan on remove/swap, re-adopt on re-link), `tr_world_campaigns_materialize_stubs` backfills stubs when a world links to a campaign, `tr_world_campaigns_orphan_stubs` flags on unlink, `tr_characters_sync_stubs` syncs title on rename (when not overridden), `tr_characters_orphan_stubs` flags on character delete. Cross-account share flow verified Tier 4 (owner grants view → grantee sees page via `user_can_view_page` RLS helper). |
| 5 — Maps, pins & nesting | ✅ | **5a** `world_maps` + `pin_types` (7 seeded) + `map_pins` tables, `world-maps` private Storage bucket with RLS matching world ownership/sharing, `storage_used_bytes` tally triggers on upload/delete. **5b** `@vaultstone/api` helpers (`listMaps`, `createMap`, `uploadMapImage`, `listPinsForMap`, `upsertPin`, `deletePin`, `listPinTypes`) + `getSignedMapUrl` RPC. **5c** `MapCanvas.web.tsx` using `react-zoom-pan-pinch` (wheel-zoom, pan, onTransform → viewport store) and `MapCanvas.tsx` using `react-native-gesture-handler` + Reanimated (pinch + pan, composed via `Gesture.Simultaneous`). **5d** `PinLayer` + `PinEditorModal` (type chips from `pin_types`, label, linked-page search, open/unlink actions). **5e** `PinFilterBar` (per-type chips + Show all) positioned absolute top-left on canvas frame. **5f** `/world/[worldId]/map/index.tsx` list page + empty state with owner-only Upload button; `MapUploadModal.web.tsx` (DOM file input + `URL.createObjectURL` for dims) and `MapUploadModal.tsx` (expo-image-picker + `fetch(uri).blob()`) validate MIME (jpeg/png/webp) + 20MB cap. **5g** Tiptap mention extension extended with `kind='page'\|'pin'` + `mapId` attrs; `MentionSuggestion.web.tsx` accepts optional `getPins`; `body_refs` extraction filters to `kind==='page'\|\|null` for legacy parity; pin mentions deep-link to `/world/[worldId]/map/[mapId]`. **5h** `MapBreadcrumbs` renders drill stack above canvas; `viewportByMapId` Zustand store persists pan/zoom per map; drill-stack cold-land reconciles push/pop/reset by stack index; "View sub-map" action appears on `PinEditorModal` when the linked page owns its own `world_map`. **5i** Native upload modal ships. Native (iOS/Android) smoke test deferred — file added to Deferred verification list. **5j — Canvas UX polish.** Double-tap zoom replaced with a vertical `ZoomControl` bar (+/-, 0–100% fill, 8 even steps driven by `setTransform` instead of the library's exponential `zoomIn/Out`). Mouse-wheel step pinned to `sliderStep / 100` so one notch = one tick. Pan momentum disabled. Owner-only right-click on the canvas drops a pin at the cursor (bypasses placement mode). Default zoom is resolution-aware: `minScale = canvas-fit` so the whole map is visible on cold landing regardless of image size, `maxScale = max(fit * 4, 2)` so 8k uploads can zoom past native pixels. Stored viewports restored on return, clamped to new bounds. Migration `20260423000000_world_maps_drop_image_key_unique.sql` drops the `world_maps.image_key` unique constraint so sub-maps can legitimately share parent imagery. `WorldRail` now routes the diamond brand tile to `/(drawer)/home` (Vaultstone home) and adds a dedicated home icon below it for the current world's landing page. |
| 6 — Timelines + Feature 6 integration | ✅ | **6a** `timeline_events` table + `compute_timeline_sort_key` BEFORE trigger (number→direct, ordered_list→index, text→hashtext bucket) + `recompute_timeline_children_sort_keys` AFTER trigger on parent calendar_schema change + RLS (owner all, member SELECT visible on viewable pages) + `trash_timeline_event` RPC + `create_world_with_owner` extended to seed Timeline section + primary timeline page + backfill migration for existing worlds. **6b** `TimelinePageView` page-kind dispatcher in `[pageId].tsx` + `CalendarSchemaEditor` (ordered units: text/number/ordered_list with options, accordion-collapsed, debounced 800ms save to `structured_fields.__calendar_schema`). **6c** `TimelineEventCard` (date label, body preview, session badge, visibility, edit/trash actions) + `EventEditorModal` (create/edit with dynamic date_values form + ordered_list chip selector + visibility toggle). **6d** Timeline mention kind (`kind: 'event'`) wired into `MentionSuggestion.web.tsx` + `BodyEditor.web.tsx` `mentionableEvents` prop + page detail fetches events from all timeline pages for @ popover. **6e** `AddToWorldTimelineButton` on published recaps — converts Markdown→Tiptap via `marked` + `@tiptap/html`, creates timeline event with `source_session_id` for idempotency, looks up campaign's linked world + primary timeline page. |
| 7a — Players section & stub enrichment | ✅ | **PlayersSectionView** replaces default list for Players template — summary stats row (party size, avg level, party HP, total XP), PCCards for active stubs with hydrated character data (vitals, ability scores, conditions, hooks, inventory), orphaned-stubs section, custom handout pages list. **PCStubPageView** page-detail for `pc_stub`/`player_character` pages — character hero card (vitals + ability scores + conditions), structured-fields form, body editor, edit lock, `title_overridden` tracking with rename + reset-to-character-name affordance. **OrphanResolveModal** — convert orphan to custom page, move to another section, or soft-delete. **`getCharactersByIds`** bulk API helper for efficient card rendering. **`updatePage`** extended to accept `title_overridden` in its patch. Dispatchers wired in `[sectionId].tsx` (template_key=players → PlayersSectionView) and `[pageId].tsx` (pc_stub/player_character → PCStubPageView). |
| 7b — Images, storage, compression | ✅ | **Migration** `20260502000000_world_builder_phase_7b.sql`: `world_images` table + `world-images` private bucket (10MB/file, jpeg/png/webp) + RLS (owner write, row-existence read) + `tr_world_images_storage_tally` trigger mirroring Phase 5 pattern. **API** `world-images.ts`: `uploadWorldImage`, `createWorldImage`, `getWorldImageSignedUrl[ById]`, `listImagesForPage`, `softDeleteWorldImage`, `getMyStorageUsage` (500MB cap, 80% warn, 100% block). **Tiptap** custom `worldImage` atom node (imageId/alt/width/height attrs, not `@tiptap/extension-image` — avoids stale signed URLs in doc JSON). **NodeView** `WorldImageNodeView.web.tsx` resolves signed URLs on mount with module-level cache (50min TTL), loading spinner, error boundary. **ImageUploadModal.web.tsx** — file pick, MIME+size validation, client-side compression via canvas (`toBlob` JPEG q=0.8, max 1920px), upload, insert node. **StorageUsageBadge** reads `profiles.storage_used_bytes`, renders pill at ≥50% with warn/block states. Toolbar image button wired into `BodyEditorToolbar`. Web-only for 7b (native editor is still plain TextInput). **Deferred to Phase 8:** storage reconciliation cron, Supabase read-side resize. |
| 7c — Search + campaign lookup drawer | ✅ | **Migration** `20260503000000_world_search_rpcs.sql`: `search_world` RPC (pages by title/body_text/structured_fields, pins by label, timeline events by title, ILIKE, title-match prioritized, paginated) + `search_campaign_worlds` RPC (cross-join lateral across all linked worlds). **API** `world-search.ts`: `searchWorld`, `searchCampaignWorlds` with typed results. **WorldSearchDrawer** replaces placeholder Input in WorldSidebar — debounced 300ms, dropdown results panel with Load More pagination, orphan badges, visibility badges, section labels. **CampaignWorldsCard** on campaign detail page lists linked worlds with "Search" button. **CampaignWorldLookupDrawer** modal searches across all worlds linked to a campaign, shows world name per result row. |
| 7d — Sidebar overhaul + Location redesign | ✅ | **Sidebar:** Rail removed entirely; sidebar absorbs Home/Map/Timeline/Settings with collapsible icon-only mode (persisted). Always-visible sections, persistent collapse, chevrons on parent pages, auto-reveal ancestors. Sub-page creation via hover "+". Context menu (right-click web / long-press native): Indent, Outdent, Move up/down, Move to section, Rename, Delete. Section header context menu (Add page, Settings, Delete). DnD web via react-dnd with Notion-style 3-zone drop targets. **LocationPageView:** Stitch-design layout — compact breadcrumb bar, icon + title row, inline property pills strip (TYPE with icon, REGION, POP, RULER, TERRAIN, DANGER with semantic colors, tags with +Tag affordance), LoreCanvasEditor (click-to-place text boxes with 12px snap grid, drag to reposition, horizontal-only block resize, PowerPoint-style table size picker 7×6, image paste with auto-sizing, multi-handle image resize — corner aspect-locked + side handles for independent H/V scaling, image drag/drop to reposition, full rich toolbar: font size dropdown with live preview on hover, B/I/U/strikethrough, text color + highlight pickers, superscript/subscript, clear formatting, heading, bullet/numbered lists, indent/outdent, 4-way alignment, Tab/Shift+Tab table cell navigation, Delete/Backspace on selected images, deferred text box creation with blinking cursor), save indicator overlay. Right sidebar wired up: **Map Pin** shows cropped/zoomed map preview centered on the pin location with "Open Map" link (fetches via `getPinsForPage` + signed URL); **Seen in Play** shows timeline events that `@mention` this page via `getEventsReferencingPage` (GIN-indexed `body_refs` query) with session badge, relative time, title, body snippet; **Mentioned On This Page** and **Linked From** already live from prior work. Right sidebar is collapsible (32px strip with expand chevron). Canvas editor supports `@mentions` (typeahead popup, styled chips, `body_refs` persistence). **Editable property pills** — click any pill to edit inline (dropdown for selects, text input for text fields, 500ms debounce save). Empty pills show as dashed placeholders. **NPCs Here** sidebar section — bidirectional NPC discovery via `body_refs`. **Hooks & Rumors** sidebar section — lightweight bullet list stored in `structured_fields.__hooks` with inline add/remove. Right sidebar with 3 tabs (On This Page with Map Pin placeholder + Mentioned entities from body_refs + Seen in Play placeholder + Linked From backlinks; Sub-locations; History). **locations.v2 template** adds Type, Population, Danger Level, Terrain select fields. Compact field renderers (TextField, SelectField, PageRefField with modal picker). Branch: `feature/world-dashboard-cleanup`. |
| 7e — NPC + Faction page uplift | ✅ | **NPCPageView** rewritten to match Location page pattern: compact breadcrumb bar, 72px circle portrait with gradient + initials, title + role/species subtitle, inline stat chips (threat/status/disposition with semantic colors), editable property pills strip. Full-width LoreCanvasEditor replaces old TipTap BodyEditor (existing TipTap body silently preserved in DB; canvas starts fresh). **npcs.v3 template**: adds gender (select), status (alive/dead/missing/unknown), disposition (friendly/neutral/hostile/unknown), faction (page_ref to factions); drops visibility_note + tags. **Right sidebar** (collapsible, matching Location): Mentioned On This Page, Locations (inverse of Location's "NPCs Here" — locations whose body_refs include this NPC), Linked From, Seen in Play, Hooks & Rumors. Sub-pages tab. **Shared components** extracted to `PageSidebarShared.tsx`: PillEditor, SideSectionHeader, RightTabBtn, HookInput, formatRelativeTime, MENTION_ICON, PAGE_SIDEBAR_STYLES — both Location and NPC pages import from shared file. **FactionPageView** dedicated layout. **Reciprocal NPC relationships** — adding ally/rival/mentor/etc auto-creates the inverse on the target NPC; symmetric types mirror (ally↔ally), inverse pairs swap (mentor↔student, employer↔servant); delete removes both sides. **Canvas multi-mention fix** — `resolveTextNode` helper handles Chrome's auto-generated wrapper spans after `contentEditable=false` chips; chip insertion hoisted to content root to prevent nesting. **Sidebar overhaul (continued):** Maps section added to sidebar tree (collapsible, lists all maps, click-to-navigate, add button for owners); section drag-to-reorder via `useSectionDnd` hook + `reorderSections` API; map drag-to-reorder via `useMapDnd` hook + `reorderMaps` API (migration adds `sort_order` to `world_maps`); map context menu (rename, set as primary, delete); section headers redesigned (bold uppercase label-md, icon moved right, chevron compacted) so section names sit further left than page names. Page context menu labels renamed: Indent → "Make sub-page", Outdent → "Promote sub-page". **Map pin preview popup** — clicking a pin with a linked page shows a floating card with portrait, kind-specific fields (location: type/ruler/population/danger/region; NPC: role/species/status/disposition; faction: doctrine/leader/size/stance), canvas snippet (upper-left text block, first 250 chars), `@mention` chips (clickable, navigate to linked page), and action buttons (Open page + Edit pin for owners). **Relationship Web** — force-directed graph visualization at `/world/:id/relations` showing all world entities as nodes (colored by page_kind) and their connections as edges. Three edge layers: manual `__relationships` (ally, rival, etc.), structural `page_ref` fields (faction membership, leadership, HQ), and `@mention` body_refs. `react-force-graph-2d` renders a Canvas-based graph with custom node drawing (geometric icons per kind), edge styling (solid/dashed by source), arrowheads on directed edges, hover-to-highlight connected subgraph, edge labels on hover, drag-to-pin nodes. Filter bar with kind chips + edge source chips. Node detail card on click with connections list + Open Page. Sidebar hub icon in both expanded and collapsed states. Native placeholder. **Timeline @mentions** — rich text editor (TipTap BodyEditor) in event description with @mention typeahead for all world pages; click mention → navigate to page. Branch: `feature/npc-page-uplift`. |
| 8 — Polish & deletion UX | 🟡 | **Done:** Recently Deleted restore UI (list + restore RPCs for pages/sections/maps, `RecentlyDeletedModal`, sidebar "Trash" link), deleted-target mention chips (grey inert pills, click blocked), force-unlock RPC + UI, BEFORE trigger for body_text/body_refs derivation, session date picker fix, home button in expanded sidebar, `@mention` save fix (immediate save on insert, flush-before-navigate). **Still outstanding:** daily hard-delete cron + Storage reaper, weekly bucket reconciliation, template-upgrade modal, Android editor perf tuning, a11y + keyboard pass. |
| 15 — Relationship web polish + split-screen + UX sprint | ✅ | **Relationship web:** force-collision tuned (synchronous d3-force import, charge −120, collision radius label-aware, iterations 4), auto zoom-to-fit on settle, hover highlights connections without dimming others, right-click "Hide from web" with `__hidden_from_relation_web` structured field + "Hidden (N)" restore chip, GhostButton "Reset view" (top-right), collapsible legend panel (bottom-right) with edge-type descriptions. **Split-screen page view (web-only):** `useSplitPaneStore` (non-persisted Zustand) tracks `splitPageId` + `splitRatio` + `focusedPane`; `PagePaneContent` extracted from monolithic `PageDetailScreen` route; `SplitPaneShell.web.tsx` renders two panes with a draggable divider (6px, 20–80% clamp); `SplitPaneTitle` compact 36px header per pane; right-click sidebar → "Open in split view" (or "Open in other pane" when already split); both pages highlighted in sidebar with purple accent border; right panels default collapsed in split mode; standardized 120px `headerWrap` across all 6 page-kind views for cross-template alignment; independent edit locks per pane. **NPC:** removed duplicate role/species/status/disposition display from portrait head — editable property pills are the single source. **PC Stub:** linked character section moved inline with portrait/name row. **Timeline:** drag-to-reorder events within same era (HTML5 drag events, `tie_breaker` column). **Search:** diacritic-insensitive fuzzy search for @mentions and world sidebar search (Unicode NFD + combining mark strip); `unaccent` Postgres extension for server-side search RPC. **Ctrl+K:** keyboard shortcut wired to world search; label shows "Ctrl+K" on Windows, "⌘K" on Mac. **Sidebar:** more compact vertical spacing (row padding 6→3, section gap reduced, header height 32→28); nav icon tooltips via `ref.setAttribute('title', tip)`. **Page editor:** heartbeat guard against stale effect closure. |
| 9 — Entity Dossier | ✅ | `NodeDetailCard` expanded into full dossier panel on the relationship web. Shows structured field properties from template, relationships grouped by source (manual/structural/mention), backlinks, timeline appearances. `useNodeDossier` hook for data fetching. |
| 10 — Session Prep | ✅ | Pin pages to a session prep scratchpad viewable on the world home page. `SessionPrepPanel` renders pinned page cards from `structured_fields.__pinned_pages`. "Pin to session prep" in `PageContextMenu`. |
| 11 — Page type picker | ✅ | `CreatePageModal` shows template type chips (Locations, NPCs, Factions, Lore, Players, Timeline, Blank) when creating a page. Defaults to the section's own template. All new pages default to `visible_to_players = false` (DM only). |
| 12 — Player page uplift | ✅ | `PCStubPageView` rewritten with canvas editor, portrait upload (72px circle, crop/zoom), compact character sheet link, NPC-style right sidebar (Mentioned, Locations, Linked From, Seen in Play, Relationships with reciprocal support, Goals, Hooks & Rumors), character picker from linked campaigns. |
| 13 — Player visibility + world members | ✅ | `ShareModal` gains "Player visibility" section: "Visible to all players" toggle (always visible — works for world members and campaign players) + per-player checkboxes grouped by campaign. Individual grants use `world_page_permissions` with clickable VIEW/EDIT toggle chip. Interactive `VisibilityBadge` in topbar opens ShareModal (single entry point for all sharing). **World members:** `world_members` table with `is_world_member` security-definer helper (breaks RLS recursion), `worlds_member_select` + `world_sections_member_select` policies, extended `user_can_view_page` for member path. Members see the world in their list (with "Shared" chip), all `visible_to_players` pages, and explicit page grants. World owner manages members via "Members" section in WorldSettingsModal (search + add/remove). Edit lock RPCs (`claim_world_page_edit` / `release_world_page_edit`) extended to honor `user_can_edit_page` for edit grantees. Realtime subscription on `world_page_permissions` pushes permission changes to members without page refresh. `buildPageTree` promotes sub-pages to root level when parent is filtered by RLS. Non-owner read-only mode: view-only members see all editors disabled, no orphan banner, no edit lock banner. |
| 14 — World Builder UX polish | ✅ | **Sidebar:** World thumbnail redesigned as 16:10 cover with name overlaid on gradient; settings gear moved to footer; Lens dropdown and Trash button removed; crop modal now uses matching aspect ratio with usage hint and zoom slider (step 0.01, max 5x). **Canvas editor:** Keyboard shortcuts (Ctrl+B/I/U/S + Ctrl+./Ctrl+/ for lists) override browser defaults via capture-phase handler; styled CSS tooltips on toolbar buttons; active format highlighting (bold/italic/underline/strikethrough/lists track via `queryCommandState`); text color set to `#ffffff` (white), font size 16px; list toggle fixed (unwrap instead of nesting); single cursor enforcement (blur on canvas click, clear pending on focus); clickable area extended to border; copy/paste works before text block creation (Ctrl+V and right-click); canvas scrolling (`overflow: auto` + ResizeObserver-driven content height with 120px padding); focused/dragged blocks render on top of overlapping blocks via z-index; image drag requires left-button + 4px movement threshold (right-click copy works without shifting). **Mention system:** `cascadeMentionLabel` updates all referencing pages on rename (LoreCanvas HTML regex + Tiptap JSON walk); render-time label refresh from store; migration `20260514` backfills stale labels. **Edit lock:** phantom lock banner fixed — only shows on genuine lock conflicts, not CORS/network errors (all 6 page views). **@mention insertion:** chip inserted as sibling instead of hoisting to root, fixing mid-paragraph text displacement. **Right sidebar:** all sections (mentions, seen in play, linked from, NPCs, locations, relationships, hooks) collapsible via `CollapsibleSideSection`; MAP PIN and HEADQUARTERS stay non-collapsible. **Map:** Reset View uses `centerView(minScale)` for true fit-to-screen reset; signed URL caching (1hr TTL, in-memory). **Pages:** Double-click title rename on all page types (Location, NPC, Faction, generic/PageHead) with mention cascade; right-click paste on canvas. **Player pages:** `players.v2` template with `defaultPageKind: 'pc_stub'` + migration to fix existing pages; `getTemplate` fallback prevents crash on version mismatch. |

**Verification:** per-phase Tier 1 (`npm run typecheck`) + targeted Tier 4
Playwright smoke test. End-to-end Tier 4 run in Phase 8: create world, link 2
campaigns, build sections with nested pages, upload map + pins, share a subset
of pages with specific users (some direct, some cascade), verify visibility +
edit + lock behaviors across owner, grantee, player, and unrelated accounts.
RLS audit matrix covers: world-level with hidden section, campaign-scoped in
wrong campaign, direct grant, cascaded grant, soft-deleted, orphaned, visible
child of a soft-deleted parent.

#### Deferred verification — to run on first iOS/Android build

These items shipped with web-only verification and need a smoke test the
first time we build a native dev client (likely during Phase 6 TestFlight
prep, or sooner if any feature work needs `expo run:ios`/`run:android`).

- **World Builder Phase 5 — native map canvas + upload.** Code is in place
  (`MapCanvas.tsx` uses gesture-handler + Reanimated; `MapUploadModal.tsx`
  uses expo-image-picker + `fetch(uri).blob()` — same pattern as
  `uploadCampaignCover`) but has only been exercised on web.
  - Smoke test: open a world → map list → upload a JPEG from camera roll →
    confirm image lands and pan/pinch/double-tap gestures feel right →
    place a pin, link a page, verify the pin tap opens the editor. Sub-map
    drill + breadcrumbs are web-tested; re-run on native to catch any
    stack-sync regressions. **Expo Go works for this** — no native module
    beyond gesture-handler/reanimated, both already in the Go manifest.

## Design System Overhaul — Vaultstone Noir

Paradigm shift from warm parchment (Cinzel / Crimson Pro) to "Magical Midnight" void-black + celestial purple/blue, editorial typography (Space Grotesk / Manrope), glass sidebars, bento layouts. Reference designs authored in Stitch; HTML + PNG source kept locally (not tracked).

- [x] **Phase A — Foundation.** Tokens + Tailwind config rewritten to Noir palette; radius scale; typography scale. `expo-blur`, `expo-linear-gradient`, Space Grotesk + Manrope fonts installed. Breakpoint utility + Icon wrapper added to `@vaultstone/ui`. 12 primitives populated in `packages/ui/src/primitives/` (`Surface`, `Card`, `Chip`, `Text`, `MetaLabel`, `SectionHeader`, `ScreenHeader`, `Input`, `GradientButton`, `GhostButton`, `TextButton`, `GlassOverlay`).
- [x] **Phase B — Shell & auth.** Drawer reskinned with glass sidebar, gradient active nav item, new wordmark, 256px expanded width. Auth screens (login, signup, forgot-password, reset-password) migrated to primitives as the test-bed.
- [x] **Phase B polish (2026-04-17).** Sidebar moved to `surfaceContainerLow` with a hairline outline-variant border so it reads distinctly against the canvas. Active nav item swapped to a flat `primary-container @ 40%` fill with `primary`-tinted icon and label (matches Stitch reference; covers nested routes via `startsWith`). Collapse-toggle redrawn as a 32px right-anchored pill with 22px chevron. Repointed the legacy `colors.surface` alias from the canvas value (#121416) to `surfaceContainerHigh` (#282a2c) so every existing StyleSheet card pops without per-screen edits; introduced `colors.surfaceCanvas` for code that explicitly wants the void.
- [ ] **Phase C — Screen reskin.** ~25 content screens (campaigns, characters, campaign detail tabs, character wizard, session mode, notes). Legacy tokens.ts aliases mean these already render with the Noir palette and cards already pop; visual-system migration to primitives is incremental. Screen-by-screen ~0.5–1 day each.
- [ ] Migrate remaining 18 `MaterialCommunityIcons` callsites to the `Icon` wrapper.
- [ ] Refactor remaining 9 inline `useWindowDimensions()` callsites to `useBreakpoint()`.
- [ ] Adopt `Text` primitive across content screens (replaces `import { Text } from 'react-native'`).

---

## Phase 6: TestFlight / Internal Testing

*After all 7 MVP features are working:*

- [ ] Configure EAS Build — `eas build:configure`, set up `eas.json` profiles
- [ ] Build for iOS — `eas build --platform ios --profile preview`
- [ ] Submit to TestFlight — `eas submit --platform ios`
- [ ] Invite players — add testers in App Store Connect
- [ ] Run a real session
- [ ] **Run deferred native smoke tests** — see *Deferred verification*
      above (currently: World Builder Phase 5 native map canvas)
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
