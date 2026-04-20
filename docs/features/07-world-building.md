# Feature 7: World Builder & Notes Manager

> Notion-style workspace where a DM builds and runs a world. Sidebar-driven
> sections + unlimited nested pages; structured-fields + free-text body on
> default page types; uploaded maps with pan/zoom and categorized pins with
> drill-down into sub-maps; per-page player reveal **plus per-page view/edit
> grants for specific users**; pessimistic page-level edit locks so only one
> author mutates a page at a time; timelines as first-class pages anywhere in
> the tree, with DM-defined calendar schemas; a single world can be linked
> to multiple Vaultstone campaigns and each page carries a scope
> (world-shared vs campaign-specific) so content stays pure across campaigns.
> Supersedes the earlier Feature 7 draft.
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
| **World** | A top-level container the DM (owner) authors. Holds every section, page, map, timeline, pin, and image for that setting. |
| **Owner** | The user who created the world. Single-owner model — no co-owners. Owners always have full edit on every page. |
| **World–campaign link** | Many-to-many association between a world and Vaultstone campaigns. A world can be reused across campaigns; a campaign can link to multiple worlds. |
| **Section** | A sidebar container inside a world. 4 defaults (Locations, NPCs & Characters, Players, Factions) + a default Timeline section + DM-created custom sections chosen from preset templates. |
| **Page** | A document inside a section. Has a title, optional structured fields (typed form at the top), free-text body, attachments, and optional sub-pages (unlimited nesting). |
| **Scope** | Every page is either `world-level` (visible in every linked campaign's view) or `campaign-level` (visible only under that campaign's lens). Changeable after creation. |
| **Lens** | The campaign through which the DM is currently viewing the world. Lens filters which campaign-scoped pages are visible. `world-only` is always available. |
| **Permission grant** | A row on `world_page_permissions` giving a named user `view` or `edit` access to a specific page, optionally cascading to all sub-pages. |
| **Cascade grant** | A permission grant with `cascade_to_subpages = true`. Descendants inherit it unless they have a direct grant of their own. Most-permissive wins on conflict. |
| **Edit lock** | Short-lived row-level lock on a page held by the currently-editing user. Heartbeats every 30s; treated as stale after 90s. Owner can force-unlock. |
| **Map** | An uploaded image with pan/zoom. Each world has a primary home-screen map; Location pages may attach their own map. |
| **Pin** | A categorized marker on a map at percentage coordinates. Links to any page. |
| **Timeline page** | A `page_kind = 'timeline'` page that renders a vertical timeline of events. Can live in any section. DM defines its `calendar_schema` (ordered list of date units). |
| **Stub page** | An auto-materialized row in the Players section for each PC in a linked campaign. DM can enrich. |

---

## Key design decisions

Locked during vision discovery. Each decision is load-bearing for the data model or UX below.

| # | Area | Decision |
|---|---|---|
| 1 | Page scope | Every page has a `scope` field: `world-level` (null `campaign_id`) or `campaign-level` (set `campaign_id`). Changeable after creation. |
| 2 | Recap ↔ timeline | Opt-in only. "Add to world timeline" button on published Feature 6 recaps creates a new `timeline_events` row under a DM-chosen timeline page, pre-filled with the recap body (Markdown → Tiptap converted) and session metadata. No auto-flow. |
| 3 | Player reveal | Per-page `visible_to_players` toggle (default off) + section-level override (`force_hidden_from_players`, `default_pages_visible`). |
| 4 | Maps | Multiple with drill-down nesting. World has a primary. Any Location page can attach one. Pins on maps pointing to Locations-with-maps offer "View Sub-map" with breadcrumb navigation. |
| 5 | Templates | Structured typed fields + free-text body on default sections. Template schemas are code-defined (not user-defined). First-class data — searchable and filterable. **Templates are versioned** (see #25). |
| 6 | Pin types | 7 categorized types with default icon + color (overridable per pin): City, Landmark, NPC, Faction HQ, Event, Quest, Generic. Filter bar toggles visibility by type. |
| 7 | Images | Per-page attachments only. Uploaded inline (paste/drag/picker). Images owned by their page; page delete → image delete. |
| 8 | PC linkage | One-way. Pages can tag PCs from linked campaigns for filtering/search/chips. Character sheets are untouched. |
| 9 | Lens behavior | Dropdown in world header; `world-only` default when entering from homepage; campaign pre-selected when entering from campaign detail; DM can switch mid-session; page scope can be changed after creation. Lens filters what the DM sees — it is not a DM override that shows everything. |
| 10 | Players section | Hybrid — PCs from linked campaigns auto-materialize as stub pages (campaign-scoped); DM enriches and can also add custom handout pages freely. Unlinking a PC flags its stub `is_orphaned`. Re-linking un-orphans the existing stub in place. |
| 11 | Custom sections | Template picker: 4 defaults + Timeline + 4 extras (Religions, Organizations, Items, Lore) + Blank. No full custom-field builder. |
| 12 | Search | Default scope current world. Toggle chip expands to all owned worlds. A second drawer on the campaign detail page scopes search to every world linked to that campaign. Hits page title + structured fields + body plain text + pin labels + timeline event titles. |
| 13 | Deletion | Soft-delete with 30-day recovery on worlds / sections / pages / maps / timelines. Daily purge of expired rows. Campaign deletion unlinks but preserves world; affected campaign-scoped pages flagged orphaned. Cascaded permission grants soft-delete with their owning page. |
| 14 | Nesting | Unlimited sub-page depth. |
| 15 | Deleted-target chip | Inert grey pill with old label + `(deleted)`. DM click within 30-day window restores. |
| 16 | Storage cap & compression | 500MB per-user soft cap with 80% warning; blocks new uploads at 100%. **Compression strategy: client-side primary (Expo ImageManipulator on native, canvas on web) + server-side size cap enforced at upload RPC + Supabase Storage on-read resize for mobile bandwidth.** `profiles.storage_used_bytes` is the source of truth, maintained by triggers. |
| 17 | Native editor | 10tap-editor (Tiptap-in-WebView) on iOS + Android for parity with web Tiptap. No Markdown fallback. **Low-end device strategy is A + C: aggressive optimization on the shared editor (chunked NodeView rendering, debounced extraction, deferred image decode) + feature-flagged progressive disable that auto-downgrades expensive UX (hover previews, live suggestion popover, inline image decode) on detected low-memory/slow devices. Editing always works; plainer UX on weaker hardware.** |
| 18 | Orphan search | Orphaned pages included in default search with an "Orphaned" badge. Filter chip to exclude. |
| 19 | Sharing & permissions | Owner can grant named users `view` or `edit` access to a specific page. Grant may cascade to sub-pages. Cascaded grant on an ancestor is the default inheritance for descendants; a direct grant on a descendant overrides with most-permissive-wins. Grantees on a page are visible to each other. Grantee pool is the union of members across all campaigns linked to this world. Deleting a page soft-deletes its grants with it. |
| 20 | Concurrent editing | Pessimistic page-level edit lock. Client acquires on focus, heartbeats every 30s, treated stale after 90s. Autosave writes direct to `world_pages` every 2s while lock is held. Only world owner can force-unlock someone else's live lock. Same user in two tabs re-acquires (owner-match); no self-block. |
| 21 | Page icons | Lucide icon set for page icons and pin-type default icons. `icon_key` stores the Lucide name (e.g., `"castle"`, `"scroll-text"`). Revisit the icon library when we build the picker. |
| 22 | Timeline structure | Timelines are **first-class pages** with `page_kind = 'timeline'`. Can live in any section (Timeline default section is just the convenient home). Each timeline page owns a `calendar_schema` — an ordered list of date units the DM defines at creation (e.g., `["Era","Year","Season","Day"]`). Events under a timeline store their `date_values` as JSONB keyed by those units; a derived `sort_key` orders them deterministically. Every world auto-creates one primary timeline page (`worlds.primary_timeline_page_id`) so "Add to world timeline" has a default target; owner can reassign. |
| 23 | Campaign world lookup | Campaign detail page gets a `CampaignWorldsCard` (lists linked worlds) and a `CampaignWorldLookupDrawer` (search + view + edit within any world linked to this campaign, subject to the user's permissions on each page). |
| 24 | Template versioning | Each section template is versioned; pages pin their `template_version` at creation. Additive changes (new field, new icon) don't require a version bump — they apply to all pages. Field removals or type changes ship a new version file; existing pages stay on their old version forever or opt in via a "Update this page to v*N*" page-menu affordance. |
| 25 | Revision history | **v2 candidate — not in this scope.** No per-page edit history in v1. If we ship it later, the plan is `world_page_versions` + a BEFORE-UPDATE trigger that snapshots prior body on material change, aged out at 30 days. Document this so a future contributor doesn't re-derive. |

---

## Design handoff & section→screen mapping

The Claude Design handoff at **[`../design/vaultstone-handoff/`](../design/vaultstone-handoff/)** is the visual source of truth. Every screen listed below is mocked in that bundle; implementations must recreate the look faithfully in React Native + NativeWind.

**Section template → specialized screen** (each template drives its own view; the structured-fields form is shared across all of them):

| Template (`template_key`) | Default page kind | Section view | Detail screen (page) | Handoff reference | Ships in |
|---|---|---|---|---|---|
| `locations` | `location` | **Grid** (hero card 2×2) | Structured-fields form + body | `screens_a.jsx` Locations (`.cards-grid` + `.card.hero`), `.card-visibility` eye | Phase 2 (grid) |
| `npcs` | `npc` | List | Structured-fields form + body + (later) secrets/relationships panels | `screens_d.jsx` NPC (`.npc-hero`, relationships column) | Phase 2 (baseline), Phase 4 (secrets/relationships columns) |
| `players` | `custom` | List | Structured-fields + (later) truncated sheet + personal notes | `screens_f.jsx` Players `PCCard` + party-notes rail | Phase 2 (baseline), Phase 4 (PC stub wiring), Phase 7a (hybrid Players UI) |
| `factions` | `faction` | List | Structured-fields + body; later a force-directed graph at the section level | `screens_e.jsx` Factions (force-directed node graph) | Phase 2 (list), Phase 7 stretch (graph) |
| `lore` | `lore` | List | Structured-fields + Tiptap body with @-mentions + backlinks panel | `screens_c.jsx` Wiki (`.wiki-body`, `.mention`, `.backlinks`) | Phase 2 (baseline), Phase 3 (@-mentions + backlinks) |
| *(special)* `timeline` page kind | `timeline` | — (lives on a page) | Era ribbon at top + L/R alternating event cards | `screens_d.jsx` Timeline (`.era-ribbon`, `.event-card`) | Phase 6 |
| *(special)* map surface | — | — (lives on `world_maps`) | Pin canvas + sub-maps dock + pin types + map style tokens | `screens_b.jsx` WorldMap (`.map-canvas`, `.pin`, `.submap-list`, `.map-bg.*`) | Phase 5 |
| `blank` | `custom` | List | Structured-fields (none) + body | — (generic page head) | Phase 2 |

**Shell chrome** (shared by all in-world screens, lands Phase 2):

- **Rail** (56px) → `WorldRail`. Handoff: `.rail` + `.nav-item` + `.nav-tip`. Items: section shortcuts (Locations, NPCs, Players, Factions, Lore) + reserved slots (Map, Timeline) + Settings. Campaign-scoped Home + Party live in the app drawer in Phase 2; Phase 7c integrates campaign↔world nav.
- **Sidebar** (220/248/280px; density-dependent) → `WorldSidebar`. Handoff: `.sidebar`, `.sidebar-head`, `.campaign-switch`, `.search`, `.nav-tree`, `.nav-group`, `.nav-row`, `.nav-child`. Contextual: tree swaps to show the active section's pages.
- **TopBar** (48px) → `WorldTopBar`. Handoff: `.topbar`, `.crumbs`, `.save-state`, `.presence`. Presence is a placeholder avatar in Phase 2; Phase 4 wires Realtime.
- **PageHead** → `PageHead` primitive used on every world landing + page detail + section screen. Handoff: `.page-head`, `.page-icon`, `.page-title`, `.page-sub`, `.page-actions`.
- **World landing** ("The Atlas") → `app/world/[worldId]/index.tsx`. Handoff: `.world-head`, `.world-grid`, `.world-card`, `.world-card-add`.

**Semantic color tokens** (additive on Noir; lands Phase 2):

| Token | Hex | Handoff var | Role |
|---|---|---|---|
| `player` | `#4ec8c0` | `--player` | Player-visible content; player avatar ring; eye-on chip |
| `gm` | `#e6a255` | `--warn` | GM-only content; eye-off chip; warning state |
| `cosmic` | `#6b8af0` | `--cosmic` | Timeline/cosmic event tags; alt accent |
| `danger` | `#E24B4A` (existing `hpDanger`) | `--danger` | Combat/danger tags; HP-low state (existing semantics preserved) |

Noir `primary` (lavender/purple `#d3bbff`/`#6d28d9`) remains the **only** primary-action color. Each semantic token gets matching `on*`, `*Container`, and `*Glow` variants so they compose with existing Noir surface tokens without renames.

**Typography — LOCKED to option 2.** Handoff uses Fraunces (display) + Cormorant Garamond (body italic) + Inter (body sans) + JetBrains Mono. Noir uses Space Grotesk + Manrope. **Decision:** Phase 2 loads Fraunces + Cormorant **only inside `/world/` routes** via `expo-font` in `app/world/[worldId]/_layout.tsx`; the rest of the app stays on Noir's Space Grotesk + Manrope. If the world-scoped serif typography lands well, a future pass can promote it app-wide.

**Card `hero` tier** — first card in a Locations-style grid spans 2×2 with 28px display title and image bleed. Lands in Phase 2 as a new `tier` variant on the Noir `Card` primitive.

**Visibility eye** (`VisibilityBadge`) — 26px backdrop-blur chip top-right on every page/section card. Display-only in Phase 2; interactive in Phase 4.

**Tweaks panel** (prototype-only: accent/density/heading/mapStyle) — **not ported**.

Anything not listed here is either not a world-builder concern (Campaign Home dashboard from `screens_a.jsx` belongs to Feature 2) or is downstream infrastructure not yet designed.

---

## Data model

All timestamps `timestamptz default now()`. All PKs `uuid default gen_random_uuid()` unless noted. Soft-deletable tables add `deleted_at` + `hard_delete_after` columns.

### `worlds`
`id`, `owner_id` → `profiles(id)`, `name`, `tagline`, `cover_image_key`, `primary_map_id` → `world_maps(id)` (nullable — populated after first map uploaded; see Circular FK below), `primary_timeline_page_id` → `world_pages(id)` (nullable — auto-populated when the default Timeline section's first timeline page is created), `created_at`, `updated_at`, `deleted_at`, `hard_delete_after`.

Circular FK handling: `worlds.primary_map_id` and `worlds.primary_timeline_page_id` are both nullable and non-deferred. World creation inserts with both NULL. First map upload / first timeline page creation updates the column in a second statement. On deletion of the pointed-at row, a trigger sets the pointer back to NULL (DM picks a new primary).

### `world_campaigns` (many-to-many join)
`(world_id, campaign_id)` PK, `linked_at`. Triggers: on INSERT, materialize PC stub pages for every character on that campaign (see PC stub lifecycle below). On DELETE, flag stubs and campaign-scoped pages `is_orphaned = true`.

### `world_sections`
`id`, `world_id`, `template_key` (one of: `locations`, `npcs`, `players`, `factions`, `timeline`, `religions`, `organizations`, `items`, `lore`, `blank`), `title`, `sort_order` (fractional), `force_hidden_from_players`, `default_pages_visible`, soft-delete cols.

### `world_pages`
Core columns:
- `id`, `world_id`, `section_id`, `parent_page_id` (nullable — unlimited nesting)
- `campaign_id` (nullable = world-level; set = campaign-level — this is the scope column)
- `page_kind` (`custom` | `location` | `npc` | `faction` | `timeline` | `player_character` | `pc_stub` | `religion` | `organization` | `item` | `lore`)
- `template_version int NOT NULL` (see Template versioning below)
- `character_id` (set only for `pc_stub` / `player_character`)
- `title`, `title_overridden boolean NOT NULL DEFAULT false`, `icon text` (Lucide key)
- `body JSONB` (Tiptap doc), `body_text TEXT` (plain-text extract for FTS), `body_refs UUID[]` (chip target IDs for cheap backlinks) — all three derived by DB trigger, never written directly by clients
- `structured_fields JSONB` (validated against the pinned template version)
- `visible_to_players`, `is_orphaned`, `sort_order` (fractional)
- `editing_user_id uuid nullable`, `editing_heartbeat_at timestamptz nullable` (see Edit lock below)
- Soft-delete cols

Indexes:
- Composite `(world_id, section_id, sort_order)` for the sidebar tree
- Partial `(campaign_id) WHERE campaign_id IS NOT NULL` for lens filters
- GIN on `body_refs` for backlinks
- FTS GIN on `to_tsvector('english', title || ' ' || body_text)`
- GIN on `structured_fields` with `jsonb_path_ops`
- Unique partial `(world_id, character_id) WHERE page_kind = 'pc_stub'` (no `deleted_at IS NULL` clause — soft-deleted stubs also collide with re-link, preventing phantom duplicates)

Why JSONB `structured_fields` (not a normalized field-value table): templates are code-defined and closed-set, so we can validate shape in the API. JSONB keeps saves single-row and survives template version bumps without per-field migrations. Searchable via GIN with `jsonb_path_ops`.

### `world_page_permissions` (NEW)
Per-page view/edit grants.

`page_id uuid` → `world_pages(id) on delete cascade`, `grantee_id uuid` → `profiles(id)`, `permission text NOT NULL CHECK (permission IN ('view','edit'))`, `cascade_to_subpages boolean NOT NULL DEFAULT false`, `granted_by uuid NOT NULL` → `profiles(id)`, `created_at`.
PK `(page_id, grantee_id)`.

Permission resolution order (most-permissive wins):
1. World owner → always `edit`.
2. Direct grant on the page → that permission.
3. Any ancestor page's cascade grant → inherited permission.
4. Otherwise fall back to `visible_to_players` + section overrides (produces read-only access for campaign members if applicable).

Page soft-delete cascades through FK onto the permission rows — they come back when the page is restored within the 30-day window.

### `page_pc_links`
`(page_id, character_id)` PK. Independent of any `pc_stub` — a non-Players page can tag a PC for filtering.

### `world_maps`
`id`, `world_id`, `owner_page_id` (null = world-primary candidate; set = owned by a Location page), `campaign_id`, `label`, `image_key` (in `world-maps` bucket), `image_width`, `image_height`, `aspect_ratio`, `byte_size bigint NOT NULL` (for storage tally), soft-delete cols.

### `pin_types` (reference, seeded)
`key` PK (one of 7 above), `label`, `default_icon_key` (Lucide name), `default_color_hex`, `sort_order`.

### `map_pins`
`id`, `map_id`, `world_id` (denormalized for cheap filter-bar queries + RLS), `pin_type` → `pin_types(key)`, `x_pct`, `y_pct` (0.0–1.0), `label`, `icon_key_override`, `color_override`, `linked_page_id` (nullable).

### `timeline_events` (restructured from original spec)
Now child rows of a timeline **page**, not free-floating under a world.

`id`, `timeline_page_id uuid NOT NULL` → `world_pages(id) on delete cascade`, `world_id` (denormalized), `campaign_id` (scope — can differ from the timeline page's scope if DM adds a campaign-only event to a world-level timeline), `title`, `body JSONB` (Tiptap), `body_text`, `body_refs`, `date_values JSONB` (keyed by the parent timeline page's `calendar_schema` unit keys — e.g., `{"Era":"Age of Fire","Year":1203,"Season":"Ice"}`), `sort_key numeric NOT NULL` (derived server-side from `date_values` + parent's `calendar_schema` so events order deterministically), `tie_breaker numeric NOT NULL DEFAULT 0` (fractional, for drag-to-reorder within identical `date_values`), `source_session_id` → `sessions(id)` (set by "Add to world timeline"), `visible_to_players`, soft-delete cols.

The parent timeline page stores the `calendar_schema` inside its `structured_fields` JSONB under a reserved key `__calendar_schema`: an ordered array of `{key, label, type}` entries where `type` ∈ `text` | `number` | `ordered_list` (with the ordered list of option values).

Trigger on INSERT/UPDATE of `date_values` recomputes `sort_key`:
- For each unit in the parent's `calendar_schema` in order, contribute a weighted numeric component (numbers direct; ordered_list indices; text lexicographic hash bucket).
- Missing units weight as −∞ (place before defined events).

### `world_images`
`id`, `page_id` (owner — delete-cascaded), `world_id` (denormalized), `image_key` (in `world-images` bucket), `width`, `height`, `alt`, `byte_size bigint NOT NULL` (for storage tally), soft-delete cols.

### `profiles` (extended)
Add `storage_used_bytes bigint NOT NULL DEFAULT 0`. Maintained by triggers on `world_images` + `world_maps` insert/hard-delete. Reconciliation job (weekly) re-tallies from source of truth and logs mismatches.

### Soft-delete mechanics

RPCs like `trash_world_page(page_id)` set `deleted_at = now()` and `hard_delete_after = now() + interval '30 days'`, cascading to the page tree + `world_page_permissions` (via FK) + `world_images` + child timeline events + any `world_maps` owned by the page. A daily job (pg_cron or scheduled Edge Function) hard-deletes rows where `hard_delete_after < now()` and reaps their Storage objects. Restore clears both columns and re-enables the cascaded permissions. A **weekly reconciliation pass** lists objects in `world-images` / `world-maps` buckets and deletes any whose associated DB row is gone (catches orphans from network-glitched deletes).

### Section templates (code, not DB)

Templates live in `packages/content/src/world-templates/` as versioned TypeScript constants. Each `(template_key, version)` is a separate file:

```
packages/content/src/world-templates/
  locations/
    v1.ts
    v2.ts          // added when a field removed or type changed
  npcs/
    v1.ts
  ...
  index.ts         // registry: getTemplate(key, version) → SectionTemplate
```

```ts
interface SectionTemplate {
  key: 'locations' | 'npcs' | 'players' | 'factions' | 'timeline' | 'religions' | 'organizations' | 'items' | 'lore' | 'blank';
  version: number;
  label: string;
  pageKind: WorldPage['page_kind'];
  fields: StructuredField[];
  defaultIcon: string;   // Lucide key
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

**Versioning rules (enforced by code review + a CI hash check that fails if a shipped version file changes):**
- Adding a field → no version bump. All pages get the new field; blank by default.
- Relabeling, reordering, changing `defaultIcon` → no version bump.
- **Removing a field** → new version file.
- **Changing a field's type** → new version file.
- Old version files are append-only after first ship. You never edit `v1.ts` once it has real-world pages on it.

Page-level upgrade affordance: page menu includes "Update template to v*N*" (only when a newer version exists). Preview modal shows added/removed/transformed fields; confirm writes `template_version = N` and runs any declared field mapper. Default behavior is "stay on your version forever."

### Edit lock mechanics

Columns on `world_pages`: `editing_user_id`, `editing_heartbeat_at`.

RPCs:
- `acquire_page_lock(page_id)` — succeeds if `editing_user_id IS NULL OR editing_user_id = auth.uid() OR editing_heartbeat_at < now() - interval '90 seconds'`; sets the lock to the caller. Returns `{ locked_by: display_name, locked_since }` on conflict.
- `heartbeat_page_lock(page_id)` — bumps `editing_heartbeat_at = now()` when caller holds the lock. Autosave calls also heartbeat.
- `release_page_lock(page_id)` — clears the lock when caller holds it. Called on editor unmount / tab close / navigate-away (best-effort).
- `force_release_page_lock(page_id)` — owner-only. Clears the lock regardless of holder.

Client autosave fires 2s after last keystroke, writes `body` + `structured_fields` directly (not to a draft column — the lock guarantees a single editor). Supabase Realtime broadcasts lock state changes on the world channel so other viewers see the "X is editing" banner appear/disappear without polling.

### Body extraction trigger

`body_text` and `body_refs` are derived columns, never written by clients. A Postgres BEFORE INSERT OR UPDATE OF `body` trigger on `world_pages` (and `timeline_events`) walks the Tiptap JSON and regenerates both columns. Implementation uses `jsonb_path_query` to find text nodes + mention nodes. Any code path that mutates `body` — clients, migrations, admin RPCs — stays consistent by construction.

---

## RLS & visibility

Adds helpers to the existing `is_campaign_dm` / `is_campaign_member` pair:

```sql
create or replace function is_world_owner(p_world_id uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from worlds where id = p_world_id and owner_id = auth.uid());
$$;

create or replace function user_can_view_page(p_page_id uuid)
returns boolean language sql security definer set search_path = public as $$
  -- owner → true; direct grant → true; ancestor cascade grant → true;
  -- visible_to_players path → true (requires campaign membership, section not
  -- force-hidden, not deleted, not orphaned). Else false.
  ...
$$;

create or replace function user_can_edit_page(p_page_id uuid)
returns boolean language sql security definer set search_path = public as $$
  -- owner → true; direct grant with permission='edit' → true; cascade grant
  -- with permission='edit' → true. Else false.
  ...
$$;
```

Per-table policies:

- **`worlds`** SELECT inline `owner_id = auth.uid()` (no helper — same recursion lesson as `campaigns`). Owner sees their soft-deleted worlds too; the UI filters.
- **`world_campaigns`** SELECT: owner OR member of the campaign (players need this to resolve which worlds to query). INSERT / DELETE: owner + `is_campaign_dm`.
- **`world_sections`** SELECT: owner OR the section contains at least one page the viewer can read via `user_can_view_page`. Write: owner only.
- **`world_pages`** SELECT: `user_can_view_page(id)`. UPDATE: `user_can_edit_page(id)` AND (no edit lock conflict — enforced at RPC layer, not policy, so lock race surfaces as a clear RPC error). INSERT/DELETE: owner only (grants can't create pages; only the owner adds structure).
- **`world_page_permissions`** SELECT: `user_can_view_page(page_id)` (grantees see each other). INSERT/UPDATE/DELETE: owner only.
- **`world_maps`** / **`map_pins`** mirror the owning page's readability via `user_can_view_page`.
- **`timeline_events`** mirrors the parent timeline page's readability.
- **`page_pc_links`** visibility piggybacks on the page's SELECT — players re-query the page for chip data.
- **`world_images`** mirrors the owning page.

Storage buckets `world-maps` and `world-images` are private. Object paths are `{worldId}/{pageId|mapId}/…` so RLS on the bucket can key off the path prefix. Signed URLs fetched at render; **refresh at 80% TTL or on 403**. A batch-sign RPC returns signed URLs for all images on a page in one call to avoid N round-trips.

No per-field visibility in v1 (no secret-column stripping). Re-evaluate if demand shows up.

### PC stub lifecycle

The unique partial index `(world_id, character_id) WHERE page_kind = 'pc_stub'` protects against duplicates. Specific behaviors codified:

| Event | Behavior |
|---|---|
| Character created on a linked campaign | Trigger materializes a stub page in the Players section, `campaign_id` set, `title` = character name, `title_overridden = false`. |
| Character renamed | Sync stub `title` only while `title_overridden = false`. DM's explicit rename sets `title_overridden = true` and freezes the title from future character renames. |
| Character deleted | Stub flagged `is_orphaned = true`. Body + DM enrichment preserved. Never hard-deleted by the trigger. |
| Campaign unlinked from world | Stub flagged `is_orphaned = true`. Campaign-scoped pages under any section also flagged. |
| Campaign re-linked after unlink | `INSERT ... ON CONFLICT (world_id, character_id) WHERE page_kind='pc_stub' DO UPDATE SET is_orphaned = false`. Preserves enrichment. |
| Character moved between campaigns | If the new campaign is linked to this world, stub's `campaign_id` updates to the new campaign. If not, stub goes orphaned. |

---

## Editor & chips

Shipping **Tiptap** on web and **10tap-editor** (Tiptap-in-WebView) on native. Shared extension package at `packages/ui/src/world-editor/` keeps the node schema, suggestion config, and extractors aligned across platforms.

### Low-end Android strategy (Decision #17)

Committed strategy is **A + C**:

**(A) Aggressive optimization on the shared editor**, applied once and benefiting every platform:
- Chunked/virtualized NodeView rendering — only render nodes in the viewport + buffer. May require forking or layering on top of 10tap.
- Debounced `body` persistence (2s) + client-side extractors moved to idle callback.
- Server-side body derivation via trigger (see above) means the client doesn't ship `body_text` / `body_refs` — one less payload.
- Inline images lazy-decode until visible.
- Trim Tiptap extensions to what we actually use (no tables, no YouTube embeds, no heavy marks).

**(C) Feature-flagged progressive disable** on detected low-memory / slow devices, auto-applied with a manual override in Settings:
- Disable hover-preview NodeViews.
- Replace live `@mention` suggestion popover with an `@`-then-Enter full-screen picker.
- Render inline images as thumbnail placeholders until tapped.
- Autosave debounce bumped from 2s → 5s.

Editing **always works** on every supported platform. Low-end devices get a plainer but correct experience.

Mid-Phase 3 benchmark targets: 5,000-word doc on a Moto G Power (4GB RAM) — typing lag ≤ 100ms p95, scroll jank ≤ 1 dropped frame per 30s.

### Node schema

StarterKit block nodes + marks (`bold`, `italic`, `underline`, `strike`, `code`, `link`), plus two custom nodes:

```ts
// Mention / chip — one node kind covers page / pin / pc / timeline references
{
  type: 'mention',
  attrs: {
    kind: 'page' | 'pin' | 'pc' | 'timeline',
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

### Chip UX

- `@` trigger opens a suggestion popover (scopes: Pages, PCs, Map pins, Timeline events). Debounced ~200ms.
- Selecting a target inserts a `mention` node with the chosen `kind` / `targetId` / `label`.
- **Web**: a `MentionNodeView.web.tsx` component adds a hover popover showing the target's title + first 120 chars of `body_text`. Click navigates.
- **Native**: `MentionNodeView.native.tsx` skips the hover layer. Tap navigates. (Disabled entirely in progressive-disable mode.)
- When the target is missing or soft-deleted, the renderer injects `deletedSnapshot` attrs and the chip renders as a grey inert pill. If inside the 30-day recovery window, DM clicks open a restore flow.

### Edit lock UX

- When page loads, client calls `acquire_page_lock`. Success → full editor. Conflict → read-only view with amber banner: *"Tyler is editing this page. You'll be notified when they're done."*
- When holder releases or heartbeat goes stale, Realtime event on the world channel triggers viewer to re-attempt acquisition.
- Owner-only "Force unlock" button in banner, behind a confirm dialog.
- Autosave indicator in the editor header: `Saving… / Saved hh:mm`.

### Feature 6 coexistence

Feature 6 (Session Notes + Campaign Notes Hub) keeps its shipped Markdown `RichTextEditor`. No migration. Two editors coexist — world-builder pages use Tiptap, session notes + recap continue on Markdown. Revisit only if product needs a unified editor later. Document the reason in `docs/architecture.md` so future contributors don't "unify" them accidentally.

The one bridge: "Add to world timeline" on a published recap. Conversion uses `marked` → HTML → Tiptap's `generateJSON(html, extensions)` to produce the initial timeline event body. DM can edit before saving.

---

## Map canvas

- **Storage bucket** `world-maps`, private, signed URLs only. Object path `{worldId}/{mapId}/{filename}`. Accepted: `image/jpeg`, `image/png`, `image/webp`. 20MB cap enforced at the upload API.
- **Compression:** same strategy as images — client-side via Expo ImageManipulator (native) or canvas (web) before upload; server-side size cap at the upload RPC rejects anything > 20MB.
- **Pan/zoom library**: `react-zoom-pan-pinch` on web; `react-native-reanimated` 3 + `react-native-gesture-handler` on native. Zoom range is resolution-aware: `minScale = canvasFit` (smallest scale that fits the whole image inside the frame) and `maxScale = max(canvasFit * 4, 2)` so a high-res upload can zoom past native pixels while small images keep the 4× ceiling. A vertical zoom bar on the canvas (+/- buttons with a 0–100% fill) drives 8 evenly-spaced steps via `setTransform` (not the library's exponential `zoomIn/Out`); mouse-wheel step is pinned to `sliderStep / 100` so one notch ≈ one tick. Cold landings center + fit the map; returning visits restore the stored viewport clamped to the current bounds. Pan momentum disabled (`panning.velocityDisabled`, `velocityAnimation.disabled`) so release-to-stop feels tight. Right-click (web) drops a pin at the cursor for owners without needing placement mode.
- **Pin coordinates** stored as 0–1 percentages. On render: `pin.x_pct * image.displayedWidth`, same for Y. Placement mode captures click/tap, reverse-projects through current scale/translate, saves a new `map_pins` row.
- **Nested navigation** is managed by `packages/store/src/world-map-stack.store.ts` — a breadcrumb stack of `{mapId, viewport: {scale, translateX, translateY}, breadcrumbLabel}` entries. "View Sub-map" pushes the stack and swaps to the child map; back pops and restores the viewport. Top-of-stack viewport persisted; mid-drill state session-only.
- **Filter bar** toggles a `Set<PinTypeKey>` that the pin layer consults before rendering.

---

## Timeline rendering

Timeline pages (`page_kind = 'timeline'`) render a vertical timeline instead of the structured-fields form + free-text body used by other page kinds. Implementation notes:

- **Header** — title + DM-editable `calendar_schema` editor (accordion, collapsed by default after initial setup).
- **Web** — vertical spine with event cards alternating left/right.
- **Native** — stacked single-column of event cards.
- **Grouping** — events grouped by the top `calendar_schema` unit (e.g., all events in "Age of Fire" together).
- **Event card** — title, formatted date (rendered from `date_values` through the calendar_schema's unit labels), first ~100 chars of `body_text`, chips for each `body_refs` target.
- **Sorting** — `ORDER BY sort_key ASC, tie_breaker ASC, id`. Drag-to-reorder within a tie updates `tie_breaker`.
- **Add event** — DM fills `date_values` against the calendar_schema + title + body; server computes `sort_key`.

Any page can chip-reference a timeline event (`mention.attrs.kind = 'timeline'`), enabling "during the [Siege of Northfall]" links from NPC pages, Faction pages, etc.

---

## Search

Two RPCs drive all search surfaces:

```sql
search_world(world_id uuid, query text, scope_all boolean, limit int default 20, offset int default 0)
  returns table (kind text, id uuid, world_id uuid, title text, snippet text, rank real, ...)

search_campaign_worlds(campaign_id uuid, query text, limit int default 20, offset int default 0)
  returns table (kind text, id uuid, world_id uuid, title text, snippet text, rank real, ...)
```

Unions FTS hits across:
- `world_pages.title || ' ' || body_text`
- `world_pages.structured_fields` (via `jsonb_path_query_array`)
- `map_pins.label`
- `timeline_events.title || ' ' || body_text`

`search_world` default scope = current world; `scope_all = true` unions every world owned by `auth.uid()`. `search_campaign_worlds` unions across every world linked to the passed campaign the caller has access to (subject to permissions on each page).

**Pagination:** default `limit = 10`, Load More pages in 20 at a time. Debounced ~300ms. Results grouped by world when cross-world. Orphaned pages included with an "Orphaned" badge by default; filter chip excludes them.

---

## Campaign world lookup

New campaign-detail surface that doesn't live inside a world route:

- **`CampaignWorldsCard`** on the campaign detail page: lists every world linked to this campaign. Each row links into the world pre-lensed to this campaign.
- **`CampaignWorldLookupDrawer`** launched from a button on the campaign detail page: slide-in drawer that runs `search_campaign_worlds`, shows a read-only preview of a hit, and offers a pencil icon → full editor for any page where the current user has edit permission (owner or granted edit).

Future hook: the same drawer can be embedded into the Combat / Party screens once the session-mode team wants in-session world lookup. Plumbing is shared.

---

## Phased build order

Each phase is a feature branch + PR, independently shippable. All phases after 1 depend on 1.

### Phase 1 — Foundation ✅ Shipped
`worlds`, `world_campaigns`, `is_world_owner`, `create_world_with_owner` atomic RPC, `/worlds` list + `CreateWorldModal` (optional campaign linking), `/world/[worldId]` workspace shell with `WorldSidebar` (cover + identity + lens placeholder + inert "Sections arrive next" scaffolding) and gear-triggered `WorldSettingsModal` (rename, link/unlink campaigns, archive/unarchive, soft-delete). Lens dropdown is disabled placeholder. Shipped on `feature/world-builder-phase-1`.

### Phase 2 — Sections & pages (no editor)
`world_sections`, `world_pages` (with `template_version` pinned + edit-lock columns reserved), section templates (v1) in `packages/content/src/world-templates/`, template registry, sidebar with unlimited nesting, create-section/page modals, structured-fields form renderer, page-kind change affordance, move-page-across-sections, Recently Deleted scaffolding. Page body is placeholder. **Template versioning rules documented in `world-templates/README.md` and enforced by a CI hash check.**

### Phase 3 — Editor, chips, backlinks, edit lock
Tiptap + 10tap install, shared extensions in `packages/ui/src/world-editor/`, `WorldPageEditor.{web,native}.tsx`, mention suggestion popover (kinds: `page` + `pc` + `timeline`; pin added in Phase 5), hover preview (web), deleted-target chip UI, backlinks via `body_refs`. **Edit lock acquire/heartbeat/release/force-release RPCs** + `EditLockBanner` + "Saving… / Saved" indicator. **`body_text` / `body_refs` BEFORE-trigger** (so server is authoritative). Mid-phase Android perf benchmark; apply progressive-disable (C) feature flag if needed.

### Phase 4 — Visibility, lens, PC stubs, permissions
`visible_to_players`, section overrides, PC-stub materialization triggers on `world_campaigns` INSERT and `characters` INSERT with full PC stub lifecycle (rename/delete/unlink/re-link/move). `LensDropdown`, entry heuristic (campaign-detail → that campaign's lens; homepage → world-only), mid-session lens switch banner, orphan banner, Player View preview toggle. **Permission grant system**: `world_page_permissions` table, `user_can_view_page` / `user_can_edit_page` helpers, `ShareModal.tsx` (add/remove grantees, cascade toggle, grantee list visible to each other), updated page RLS.

**Design handoff references (Phase 4):**
- Visibility chip → `.card-visibility` with `.player` / `.gm` variants (backdrop-blur, 26px); becomes click-to-toggle for owners in this phase.
- Lens dropdown → `.campaign-switch` in `shell.jsx` sidebar head (crown icon + campaign label + chevron). The dropdown body lists linked campaigns + a `world-only` entry.
- Share trigger → topbar button on `screens_c.jsx` (right cluster, alongside save-state + visibility). Launches `ShareModal`.
- Mid-session lens-switch banner → reuse `.takeover-banner` chrome (amber accent, 3px left border) with copy like "DM switched lens to <Campaign>".
- Orphan banner → same banner chrome, `hpDanger` accent, inline "Re-link" / "Dismiss" actions.
- Player View toggle → topbar action, same pill treatment as Share.
- **Permission source chips in `ShareModal`** — each grantee row badges its source: `Direct` (accent tint) or `Inherited from <ancestor>` (muted tint, page-name link). Needed so GMs can tell why a user has access and decide whether to override vs. edit the ancestor grant.

### Phase 5 — Maps, pins, nesting
`world_maps`, `pin_types` (seeded), `map_pins`, `world-maps` bucket, `MapCanvas.{web,native}.tsx`, pin layer + placement mode + filter bar, sub-map drill-down + breadcrumbs, `world-map-stack.store.ts`. Pin mention kind wired into the Phase 3 suggestion popover. Batch signed-URL RPC.

### Phase 6 — Timelines + Feature 6 integration
`timeline_pages` machinery (`page_kind = 'timeline'`) — including `calendar_schema` editor, `date_values` form, `sort_key` trigger, vertical timeline renderer, add/edit/reorder events. Auto-create one primary timeline page per new world + `worlds.primary_timeline_page_id`. **Ability to create timeline pages in any section, not just the default Timeline section.** Timeline mention kind wired into the Phase 3 suggestion popover. `AddToWorldTimelineButton` integrated with the published-recap flow in Campaign Notes Hub (`components/notes/recap/RecapEditorPanel.tsx` adjacent) — Markdown→Tiptap conversion via `marked` + `generateJSON`.

### Phase 7a — Players section & stub enrichment
Players-section hybrid UI, stub enrichment flow, orphan-resolution UX (re-link / re-home / dismiss), `title_overridden` tracking in UI.

### Phase 7b — Images, storage, compression
`world_images` bucket + inline image insertion, client-side compression (Expo ImageManipulator / canvas), server-side size cap in the upload RPC, Supabase Storage read-side resize for mobile, `profiles.storage_used_bytes` triggers + reconciliation job, 80% warning banner + 100% upload block.

### Phase 7c — Search & campaign lookup drawer
`search_world` + `search_campaign_worlds` RPCs, `SearchBar`, `SearchResultsDrawer`, orphan-badge rendering, Load More pagination (10 then +20). `CampaignWorldsCard` + `CampaignWorldLookupDrawer` on the campaign detail page.

### Phase 8 — Polish & deletion UX
Fractional `sort_order` drag-to-reorder (sidebar + timelines), Recently Deleted restore flow, daily hard-delete cron + Storage reaper, **weekly Storage bucket reconciliation pass**, Android editor perf tuning if Phase 3's benchmark still bites, template-upgrade modal affordance on pages, a11y + keyboard pass.

---

## Critical files

**Routes**
- `app/(drawer)/worlds.tsx`
- `app/world/[worldId]/_layout.tsx`, `index.tsx`
- `app/world/[worldId]/section/[sectionId].tsx`
- `app/world/[worldId]/page/[pageId].tsx`
- `app/world/[worldId]/map/index.tsx`, `map/[mapId].tsx`
- `app/world/[worldId]/timeline/[timelinePageId].tsx` (dedicated timeline view)
- `app/world/[worldId]/search.tsx`, `settings.tsx`

**Components (`components/world/`)**
- `Sidebar.tsx`, `SidebarSection.tsx`, `SidebarPageRow.tsx`, `SectionTemplatePicker.tsx`, `CreateSectionModal.tsx`, `CreatePageModal.tsx`, `PageTypeChangeMenu.tsx`, `PageTemplateUpgradeModal.tsx`
- `LensDropdown.tsx`, `shared/OrphanBanner.tsx`, `shared/PlayerViewToggle.tsx`, `shared/DeletedChip.tsx`
- `StructuredFieldsForm.tsx` + `fields/*.tsx`
- `share/ShareModal.tsx`, `share/GranteeList.tsx`, `share/CascadeToggle.tsx`
- `editor/WorldPageEditor.{web,native}.tsx`, `editor/EditLockBanner.tsx`, `editor/AutosaveIndicator.tsx`, `editor/MentionNodeView.{web,native}.tsx`, `editor/MentionSuggestionList.{web,native}.tsx`, `editor/ChipRenderer.tsx`, `editor/WorldImageNodeView.tsx`, `editor/StorageUsageBadge.tsx`
- `map/MapCanvas.{web,native}.tsx`, `map/PinLayer.tsx`, `map/PinPlacementMode.tsx`, `map/PinFilterBar.tsx`, `map/PinEditorModal.tsx`, `map/MapBreadcrumbs.tsx`, `map/MapUploadModal.tsx`
- `timeline/TimelinePageView.tsx`, `timeline/TimelineCalendarSchemaEditor.tsx`, `timeline/TimelineEventCard.tsx`, `timeline/TimelineEventForm.tsx`, `timeline/AddToWorldTimelineButton.tsx`
- `search/SearchBar.tsx`, `search/SearchResultsDrawer.tsx`

**Campaign-detail surface (lives under `components/campaign/`)**
- `CampaignWorldsCard.tsx`, `CampaignWorldLookupDrawer.tsx`

**API (`packages/api/src/`)**
- `worlds.ts`, `world-campaigns.ts`, `sections.ts`, `pages.ts` (CRUD + lock RPCs), `world-permissions.ts`, `maps.ts`, `pins.ts`, `pin-types.ts`, `timeline-pages.ts`, `timeline-events.ts`, `world-images.ts`, `world-storage.ts`, `world-search.ts` (includes `searchCampaignWorlds`), `template-upgrade.ts`

**Stores (`packages/store/src/`)**
- `worlds.store.ts`, `current-world.store.ts`, `world-map-stack.store.ts`, `world-search.store.ts`, `world-sidebar.store.ts` (expanded-node state per-device)

**Content**
- `packages/content/src/world-templates/` — versioned template files (10 keys × version). Registry in `index.ts`. `README.md` documenting the versioning rules.

**Types**
- `packages/types/src/database.types.ts` (extended)
- `packages/types/src/world.ts` (new — `SectionTemplate`, `StructuredField`, `TiptapDoc`, `MentionAttrs`, `PermissionGrant`, `CalendarSchema`)

**Migrations**
- One migration per phase, named `YYYYMMDDHHMMSS_world_builder_phase_<N>_<desc>.sql`

**Docs to update alongside each phase**
- `docs/build-status.md` (Feature 9 checklist)
- `docs/architecture.md` (new buckets, new RLS helpers, Tiptap/10tap)
- `docs/features/README.md` (summary line)

---

## Verification

Per-phase Tier 1 (`npm run typecheck` — no net-new baseline errors) plus targeted Tier 4 smoke on the golden path for that phase's scope.

**Per-phase smoke tests:**
- Phase 1: create world, link campaign, soft-delete world.
- Phase 2: create default sections, nest 3+ pages, fill structured fields, move a page across sections, soft-delete a page.
- Phase 3: `@` picker inserts a chip; edit lock banner appears when a second tab opens the same page; force-unlock as owner; autosave indicator updates; deleted-target chip renders grey.
- Phase 4: visibility toggles, PC stub lifecycle table (rename / delete / unlink / re-link / move) each verified end-to-end; `ShareModal` grant → grantee list shows both grantees → grantee can view / edit per grant → revoke removes access.
- Phase 5: upload map, place 5 pins of different types, sub-map drill-down + breadcrumb back preserves viewport.
- Phase 6: calendar schema editor, add events in two eras, verify sort order; "Add to world timeline" converts a recap; timeline chip from an NPC page navigates correctly.
- Phase 7a: stub enrichment; orphan + re-link round-trip.
- Phase 7b: inline image upload; storage badge reflects usage; 80% warning triggers; 100% blocks upload; compression reduces byte count.
- Phase 7c: `search_world` + `search_campaign_worlds` both return expected hits; Load More pages correctly; campaign lookup drawer edit entry works for grantees.
- Phase 8: drag-reorder, restore a deleted page + its cascaded grants, daily reaper log.

**End-to-end Tier 4 run (Phase 8):** create world → link two campaigns → build sections with nested pages → upload map + drop pins of multiple types → share a subset of pages with specific users (some via direct grant, some via cascade) → log in as a granted user and confirm their effective permission → log in as a player in each campaign and confirm `visible_to_players` subset → try editing a page from a third account and confirm lock/permission denial.

**RLS audit (Phase 8):** sign in as a non-owner non-member non-grantee and confirm every world-builder table returns zero rows on SELECT. Matrix covers: (world-level + section hidden), (campaign-level in wrong campaign), (shared directly via permission), (shared via cascaded grant from ancestor), (soft-deleted), (orphaned), (page visible but parent soft-deleted).

---

## Risks & follow-ups

1. **Storage pressure.** 500MB per-user soft cap. Monitor in Phase 8; revisit tier/tiling if DMs routinely hit it.
2. **10tap Android perf.** Committed to Option A + C. If Phase 3's benchmark on Moto G Power still bites after optimizations + progressive disable, the next fallback is Option B (platform-native editor sharing the JSON schema) — treat as a scoped v2 project, not a Phase 3 pivot. Document benchmark results either way.
3. **Two-editor coexistence (Feature 6 Markdown ↔ Feature 7 Tiptap).** By design. Document the reason in `docs/architecture.md` so future contributors don't accidentally "unify."
4. **`body_refs` drift eliminated.** BEFORE-trigger on `world_pages.body` + `timeline_events.body` regenerates `body_text` / `body_refs` automatically on any write. No client dependency.
5. **Signed URL expiry.** Auto-refresh at 80% TTL or on 403, baked into `world-storage.ts`. Batch-sign RPC reduces round-trips.
6. **Template versioning.** Type changes and removals bump version and ship a new file. Old versions are append-only (CI hash check enforces). Pages opt in to upgrades via page-menu affordance; default is "stay forever."
7. **PC-stub trigger security.** `SECURITY DEFINER` with `search_path = public`. Fires on `world_campaigns` INSERT, `characters` INSERT for a campaign already linked, `characters` UPDATE of `name` (respects `title_overridden`), `characters` DELETE (→ orphan), and `world_campaigns` DELETE (→ orphan).
8. **Revision history (v2 candidate).** Per-page edit history not in v1. Recovery path for accidental overwrite is limited to the author noticing before they save again. When we add it: `world_page_versions` + BEFORE-UPDATE snapshot trigger + 30-day age-out.
9. **Multi-DM / co-DM workflow.** Handled by owner + per-page edit grants — no separate `world_collaborators` model. If heavy co-DM use emerges, revisit whether a world-level "edit all" role makes sense (would be a simple additive migration).
10. **Storage bucket orphan reconciliation.** Weekly job lists bucket objects vs. DB rows and reaps orphans; catches network-glitched deletes from the daily reaper.
11. **Pin type + section template extensibility.** 7 pin types + 10 section templates are all code-defined. User-defined pin types / section templates is v2 candidate.
12. **Edit lock liveness.** 90-second stale threshold means a disconnected editor's lock releases in 90s. Someone actively editing with a spotty connection that drops >90s will lose their lock and see a "someone else has taken over" banner when they reconnect — their unsaved autosave (within the last 2s) is probably already written, but unwritten text is lost. Acceptable tradeoff for v1.
