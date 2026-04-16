# Feature 7: World Builder & Notes Manager

> Notion-style workspace where a DM builds and runs a world. Sidebar-driven
> sections + unlimited nested pages; structured-fields + free-text body on
> default page types; uploaded maps with pan/zoom and categorized pins with
> drill-down into sub-maps; per-page visibility controls for players; a
> single world can be linked to multiple Vaultstone campaigns and each
> page carries a scope (world-shared vs campaign-specific) so content
> stays pure across campaigns. Supersedes the earlier Feature 7 draft.
>
> All content is user-generated and stored per-account in Supabase.
> Respects [Legal Constraints](../legal.md).

**Status:** 🔴 Planned. Full rewrite — nothing in this doc is built. Feature 6
(Session Notes & Campaign Notes Hub) is unaffected and continues to use its
shipped Markdown editor.

---

## Terminology

| Term | Meaning |
|---|---|
| **World** | A top-level container the DM authors. Holds every section, page, map, and timeline event for that setting. |
| **World–campaign link** | Many-to-many association between a world and Vaultstone campaigns. A world can be reused across campaigns; a campaign can share a world with another campaign. |
| **Section** | A sidebar container inside a world. 4 defaults (Locations, NPCs & Characters, Players, Factions) + DM-created custom sections with preset templates. |
| **Page** | A document inside a section. Has a title, optional structured fields (typed form at the top), free-text body, attachments, and optional sub-pages (unlimited nesting). |
| **Scope** | Every page is either `world-level` (visible in every linked campaign's view) or `campaign-level` (visible only under that campaign's lens). Changeable after creation. |
| **Lens** | The campaign through which the DM is currently viewing the world. Lens filters which campaign-scoped pages are visible. `world-only` is always available. |
| **Map** | An uploaded image with pan/zoom. Each world has a primary home-screen map; Location pages may attach their own map. |
| **Pin** | A categorized marker on a map at percentage coordinates. Links to any page. |
| **Stub page** | An auto-materialized row in the Players section for each PC in a linked campaign. DM can enrich. |

---

## Key design decisions

Locked during vision discovery. Each decision is load-bearing for the data model or UX below.

| # | Area | Decision |
|---|---|---|
| 1 | Page scope | Every page has a `scope` field: `world-level` (null `campaign_id`) or `campaign-level` (set `campaign_id`). Changeable after creation. |
| 2 | Recap ↔ timeline | Opt-in only. "Add to world timeline" button on published Feature 6 recaps pre-fills a `timeline_event`. No auto-flow. |
| 3 | Player reveal | Per-page `visible_to_players` toggle (default off) + section-level override (`force_hidden_from_players`, `default_pages_visible`). |
| 4 | Maps | Multiple with drill-down nesting. World has a primary. Any Location page can attach one. Pins on maps pointing to Locations-with-maps offer "View Sub-map" with breadcrumb navigation. |
| 5 | Templates | Structured typed fields + free-text body on default sections. Template schemas are code-defined (not user-defined). First-class data — searchable and filterable. |
| 6 | Pin types | 7 categorized types with default icon + color (overridable per pin): City, Landmark, NPC, Faction HQ, Event, Quest, Generic. Filter bar toggles visibility by type. |
| 7 | Images | Per-page attachments only. Uploaded inline (paste/drag/picker). Images owned by their page; page delete → image delete. |
| 8 | PC linkage | One-way. Pages can tag PCs from linked campaigns for filtering/search/chips. Character sheets are untouched. |
| 9 | Lens behavior | Dropdown in world header; `world-only` default when entering from homepage; campaign pre-selected when entering from campaign detail; DM can switch mid-session; page scope can be changed after creation. Lens filters what the DM sees — it is not a DM override that shows everything. |
| 10 | Players section | Hybrid — PCs from linked campaigns auto-materialize as stub pages (campaign-scoped); DM enriches and can also add custom handout pages freely. Unlinking a PC flags its stub `is_orphaned`. |
| 11 | Custom sections | Template picker: 4 defaults + 4 extras (Religions, Organizations, Items, Lore) + Blank. No full custom-field builder. |
| 12 | Search | Default scope current world. Toggle chip expands to all owned worlds. Hits page title + structured fields + body plain text + pin labels + timeline event titles. |
| 13 | Deletion | Soft-delete with 30-day recovery on worlds / sections / pages / maps / timeline. Daily purge of expired rows. Campaign deletion unlinks but preserves world; affected campaign-scoped pages flagged orphaned. |
| 14 | Nesting | Unlimited sub-page depth. |
| 15 | Deleted-target chip | Inert grey pill with old label + `(deleted)`. DM click within 30-day window restores. |
| 16 | Storage cap | 500MB per-user soft cap with 80% warning; blocks new uploads at 100%. Images > 2MB compressed server-side on upload. |
| 17 | Native editor | 10tap-editor (Tiptap-in-WebView) on iOS + Android for parity with web Tiptap. No Markdown fallback on any platform. |
| 18 | Orphan search | Orphaned pages included in default search with an "Orphaned" badge. Filter chip to exclude. |

---

## Data model

All timestamps `timestamptz default now()`. All PKs `uuid default gen_random_uuid()` unless noted. Soft-deletable tables add `deleted_at` + `hard_delete_after` columns.

### `worlds`
`id`, `owner_id` → `profiles(id)`, `name`, `tagline`, `cover_image_key`, `primary_map_id` → `world_maps(id)` (nullable, populated after both rows exist), `created_at`, `updated_at`, `deleted_at`, `hard_delete_after`.

### `world_campaigns` (many-to-many join)
`(world_id, campaign_id)` PK, `linked_at`. Triggers: on INSERT, materialize PC stub pages for every character on that campaign. On DELETE, flag stubs and campaign-scoped pages `is_orphaned = true`.

### `world_sections`
`id`, `world_id`, `template_key` (one of: `locations`, `npcs`, `players`, `factions`, `religions`, `organizations`, `items`, `lore`, `blank`), `title`, `sort_order` (fractional), `force_hidden_from_players`, `default_pages_visible`, soft-delete cols.

### `world_pages`
`id`, `world_id`, `section_id`, `parent_page_id` (nullable — unlimited nesting), `campaign_id` (nullable = world-level; set = campaign-level — this is the scope column), `page_kind` (`custom` | `location` | `npc` | `faction` | `player_character` | `pc_stub` | `religion` | `organization` | `item` | `lore`), `character_id` (set only for `pc_stub` / `player_character`), `title`, `icon`, `body JSONB` (Tiptap doc), `body_text TEXT` (plain-text extract for FTS), `body_refs UUID[]` (chip target IDs for cheap backlinks), `structured_fields JSONB` (validated against the section template), `visible_to_players`, `is_orphaned`, `sort_order` (fractional), soft-delete cols.

Indexes: composite `(world_id, section_id, sort_order)` for the sidebar tree; partial `(campaign_id) WHERE campaign_id IS NOT NULL` for lens filters; GIN on `body_refs` for backlinks; FTS GIN on `to_tsvector('english', title || ' ' || body_text)`; GIN on `structured_fields`; unique partial `(world_id, character_id) WHERE page_kind = 'pc_stub'` to prevent duplicate stubs.

Why JSONB `structured_fields` (not a normalized field-value table): templates are code-defined and closed-set, so we can validate shape in the API. JSONB keeps saves single-row and survives template version bumps without per-field migrations. Searchable via GIN with `jsonb_path_ops`.

### `page_pc_links`
`(page_id, character_id)` PK. Independent of any `pc_stub` — a non-Players page can tag a PC for filtering.

### `world_maps`
`id`, `world_id`, `owner_page_id` (null = world-primary candidate; set = owned by a Location page), `campaign_id`, `label`, `image_key` (in `world-maps` bucket), `image_width`, `image_height`, `aspect_ratio`. Actual primary map is elected via `worlds.primary_map_id`.

### `pin_types` (reference, seeded)
`key` PK (one of 7 above), `label`, `default_icon_key`, `default_color_hex`, `sort_order`.

### `map_pins`
`id`, `map_id`, `world_id` (denormalized for cheap filter-bar queries + RLS), `pin_type` → `pin_types(key)`, `x_pct`, `y_pct` (0.0–1.0), `label`, `icon_key_override`, `color_override`, `linked_page_id` (nullable).

### `timeline_events`
`id`, `world_id`, `campaign_id` (scope), `title`, `body` (Tiptap JSON), `body_text`, `body_refs`, `in_world_date` (freeform text — "Year 1203, Month of Ice"), `era`, `sort_order`, `source_session_id` → `sessions(id)` (set by "Add to world timeline"), `visible_to_players`, soft-delete cols.

### `world_images`
`id`, `page_id` (owner — delete-cascaded), `world_id` (denormalized), `image_key` (in `world-images` bucket), `width`, `height`, `alt`.

### Soft-delete mechanics

RPCs like `trash_world_page(page_id)` set `deleted_at = now()` and `hard_delete_after = now() + interval '30 days'`, cascading to the page tree. A daily job (pg_cron or scheduled Edge Function) hard-deletes rows where `hard_delete_after < now()` and reaps their Storage objects. Restore clears both columns.

### Section templates (code, not DB)

Templates live in `packages/content/src/world-templates/` as versioned TypeScript constants:

```ts
interface SectionTemplate {
  key: 'locations' | 'npcs' | 'players' | 'factions' | 'religions' | 'organizations' | 'items' | 'lore' | 'blank';
  label: string;
  pageKind: WorldPage['page_kind'];
  fields: StructuredField[];
  defaultIcon: string;
  version: number; // bump when the schema grows
}

interface StructuredField {
  key: string;
  label: string;
  type: 'text' | 'longtext' | 'select' | 'tags' | 'page_ref' | 'pc_ref' | 'number' | 'date_freeform';
  options?: string[];
  refKind?: PageKind[];
  isSearchable?: boolean;
}
```

Pages render any field keys their template doesn't recognize as empty. Adding a field is a no-migration change; removing one is still safe because the JSONB blob retains old keys harmlessly.

---

## RLS & visibility

Adds one helper to the existing `is_campaign_dm` / `is_campaign_member` pair:

```sql
create or replace function is_world_owner(p_world_id uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from worlds where id = p_world_id and owner_id = auth.uid());
$$;
```

Per-table:

- **`worlds`** SELECT inline `owner_id = auth.uid()` (no helper — same recursion lesson as `campaigns`). Owner sees their soft-deleted worlds too; the UI filters.
- **`world_campaigns`** SELECT: owner OR member of the campaign (players need this to resolve which worlds to query). INSERT / DELETE: owner + `is_campaign_dm`.
- **`world_sections`** SELECT: owner OR the section contains at least one page the player can read. Write: owner only.
- **`world_pages`** SELECT: owner full; player reads when `visible_to_players AND section not force-hidden AND deleted_at IS NULL AND is_orphaned = false`, scope resolves to a campaign they're a member of. No player INSERT/UPDATE/DELETE.
- **`world_maps` / `map_pins`** mirror the owning page's readability.
- **`timeline_events`** mirrors `world_pages`.
- **`page_pc_links`** visibility piggybacks on the page's SELECT — players re-query the page for chip data.
- **`world_images`** mirrors the owning page.

Storage buckets `world-maps` and `world-images` are private. Object paths are `{worldId}/{mapId|pageId}/…` so RLS on the bucket can key off the path prefix. Signed URLs fetched at render; refresh at 80% TTL or on 403.

No per-field visibility in v1 (no secret-column stripping). Re-evaluate if demand shows up.

---

## Editor & chips

Shipping **Tiptap** on web and **10tap-editor** (a Tiptap-in-WebView shim) on native. Shared extension package at `packages/ui/src/world-editor/` keeps the node schema, suggestion config, and extractors aligned across platforms.

### Node schema

StarterKit block nodes + marks (`bold`, `italic`, `underline`, `strike`, `code`, `link`), plus two custom nodes:

```ts
// Mention / chip — a single node covers page / pin / pc references
{
  type: 'mention',
  attrs: {
    kind: 'page' | 'pin' | 'pc',
    targetId: string,
    label: string,                   // captured at insert time
    deletedSnapshot?: {              // injected by the renderer when the target is gone
      originalLabel: string,
      deletedAt: string,
      recoverableUntil: string | null,
    }
  },
  inline: true, atom: true,
}

// Inline image attachment
{
  type: 'worldImage',
  attrs: { imageId: string, alt: string, width: number, height: number },
  atom: true,
}
```

### Storage derivations

On every save, the client walks the Tiptap doc and derives:

- `body_text` — plain-text concatenation of text nodes + mention `label`s + image `alt`s. Used by FTS.
- `body_refs` — collected `mention.attrs.targetId` values. Used for cheap backlinks via GIN.

Both are persisted as columns on `world_pages` / `timeline_events`. Backlink query:

```sql
select id, title from world_pages
 where world_id = $1 and deleted_at is null and $2 = any(body_refs);
```

### Chip UX

- `@` trigger opens a suggestion popover (scopes: Pages, PCs, Map pins). Debounced ~200ms.
- Selecting a target inserts a `mention` node with the chosen `kind` / `targetId` / `label`.
- **Web**: a `MentionNodeView.web.tsx` component adds a hover popover showing the target's title + first 120 chars of `body_text`. Click navigates.
- **Native**: `MentionNodeView.native.tsx` skips the hover layer. Tap navigates.
- When the target is missing or soft-deleted, the renderer injects `deletedSnapshot` attrs and the chip renders as a grey inert pill. If inside the 30-day recovery window, DM clicks open a restore flow.

### Feature 6 coexistence

Feature 6 (Session Notes + Campaign Notes Hub) keeps its shipped Markdown `RichTextEditor`. No migration. Two editors coexist — world-builder pages use Tiptap, session notes + recap continue on Markdown. Revisit only if product needs a unified editor later.

---

## Map canvas

- **Storage bucket** `world-maps`, private, signed URLs only. Object path `{worldId}/{mapId}/{filename}`. Accepted: `image/jpeg`, `image/png`, `image/webp`. 20MB cap enforced at the upload API; images > 2MB compressed server-side.
- **Pan/zoom library**: `react-zoom-pan-pinch` on web; `react-native-reanimated` 3 + `react-native-gesture-handler` on native. Zoom bounds 0.5×–4×, double-tap 2× on native, "Reset View" button.
- **Pin coordinates** stored as 0–1 percentages. On render: `pin.x_pct * image.displayedWidth`, same for Y. Placement mode captures click/tap, reverse-projects through current scale/translate, saves a new `map_pins` row.
- **Nested navigation** is managed by a new store `packages/store/src/world-map-stack.store.ts` that holds a breadcrumb stack of `{mapId, viewport: {scale, translateX, translateY}, breadcrumbLabel}` entries. "View Sub-map" pushes the stack and swaps to the child map; back pops and restores the viewport. Top-of-stack viewport persisted; mid-drill state session-only.
- **Filter bar** toggles a `Set<PinTypeKey>` that the pin layer consults before rendering.

---

## Search

One RPC drives everything:

```sql
search_world(world_id uuid, query text, scope_all boolean)
  returns table (kind text, id uuid, world_id uuid, title text, snippet text, ...)
```

Unions FTS hits across:

- `world_pages.title || ' ' || body_text`
- `world_pages.structured_fields` (via `jsonb_path_query_array`)
- `map_pins.label`
- `timeline_events.title || ' ' || body_text`

Default scope: the current world. `scope_all = true` unions rows across every world owned by `auth.uid()`. Debounced ~300ms. Results grouped by world when cross-world. Orphaned pages included with an "Orphaned" badge by default; filter chip excludes them.

---

## Phased build order

Each phase is a feature branch + PR, independently shippable. All phases after 1 depend on 1.

### Phase 1 — Foundation
`worlds`, `world_campaigns`, `is_world_owner`, world list + picker, empty workspace shell, lens dropdown placeholder. Rewrite this spec (already done on the plan branch) + update `build-status.md`, `README.md`, `features/README.md`.

### Phase 2 — Sections & pages (no editor)
`world_sections`, `world_pages`, section templates in `packages/content/src/world-templates/`, sidebar with unlimited nesting, create-section/page modals, structured-fields form renderer, Recently Deleted scaffolding. Page body is placeholder.

### Phase 3 — Editor & chips & backlinks
Tiptap + 10tap install, shared extensions in `packages/ui/src/world-editor/`, `WorldPageEditor.{web,native}.tsx`, mention suggestion popover, hover preview (web), deleted-target chip UI, backlinks via `body_refs`. Benchmark on mid-range Android mid-phase.

### Phase 4 — Visibility & lens & PC stubs
`visible_to_players`, section overrides, PC-stub materialization triggers on `world_campaigns` INSERT and `characters` INSERT, lens dropdown, entry heuristic (campaign-detail → that campaign's lens; homepage → world-only), mid-session lens switch, orphan banners, Player View preview toggle.

### Phase 5 — Maps & pins & nesting
`world_maps`, `pin_types` (seeded), `map_pins`, `world-maps` bucket, `MapCanvas.{web,native}.tsx`, pin layer + placement mode + filter bar, sub-map drill-down, breadcrumbs, `world-map-stack.store.ts`.

### Phase 6 — Timeline & Feature 6 integration
`timeline_events`, timeline UI, `AddToWorldTimelineButton` wired into the published-recap flow in the existing Campaign Notes Hub (`components/notes/recap/RecapEditorPanel.tsx` adjacent). No Feature 6 schema change.

### Phase 7 — Players section & images & search
Players-section hybrid UI with stub enrichment + orphan resolution, `world-images` bucket + image insertion, `search_world` RPC + `SearchBar` + `SearchResultsDrawer`, orphan-badge rendering.

### Phase 8 — Polish & deletion UX
Fractional `sort_order` drag-to-reorder (sidebar + timeline), Recently Deleted restore, daily hard-delete cron + Storage reaper, storage cap enforcement (500MB soft, 80% warning, server-side compression > 2MB), Android editor perf tuning if needed, a11y + keyboard pass.

---

## Critical files

**Routes**
- `app/(drawer)/worlds.tsx`
- `app/world/[worldId]/_layout.tsx`, `index.tsx`
- `app/world/[worldId]/section/[sectionId].tsx`
- `app/world/[worldId]/page/[pageId].tsx`
- `app/world/[worldId]/map/index.tsx`, `map/[mapId].tsx`
- `app/world/[worldId]/timeline.tsx`, `search.tsx`, `settings.tsx`

**Components (`components/world/`)**
- `Sidebar.tsx`, `SidebarSection.tsx`, `SidebarPageRow.tsx`, `SectionTemplatePicker.tsx`, `CreateSectionModal.tsx`, `CreatePageModal.tsx`
- `LensDropdown.tsx`, `shared/OrphanBanner.tsx`, `shared/PlayerViewToggle.tsx`, `shared/DeletedChip.tsx`
- `StructuredFieldsForm.tsx` + `fields/*.tsx`
- `editor/WorldPageEditor.{web,native}.tsx`, `editor/MentionNodeView.{web,native}.tsx`, `editor/MentionSuggestionList.{web,native}.tsx`, `editor/ChipRenderer.tsx`, `editor/WorldImageNodeView.tsx`
- `map/MapCanvas.{web,native}.tsx`, `map/PinLayer.tsx`, `map/PinPlacementMode.tsx`, `map/PinFilterBar.tsx`, `map/PinEditorModal.tsx`, `map/MapBreadcrumbs.tsx`, `map/MapUploadModal.tsx`
- `timeline/TimelinePage.tsx`, `timeline/TimelineEventCard.tsx`, `timeline/AddToWorldTimelineButton.tsx`
- `search/SearchBar.tsx`, `search/SearchResultsDrawer.tsx`

**API (`packages/api/src/`)**
- `worlds.ts`, `world-campaigns.ts`, `sections.ts`, `pages.ts` (body extraction + backlinks), `maps.ts`, `pins.ts`, `pin-types.ts`, `timeline-events.ts`, `world-images.ts`, `world-storage.ts`, `world-search.ts`

**Stores (`packages/store/src/`)**
- `worlds.store.ts`, `current-world.store.ts`, `world-map-stack.store.ts`, `world-search.store.ts`

**Content**
- `packages/content/src/world-templates/` — 9 template files (locations, npcs, players, factions, religions, organizations, items, lore, blank)

**Types**
- `packages/types/src/database.types.ts` (extended)
- `packages/types/src/world.ts` (new)

**Docs to update alongside each phase**
- `docs/build-status.md` (Phase 5.2 checklist)
- `docs/architecture.md` (new buckets, new RLS helper, Tiptap/10tap)
- `docs/features/README.md` (summary line)

---

## Verification

Per-phase Tier 1 (`npm run typecheck` — no net-new baseline errors) plus targeted Tier 4 smoke on the golden path for that phase's scope. End-to-end Tier 4 Playwright run in Phase 8 exercises: create world → link two campaigns → build sections with nested pages → upload map + drop pins of multiple types → share a subset of pages with players → log in as a player in each campaign → confirm only the correct subset surfaces.

RLS audit (Phase 8): sign in as a non-owner non-member and confirm every world-builder table returns zero rows on SELECT.

---

## Risks & follow-ups

1. **Storage pressure.** 500MB per-user soft cap. Monitor in Phase 8; revisit tier/tiling if DMs routinely hit it.
2. **10tap Android performance.** No Markdown fallback. If mid-Phase 3 benchmarking shows lag on long docs on mid-range Android, fix is optimization (debounced input, virtualized NodeViews) — not a platform split.
3. **`body_refs` drift.** Server-side edits bypassing the client extractor leave stale `body_refs`. Mitigation: `refresh_body_refs(page_id)` PG function callable from migrations. Not needed v1.
4. **Signed URL expiry.** Auto-refresh at 80% TTL or on 403, baked into `world-storage.ts`.
5. **Template versioning.** Adding fields to a template leaves old rows with missing keys; UI must render missing as empty and avoid destructive migrations. Pattern documented in `packages/content/src/world-templates/README.md` (to be written in Phase 2).
6. **PC-stub trigger security.** `SECURITY DEFINER` with `search_path = public`. Fires on `world_campaigns` INSERT (authorized by world owner) and `characters` INSERT for a campaign already linked.
7. **Feature 6 ↔ Feature 7 editor split.** Two editors coexist by design. Document the reason in `docs/architecture.md` so future contributors don't "unify" them accidentally.
