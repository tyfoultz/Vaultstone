# Plan — Feature 7 Rewrite: World Builder & Notes Manager

> **Status:** Plan only — no implementation yet. Parked on branch
> `feature/world-builder-rewrite-plan`. Build begins when Tyler gives the go-ahead.

## Context

Feature 7 (`docs/features/07-world-building.md`) is a 0%-built, 8-epic spec inherited from an earlier scoping pass. The user wants it **rewritten from scratch** to match a Notion/OneNote-inspired vision: a world-first workspace where a sole-DM creates worlds, organizes them into sidebar sections (default + user-defined), writes free-form pages with unlimited sub-pages, drops categorized pins on uploaded maps, and reveals content to players on a per-page basis. A world can be linked to multiple Vaultstone campaigns.

This plan rewrites Feature 7 in full and lays out an 8-phase build. Feature 6 (Session Notes & Campaign Notes Hub) stays on its current Markdown editor and is untouched, with one minor integration: a manual "Add to world timeline" button on published recaps.

Scope is the **entire feature to completion**, not just an MVP cut.

---

## Locked vision decisions

1. **Page scope** — Every page is `world-level` (shared across linked campaigns) or `campaign-level` (visible only via that campaign's lens). Scope is changeable after creation.
2. **Session recap → timeline** — Opt-in manual button on published Feature 6 recap: "Add to world timeline" creates a pre-filled timeline entry.
3. **Player reveal** — Per-page `visible_to_players` toggle (default off) + section-level override (`force_hidden_from_players`, `default_pages_visible`).
4. **Maps** — Multiple maps with drill-down nesting. World has a primary home-screen map. Any Location page can attach its own map. Pins linking to locations with sub-maps offer "View Sub-map" with breadcrumb navigation.
5. **Section templates** — Structured typed fields + free-text body. First-class searchable/filterable data. Templates code-defined (not user-defined).
6. **Map pins** — 7 categorized types with default icons/colors (overridable per pin): City, Landmark, NPC, Faction HQ, Event, Quest, Generic. Filter bar toggles visibility by type.
7. **Images** — Per-page attachments only. Uploaded inline; owned by the page; delete page → delete images.
8. **PC linkage** — One-way. Pages can tag PCs from linked campaigns; character sheets stay unchanged.
9. **Lens behavior**:
   - Enter from homepage → `world-only` default with lens dropdown in header.
   - Enter from campaign detail → that campaign's lens pre-selected; DM can still flip to `world-only`.
   - Dropdown can be switched mid-session; current page stays if still in-lens, else shows "not in this lens" banner.
   - Lens filters what the DM sees (not a DM override that shows everything).
   - Page scope changeable after creation.
10. **Players section** — Hybrid: linked-campaign PCs auto-materialize as stub pages (campaign-scoped); DM can enrich them and create custom player/handout pages. Unlinking a PC flags its stub `is_orphaned`; DM re-resolves.
11. **Custom sections** — "Create New Section" opens a template picker: 4 defaults + 4 extras (Religions, Organizations, Items, Lore) + Blank. No user-defined field schemas.
12. **Search** — Default scope current world. Toggle chip expands to all owned worlds. Hits page title, structured fields, body plain text, pin labels, timeline events.
13. **Deletion** — Soft-delete with 30-day recovery on worlds/sections/pages/maps/timeline. Daily purge of `hard_delete_after < now()`. Campaign deletion unlinks but preserves the world; affected pages become orphaned.
14. **Nesting** — Unlimited sub-page depth, Notion-style.
15. **Chip for deleted target** — Inert grey pill with old label + `(deleted)`. Clickable in DM view if within 30-day recovery to restore.
16. **Storage cap** — 500MB per user, soft cap with 80% warning in world settings. Above 100% blocks new uploads. Images > 2MB compressed server-side on upload.
17. **Native editor** — 10tap-editor (Tiptap-in-WebView) on iOS and Android for parity with web Tiptap. Optimize if mid-range Android shows lag; no Markdown fallback.
18. **Orphan search** — Orphaned pages included by default in search with "Orphaned" badge on result; filter chip to exclude.

---

## Data model

Single `worlds` + `world_campaigns` (many-to-many join) + `world_sections` + `world_pages` with a nullable `campaign_id` to encode scope. `structured_fields` stored as JSONB blob validated against code-defined section templates. PC stubs are materialized rows (`page_kind = 'pc_stub'`) created by triggers on campaign-link + character-added events. Pin types live in a reference table; map pins store percentage coordinates.

Full table list (all include `created_at`, `updated_at`; soft-deletable tables add `deleted_at` + `hard_delete_after`):

- `worlds` — id, owner_id, name, tagline, cover_image_key, primary_map_id
- `world_campaigns` — (world_id, campaign_id) PK, linked_at
- `world_sections` — id, world_id, template_key, title, sort_order (fractional), force_hidden_from_players, default_pages_visible
- `world_pages` — id, world_id, section_id, parent_page_id (unlimited nesting), campaign_id (nullable = scope), page_kind, character_id (stubs only), title, icon, body (Tiptap JSONB), body_text (FTS), body_refs (uuid[] for backlinks), structured_fields (JSONB), visible_to_players, is_orphaned, sort_order
- `page_pc_links` — (page_id, character_id) PK
- `world_maps` — id, world_id, owner_page_id (null = world primary), campaign_id, label, image_key, image_width, image_height, aspect_ratio
- `pin_types` — reference table (7 rows, seeded)
- `map_pins` — id, map_id, world_id (denorm), pin_type, x_pct, y_pct, label, icon_key_override, color_override, linked_page_id
- `timeline_events` — id, world_id, campaign_id, title, body, body_text, body_refs, in_world_date, era, sort_order, source_session_id, visible_to_players
- `world_images` — id, page_id, world_id (denorm), image_key, width, height, alt

Key indexes: composite sort indexes for sidebar trees, partial indexes on `campaign_id WHERE NOT NULL` for lens filtering, GIN on `body_refs` and `structured_fields`, FTS on `body_text || title`, unique partial index on `(world_id, character_id) WHERE page_kind = 'pc_stub'` to prevent duplicate stubs.

Section templates live as TypeScript constants in `packages/content/src/world-templates/` with a `version` field. Template schemas define typed `StructuredField`s (text, longtext, select, tags, page_ref, pc_ref, number, date_freeform).

---

## RLS strategy

Helper: `is_world_owner(world_id) → boolean` (SECURITY DEFINER). Existing `is_campaign_dm` / `is_campaign_member` helpers re-used.

Core policies:
- `worlds` SELECT: inline `owner_id = auth.uid()` (never via helper — avoids the `campaigns` recursion lesson).
- `world_campaigns` SELECT: owner OR member of the campaign (players need this to resolve which worlds their campaigns link to).
- `world_pages` SELECT: owner full access; players read if `visible_to_players = true` AND section not force-hidden AND not deleted AND not orphaned AND scope resolves (world-scope → any linked-campaign member; campaign-scope → member of that campaign).
- Maps / pins / timeline / images follow the same pattern.

Orphaned pages are DM-only until re-resolved. No per-field secrets in v1.

---

## Editor & chips

**Tiptap** on web, **10tap-editor** (Tiptap-in-WebView) on iOS/Android. Shared extension package at `packages/ui/src/world-editor/`. Body stored as Tiptap JSON in `body`; plain text extracted client-side to `body_text` for FTS; `@mention` target ids collected into `body_refs` (uuid[]) on every save for cheap backlink queries.

Chip model: single `mention` Tiptap node with `kind: 'page' | 'pin' | 'pc'`, `targetId`, `label`. `@` trigger opens a scoped suggestion popover. Web adds a hover popover NodeView showing target title + body_text excerpt; native taps navigate. Deleted targets render as inert grey pill with `(deleted)` badge; DM clicks opens restore flow if within recovery window.

Per-page inline images stored in `world-images` bucket; rendered by a `worldImage` Tiptap node with signed-URL lookup.

Feature 6 keeps its existing Markdown `RichTextEditor` — not migrated.

---

## Map canvas

- **Storage:** Supabase Storage bucket `world-maps`, private, signed URLs only. Path `{worldId}/{mapId}/{filename}`. Accept `image/jpeg|png|webp`, 20MB cap.
- **Pan/zoom:** `react-zoom-pan-pinch` on web; `react-native-reanimated` 3 + `react-native-gesture-handler` on native.
- **Pin coords:** stored as 0–1 percentages; re-projected by `pct * imageDisplayedDim` on render. DM "Place Pin" mode toggle captures click, converts to percentage, opens a form.
- **Nested nav:** `world-map-stack.store.ts` holds a breadcrumb stack of `{mapId, viewport}` entries so sub-map drill-down preserves parent viewport on back. Top-of-stack viewport persisted; mid-drill state session-only.
- **Signed URL refresh:** regenerate at 80% TTL or on 403.

---

## Phased build order

Each phase ships on its own `feature/world-builder-phase-N-*` branch via PR. All phases after Phase 1 depend on Phase 1.

**Phase 1 — Foundation** → `worlds`, `world_campaigns`, `is_world_owner`, world list + picker, empty workspace shell, lens dropdown placeholder. Rewrite of `docs/features/07-world-building.md`. Updates to `build-status.md`, `README.md`, `features/README.md`.

**Phase 2 — Sections & pages (no editor)** → `world_sections`, `world_pages`, section templates in `packages/content/src/world-templates/`, sidebar with unlimited nesting, create-section/page modals, structured-fields form renderer, `Recently Deleted` scaffolding. Page body is placeholder.

**Phase 3 — Editor & chips & backlinks** → Tiptap + 10tap + shared extensions, `WorldPageEditor.{web,native}.tsx`, mention suggestion popover, hover preview (web), deleted-target chip UI, backlinks query via `body_refs`. Android perf benchmarking mid-phase.

**Phase 4 — Visibility & lens & PC stubs** → `visible_to_players`, section overrides, PC-stub materialization triggers on `world_campaigns` INSERT and `characters` INSERT, `LensDropdown`, entry-heuristic (campaign-detail → that campaign's lens; homepage → world-only), mid-session lens switch banner, orphan banner, Player View preview toggle.

**Phase 5 — Maps & pins & nesting** → `world_maps`, `pin_types` (seeded), `map_pins`, `world-maps` Storage bucket, `MapCanvas.{web,native}.tsx`, pin layer + placement mode + filter bar, sub-map drill-down, breadcrumbs, `world-map-stack.store.ts`.

**Phase 6 — Timeline & Feature 6 integration** → `timeline_events`, timeline UI, "Add to world timeline" button on published recaps in the existing Campaign Notes Hub (`components/notes/recap/RecapEditorPanel.tsx` adjacent).

**Phase 7 — Players section & images & search** → Players-section hybrid UI + orphan resolution flow, `world-images` bucket + image insertion, `search_world` RPC unified search, `SearchBar` + `SearchResultsDrawer`, "include orphaned" chip on by default with badge rendering.

**Phase 8 — Polish & deletion UX** → Drag-to-reorder fractional sort, Recently Deleted restore, daily hard-delete cron (pg_cron or Edge Function) + Storage reaper, storage cap enforcement (500MB soft, 80% warning, server-side compression for images > 2MB), Android editor perf tuning, a11y + keyboard pass.

---

## Critical files

**Routes**
- `app/(drawer)/worlds.tsx`
- `app/world/[worldId]/_layout.tsx`, `index.tsx`
- `app/world/[worldId]/section/[sectionId].tsx`
- `app/world/[worldId]/page/[pageId].tsx`
- `app/world/[worldId]/map/index.tsx`, `map/[mapId].tsx`
- `app/world/[worldId]/timeline.tsx`
- `app/world/[worldId]/search.tsx`
- `app/world/[worldId]/settings.tsx`

**Components** (`components/world/`)
- `Sidebar.tsx`, `SidebarSection.tsx`, `SidebarPageRow.tsx`, `SectionTemplatePicker.tsx`, `CreateSectionModal.tsx`, `CreatePageModal.tsx`
- `LensDropdown.tsx`, `shared/OrphanBanner.tsx`, `shared/PlayerViewToggle.tsx`, `shared/DeletedChip.tsx`
- `StructuredFieldsForm.tsx` + `fields/*.tsx`
- `editor/WorldPageEditor.{web,native}.tsx`, `editor/MentionNodeView.{web,native}.tsx`, `editor/MentionSuggestionList.{web,native}.tsx`, `editor/ChipRenderer.tsx`, `editor/WorldImageNodeView.tsx`
- `map/MapCanvas.{web,native}.tsx`, `map/PinLayer.tsx`, `map/PinPlacementMode.tsx`, `map/PinFilterBar.tsx`, `map/PinEditorModal.tsx`, `map/MapBreadcrumbs.tsx`, `map/MapUploadModal.tsx`
- `timeline/TimelinePage.tsx`, `timeline/TimelineEventCard.tsx`, `timeline/AddToWorldTimelineButton.tsx`
- `search/SearchBar.tsx`, `search/SearchResultsDrawer.tsx`

**API** (`packages/api/src/`)
- `worlds.ts`, `world-campaigns.ts`, `sections.ts`, `pages.ts` (body extraction + backlinks), `maps.ts`, `pins.ts`, `pin-types.ts`, `timeline-events.ts`, `world-images.ts`, `world-storage.ts`, `world-search.ts`

**Stores** (`packages/store/src/`)
- `worlds.store.ts`, `current-world.store.ts`, `world-map-stack.store.ts`, `world-search.store.ts`

**Types**
- `packages/types/src/database.types.ts` (extended)
- `packages/types/src/world.ts` (new — `SectionTemplate`, `StructuredField`, `TiptapDoc`, `MentionAttrs`)

**Content**
- `packages/content/src/world-templates/` (9 template files: locations, npcs, players, factions, religions, organizations, items, lore, blank)

**Docs**
- Full rewrite: `docs/features/07-world-building.md`
- Updates: `docs/README.md`, `docs/features/README.md`, `docs/build-status.md` (new Phase 9 checklist under Phase 5 MVP), `docs/architecture.md` (buckets, RLS helper, Tiptap/10tap)

**Migrations** (`supabase/migrations/`)
- One migration per phase, named `YYYYMMDDHHMMSS_world_builder_phase_<N>_<desc>.sql`

---

## Verification

Each phase has its own verification bar; Phase 8 is the end-to-end pass.

**Per-phase (Tier 1 + targeted Tier 4):**
- `npm run typecheck` — no net-new baseline errors
- Phase 1: create world + link campaign + delete world (soft) via web UI
- Phase 2: create default sections, nest 3+ pages, fill structured fields, soft-delete page
- Phase 3: type `@`, pick a page, chip inserts; hover shows popover (web); save + reload persists body; delete target shows grey chip; backlinks list populates on target page
- Phase 4: toggle `visible_to_players`, section force-hide override works; create 2 PCs in linked campaign, verify auto-stubs appear; unlink campaign, verify pages orphaned + banner; flip lens, verify visibility changes; Player View preview matches a player's actual RLS read
- Phase 5: upload Sunset Kingdom map, pan/zoom, place 5 pins of different types, sub-map drill-down + breadcrumb back preserves viewport
- Phase 6: end a session, publish recap, click "Add to world timeline," verify event created and editable
- Phase 7: upload inline images, unified search hits pages/pins/timeline, orphan badge renders
- Phase 8: drag-reorder, restore a deleted page, storage warning at 80%, compression fires on > 2MB

**End-to-end (Phase 8):** full Tier 4 Playwright run against `npm run web` as the test user (`claudebot`) — create world, link 2 campaigns, build 3 sections with 10 pages, drop map + pins, share some pages with players, log in as a player in each campaign, verify only the correct subset is visible.

**Database sanity:**
- Query plans on sidebar, search, and backlinks queries use expected indexes
- RLS audited: signed in as a non-owner non-member, every world-builder table returns 0 rows on SELECT

---

## Risks & follow-ups

1. **Storage budget.** 500MB per-user cap is chosen. If DMs hit it regularly, revisit (paid tier, tighter compression, or map tiling). Monitor in Phase 8.
2. **10tap Android perf.** Committed to shipping without a Markdown fallback. If mid-Phase 3 benchmarking shows real lag on long docs on mid-range Android, the fix is optimization (debounced input, virtualized node views) — not a platform split.
3. **Tiptap ↔ Feature 6 Markdown split.** Two editors coexist. No plan to unify; revisit if product needs demand it.
4. **`body_refs` drift.** Server-side edits bypassing the client extractor can stale `body_refs`. Add `refresh_body_refs(page_id)` PG function callable from migrations. Not needed v1.
5. **Signed URL expiry.** Auto-refresh at 80% TTL or on 403 — built into the `world-storage.ts` helper.
6. **Template versioning.** Adding fields to a template leaves old rows with missing keys; UI must render missing as empty and avoid destructive migrations. Document in `packages/content/src/world-templates/README.md`.
7. **PC-stub trigger security.** Trigger runs SECURITY DEFINER with `search_path = public`. Only fires on `world_campaigns` INSERT (world owner authorized) and `characters` INSERT for a campaign already linked to a world.
