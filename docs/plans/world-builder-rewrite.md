# Plan — Feature 7 Rewrite: World Builder & Notes Manager

> **Status:** Plan only — no implementation yet. Parked for later build-out.
> Full refined spec in [../features/07-world-building.md](../features/07-world-building.md);
> this file is the short-form plan.

## Context

Feature 7 (`docs/features/07-world-building.md`) is a 0%-built spec. The user wants a Notion/OneNote-inspired vision: a world-first workspace where an owner (DM) creates worlds, organizes them into sidebar sections (default + custom), writes free-form pages with unlimited sub-pages, drops categorized pins on uploaded maps, and reveals content to players on a per-page basis. A world can be linked to multiple Vaultstone campaigns. After a second round of design review, the plan now also includes per-page sharing grants, pessimistic page-level edit locks, first-class timeline pages with DM-defined calendar schemas, a campaign-level world lookup drawer, versioned section templates with opt-in upgrade, and a native editor strategy that supports low-end Android without dropping features.

Scope is the **entire feature to completion**, not just an MVP cut.

---

## Visual source of truth

The Claude Design handoff at **[`../design/vaultstone-handoff/`](../design/vaultstone-handoff/)** is the visual source of truth for every world-builder screen. Start from `README.md`, the chat transcript in `chats/chat1.md`, and `project/Vaultstone.html` (which imports `shell.jsx`, `screens_a..f.jsx`, `styles.css`, `data.jsx`, `icons.jsx`). Recreate the look pixel-faithfully in React Native + NativeWind; don't mirror the prototype's internal structure where a Vaultstone primitive fits better.

**Per-phase screen bindings** (phase → handoff artifact → Vaultstone route/component):

| Phase | Handoff artifact | Vaultstone target |
|---|---|---|
| 2 — Sections & pages | `.app` shell grid, `.rail`, `.sidebar` + `.nav-tree`, `.topbar`, `.page-head` + `.page-icon`, `.cards-grid` + `.card.hero`, `.world-grid` + `.world-card` | `app/world/[worldId]/_layout.tsx`, `WorldRail`, `WorldSidebar` + `SidebarSection` + `SidebarPageRow`, `WorldTopBar`, `PageHead`, `SectionPageGrid` + `Card tier="hero"`, The Atlas landing |
| 3 — Editor & backlinks | `screens_c.jsx` Wiki entry (@-mention inline refs, hover preview, backlinks panel, edit-lock banner) | Tiptap/10tap page body + `MentionPopover` + `BacklinksPanel` + `EditLockBanner` |
| 4 — Visibility & lens | `.card-visibility` player/GM eye variants, semantic `--player` teal / `--warn` amber / `--danger` crimson / `--cosmic` azure tokens, filter chip row | `VisibilityBadge` interactive mode, `LensDropdown`, page-card filter chip row |
| 5 — Maps & pins | `screens_b.jsx` WorldMap — pin types (city/landmark/npc/faction/quest), sub-maps dock, zoom control, pin hover label, map style tokens (dark/parchment/hex/tactical) | `MapCanvas.{web,native}` + `PinMarker` + `SubMapDock` + `MapToolbar` + `ZoomCtl` |
| 6 — Timelines | `screens_d.jsx` Timeline — era ribbon, L/R alternating event cards, event icons on axis, cross-link tags | `TimelinePageView` + `EraRibbon` + `TimelineEventCard` |
| 7 stretch — Faction graph | `screens_e.jsx` Factions — force-directed node graph, ally/enemy/neutral edges, faction detail drawer | `FactionGraphCanvas` + `FactionEdgeRenderer` (Phase 7 or deferred) |
| Campaign Home (outside this feature) | `screens_a.jsx` Dashboard — hero cover, opening description pull-quote, The World 3-column grid, Party + Next Session pin row, At-a-Glance tiles | Noted as a follow-up on Feature 2 (Campaign); **not** part of the world-builder scope |

**Design decisions locked by the handoff** (lock these into Phase 2 and forward):

- **Three-column in-world shell** = 56px rail + 220/248/280px contextual sidebar + main. Drawer stays at the Expo Router level for global app nav.
- **Semantic color tokens** added to Noir additively (no renames): `player` (#4ec8c0 teal), `gm` (#e6a255 amber), `cosmic` (#6b8af0 azure). `danger` reuses existing `hpDanger`. `primary` (Noir lavender/purple) remains the single primary-action color.
- **Page head pattern** — 56×56 gradient icon tile (template accent) + display-font title + uppercase meta kicker + right-aligned actions. Used on every page detail, the world landing, and every section screen.
- **Visibility eye** — 26px backdrop-blur chip top-right on every page/section card. Display-only in Phase 2; interactive in Phase 4.
- **Hero card tier** — first card in a grid section spans 2×2 with 28px display title and image bleed. Implemented as `Card tier="hero"` on the existing Noir primitive.
- **Typography — LOCKED to option 2:** Fraunces display + Cormorant Garamond body-italic loaded inside `/world/` routes only via `expo-font` in `app/world/[worldId]/_layout.tsx`; rest of app stays on Noir's Space Grotesk + Manrope. Future pass may promote serif typography app-wide if world-scoped rollout lands well.
- **Tweaks panel** (accent/density/heading/mapStyle) is **prototype-only** — not ported.

---

## Locked design decisions

Twenty-five decisions locked — see the full table in [../features/07-world-building.md#key-design-decisions](../features/07-world-building.md#key-design-decisions). High-level summary:

- **Page scope & lens** — every page is world- or campaign-scoped; lens filters DM's view by campaign.
- **Player reveal + per-page grants** — `visible_to_players` toggle + section overrides, plus per-page `view`/`edit` grants for specific users with optional cascade to sub-pages. Owner always has edit everywhere.
- **Edit lock** — pessimistic row-level lock with 30s heartbeat + 90s stale threshold; owner can force-unlock.
- **Templates versioned** — pages pin `template_version`; type changes ship a new version file; pages opt in to upgrades.
- **Timelines first-class** — `page_kind = 'timeline'` with DM-defined `calendar_schema`; can live in any section; events under them sort by derived `sort_key`.
- **Campaign world lookup** — `CampaignWorldsCard` + `CampaignWorldLookupDrawer` on the campaign detail page.
- **Native editor A+C** — 10tap with aggressive optimization + feature-flagged progressive disable on low-end devices. Editing always works.
- **Images** — per-page, 500MB per-user cap, client-side compression + server-side cap + read-side resize.
- **Soft-delete with 30-day recovery** on worlds / sections / pages / maps / timelines / cascaded grants.
- **Revision history** — v2 candidate, not in this scope.

---

## Data model

`worlds` + `world_campaigns` (many-to-many join) + `world_sections` + `world_pages` with nullable `campaign_id` scope, pinned `template_version`, and reserved edit-lock columns. Plus:

- `world_page_permissions` (per-page grants, cascade flag)
- `timeline_events` as child rows of a `page_kind='timeline'` page (restructured from the original free-floating design)
- `profiles.storage_used_bytes` with trigger-maintained tally
- `worlds.primary_map_id` + `worlds.primary_timeline_page_id` (nullable, non-deferred; populated post-create)

`body_text` + `body_refs` regenerated by a BEFORE-trigger on any `body` write — clients never compute these. Full schema in the feature doc.

---

## RLS strategy

Helpers: `is_world_owner`, `user_can_view_page`, `user_can_edit_page`. Policies drive everything through `user_can_view_page` / `user_can_edit_page`, which compose owner-status + permission grants (direct + ancestor cascade) + player-visibility rules. Permission RLS: grantees on a page see each other; only the owner can add/remove grants.

---

## Editor & chips

Tiptap on web, 10tap-editor on native. Shared extensions in `packages/ui/src/world-editor/`. Mention node covers `page | pin | pc | timeline` kinds. Edit-lock banner + autosave indicator layered on top. `body_text` / `body_refs` are derived server-side. Feature 6 Markdown editor remains untouched; bridge is the "Add to world timeline" Markdown→Tiptap conversion on published recaps.

---

## Map canvas

`world-maps` bucket (private, signed URLs). `react-zoom-pan-pinch` on web, reanimated + gesture-handler on native. Pins at percentage coordinates. Nested sub-map drill-down via `world-map-stack.store.ts`. Batch signed-URL RPC.

---

## Phased build order

Each phase ships on its own `feature/world-builder-phase-N-*` branch via PR.

1. **Phase 1 — Foundation** ✅ — `worlds`, `world_campaigns`, `is_world_owner`, `create_world_with_owner` atomic RPC, `/worlds` list + create modal, `/world/[id]` shell with sidebar + settings modal (rename / link / archive / soft-delete), lens placeholder. Shipped on `feature/world-builder-phase-1`.
2. **Phase 2 — Sections & pages (no editor)** — `world_sections`, `world_pages` (with `template_version` + edit-lock columns reserved), section templates v1 + registry + CI hash check, sidebar with unlimited nesting, structured-fields form, move-page-across-sections, Recently Deleted scaffold.
3. **Phase 3 — Editor, chips, backlinks, edit lock** — Tiptap + 10tap + shared extensions, mention popover (page / pc / timeline kinds; pin added Phase 5), hover preview on web, deleted-target chip, `body_refs` backlinks. Edit-lock RPCs + banner + autosave. BEFORE-trigger on body. Android perf benchmark + progressive-disable feature flag.
4. **Phase 4 — Visibility, lens, PC stubs, permissions** — `visible_to_players`, section overrides, full PC-stub lifecycle triggers (rename / delete / unlink / re-link / move), `LensDropdown` + entry heuristic + mid-session switch banner, orphan banner, Player View preview. `world_page_permissions` + `ShareModal` + updated page RLS via `user_can_view_page` / `user_can_edit_page`.
5. **Phase 5 — Maps, pins, nesting** — `world_maps`, `pin_types` (seeded), `map_pins`, `world-maps` bucket, `MapCanvas.{web,native}`, pin placement + filter bar, sub-map drill-down + breadcrumbs, batch signed-URL RPC. Pin mention kind wired into Phase 3 popover.
6. **Phase 6 — Timelines + Feature 6 integration** — `page_kind='timeline'` with `calendar_schema` editor, `date_values` form, `sort_key` trigger, vertical timeline renderer, auto-primary-timeline on world create, timeline pages in any section. Timeline mention kind wired. `AddToWorldTimelineButton` on published recaps with Markdown→Tiptap conversion.
7. **Phase 7a — Players section & stub enrichment** — Players hybrid UI, stub enrichment + orphan resolution, `title_overridden` tracking.
8. **Phase 7b — Images, storage, compression** — `world_images` bucket + inline image insertion, client-side compression (ImageManipulator / canvas), server-side size cap at upload RPC, Supabase Storage read-resize, `storage_used_bytes` triggers + reconciliation, 80% warning, 100% block.
9. **Phase 7c — Search + campaign lookup drawer** — `search_world` + `search_campaign_worlds` RPCs with Load More pagination (10 then +20), `SearchBar`, `SearchResultsDrawer`, orphan badge. `CampaignWorldsCard` + `CampaignWorldLookupDrawer` on campaign detail page.
10. **Phase 8 — Polish & deletion UX** — Fractional `sort_order` drag-to-reorder, Recently Deleted restore, daily hard-delete cron + Storage reaper, weekly bucket reconciliation, template-upgrade modal affordance on pages, Android editor perf tuning if still needed, a11y + keyboard pass.

---

## Critical files

See [../features/07-world-building.md#critical-files](../features/07-world-building.md#critical-files) for the complete list. Notable additions since the original plan:

- `components/world/share/ShareModal.tsx`, `share/GranteeList.tsx`, `share/CascadeToggle.tsx`
- `components/world/editor/EditLockBanner.tsx`, `editor/AutosaveIndicator.tsx`, `editor/StorageUsageBadge.tsx`
- `components/world/timeline/TimelinePageView.tsx`, `timeline/TimelineCalendarSchemaEditor.tsx`, `timeline/TimelineEventForm.tsx`
- `components/world/PageTemplateUpgradeModal.tsx`
- `components/campaign/CampaignWorldsCard.tsx`, `CampaignWorldLookupDrawer.tsx`
- `packages/api/src/world-permissions.ts`, `template-upgrade.ts`, `timeline-pages.ts`

---

## Verification

Per-phase Tier 1 + targeted Tier 4 smoke on the golden path for that phase's scope.

Highlight smokes:
- Phase 3: edit lock appears for a second tab; owner force-unlock works; autosave ticks.
- Phase 4: PC stub lifecycle matrix (rename / delete / unlink / re-link / move) — each round-trips cleanly; grant + cascade + override work for view and edit.
- Phase 6: calendar schema editor + events across two eras sort correctly; "Add to world timeline" round-trips a recap.
- Phase 7c: campaign lookup drawer's edit path works for a grantee with edit permission.

End-to-end (Phase 8): create world → link 2 campaigns → build sections with nested pages → upload map + pins → share a subset of pages with specific users (some direct, some cascade) → log in as grantee, player in each campaign, unrelated user → confirm visibility + edit + lock behaviors across all accounts.

RLS audit matrix (Phase 8): (world-level + section hidden), (campaign-level in wrong campaign), (shared directly), (shared via cascade), (soft-deleted), (orphaned), (visible child of soft-deleted parent). All audited against a non-owner non-member non-grantee account — expect zero rows on SELECT.

---

## Risks & follow-ups

See [../features/07-world-building.md#risks--follow-ups](../features/07-world-building.md#risks--follow-ups) for the full list. Key items:

1. Storage pressure — 500MB cap; revisit if DMs hit it.
2. 10tap Android perf — committed to A + C; if that still bites, scoped v2 is Option B (platform-native editor sharing the JSON schema).
3. Two-editor coexistence — Feature 6 Markdown + Feature 7 Tiptap, by design.
4. `body_refs` drift eliminated via BEFORE-trigger.
5. Template versioning — type changes ship new version files; old versions append-only (CI hash check); opt-in page-level upgrade.
6. Revision history — v2 candidate.
7. Multi-DM — owner + per-page grants cover most scenarios; world-level "edit all" role is a future additive migration if needed.
8. Bucket orphan reconciliation — weekly pass catches reaper misses.
9. Edit lock liveness — 90s stale threshold; spotty-connection editors may lose >2s of unsaved text. Acceptable v1.
