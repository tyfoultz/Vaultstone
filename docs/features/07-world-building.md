# Feature 7: World Building & Campaign Knowledge Base

> GM workspace for worlds, locations, maps, factions, timeline events, and
> long-form notes. Absorbs the deeper notes infrastructure that used to live
> in Feature 6 — the session-scoped Campaign Notes Hub (session_notes +
> recap) shipped separately and still lives in [06-notes.md](./06-notes.md).
> All content is user-generated and may be stored and synced server-side.
> Respects [Legal Constraints](../legal.md).

**Status:** Post-MVP. Nothing here is built yet.

---

## Epics

1. **Worlds & Free-standing Notes** — create/manage worlds; author notes at personal, campaign, world, or location scope
2. **Rich Text & Cross-linking** — extend the shipped Markdown editor with `@content-ref` chips, `[[note-link]]` chips + backlinks, and extra formatting
3. **Hierarchy, Tags & Search** — nested notes and locations; drag-to-reorder; tags with autocomplete; full-text search
4. **Visibility & Party Sharing** — three-tier visibility (`private`/`gm_visible`/`party_shared`), server-enforced; NPC + faction secret-field stripping; Player View preview
5. **Locations & Maps** — location hierarchy with detail pages; map upload; pan/zoom; percentage-coordinate pins; nested maps
6. **Factions** — faction records, NPC membership, ally/rival relationships
7. **Timeline** — in-world events, era grouping, real-session → event linking
8. **Structured Note Types** — NPC tracker, Quest log

---

## Key Design Principles

- **System-agnostic.** No D&D-specific concepts. Works for any TTRPG setting.
- **Hierarchy is flexible.** Both notes and locations nest arbitrarily. No enforced depth.
- **Maps are optional overlays.** Any location or the world root can have a map; maps don't replace the hierarchy.
- **Pins use percentage coordinates.** `x`/`y` stored as 0–100 of image dimensions — accurate at any zoom or screen size.
- **Notes are the narrative layer.** Locations, factions, and events carry structured fields; all prose lives in linked notes.
- **Visibility is enforced server-side.** Every entity with a visibility field is filtered in every read via RLS + security-definer helpers — frontend visibility is display-only.

---

## Data Models

### Note
```typescript
Note {
  id: uuid, authorId: string,
  campaignId: uuid | null,         // null = personal note
  worldId: uuid | null,            // optional world scoping
  sessionId: uuid | null,          // authored during a session
  parentId: uuid | null,           // null = root within its scope
  sortOrder: float,                // fractional indexing for reorder
  title: string,
  body: string,                    // Markdown (shipped RichTextEditor format)
  contentText: string,             // plain-text extraction for FTS
  visibility: "private" | "gm_visible" | "party_shared",
  noteType: "general" | "npc" | "quest" | "lore",
  structuredData: json | null,     // populated for npc/quest types
  tags: string[],
  contentRefs: ContentRef[],       // links to spells/creatures/items by key
  linkedLocationIds: uuid[],
  linkedFactionIds: uuid[],
  linkedTimelineEventIds: uuid[],
  isPinned: boolean, isArchived: boolean,
  createdAt: timestamp, updatedAt: timestamp
}
```

Notes store **Markdown**, not structured JSON, because the shipped
`RichTextEditor` already produces Markdown and the existing `session_notes`
/ `sessions.summary` columns are already valid Markdown. `contentText` is
derived on save by running the body through the Markdown renderer and
taking the text content — indexed by Postgres FTS.

### NPC structured data
```typescript
NPCData {
  race: string | null, occupation: string | null, location: string | null,
  affiliation: string | null, relationshipToParty: string | null,
  status: "alive" | "dead" | "unknown" | "missing",
  firstSeen: string | null, lastSeen: string | null,
  secretInfo: string | null        // GM-only; stripped from party_shared payloads
}
```

### Quest structured data
```typescript
QuestData {
  status: "active" | "completed" | "failed" | "abandoned",
  giver: string | null, objective: string,
  reward: string | null, relatedNoteIds: uuid[]
}
```

### World
```typescript
World {
  id: uuid, userId: string, campaignId: uuid | null,
  name: string, tagline: string | null, system: string | null,
  tags: string[], isArchived: boolean
}
```

### WorldLocation
```typescript
WorldLocation {
  id: uuid, worldId: uuid, parentId: uuid | null,
  name: string, locationType: LocationTypeKey,
  summary: string | null,
  status: "active" | "ruined" | "unknown" | "destroyed" | "custom",
  customStatus: string | null, population: string | null,
  governingFactionId: uuid | null,
  linkedNoteIds: uuid[], linkedFactionIds: uuid[],
  sortOrder: float, tags: string[],
  visibility: "private" | "gm_visible" | "party_shared"
}

LocationTypeKey:
  "world" | "continent" | "sea" | "region" | "nation" |
  "city" | "town" | "village" | "outpost" |
  "district" | "building" | "dungeon" | "wilderness" |
  "plane" | "point_of_interest" | "custom"
```

### WorldMap + MapPin
```typescript
WorldMap {
  id: uuid, ownerId: uuid,         // WorldLocation.id or World.id
  ownerType: "world" | "location",
  label: string | null, imageKey: string,
  imageWidth: int, imageHeight: int
}
// Signed URL generated at render time; raw object URL never stored.
// Each World or WorldLocation has at most one active map.

MapPin {
  id: uuid, mapId: uuid,
  x: float, y: float,              // percentage of image dimensions (0–100)
  pinType: PinTypeKey,
  label: string | null, color: string | null, iconKey: string | null,
  linkedEntityType: "location" | "npc_note" | "faction" | "timeline_event" | "note" | null,
  linkedEntityId: uuid | null, sortOrder: int
}

PinTypeKey: "city" | "town" | "village" | "dungeon" | "wilderness"
          | "npc" | "faction" | "event" | "point_of_interest" | "custom"
```

### Faction
```typescript
Faction {
  id: uuid, worldId: uuid, name: string, summary: string | null,
  type: string | null, goals: string | null,
  secrets: string | null,          // GM-only; stripped server-side from party payloads
  status: "active" | "disbanded" | "unknown",
  memberNoteIds: uuid[],           // NPC-type Note records
  alliedFactionIds: uuid[], rivalFactionIds: uuid[],
  headquartersLocationId: uuid | null,
  linkedNoteIds: uuid[], tags: string[],
  visibility: "private" | "gm_visible" | "party_shared"
}
```

### TimelineEvent
```typescript
TimelineEvent {
  id: uuid, worldId: uuid, name: string, description: string,
  inWorldDate: string | null,      // freeform — e.g. "Year 1203, Month of Ice"
  era: string | null,              // grouping label
  realSessionId: uuid | null,      // linked campaign session (Feature 4)
  linkedLocationIds: uuid[],
  linkedNPCNoteIds: uuid[],        // NPC-type Notes
  linkedFactionIds: uuid[],
  linkedNoteIds: uuid[],
  sortOrder: float, tags: string[],
  visibility: "private" | "gm_visible" | "party_shared"
}
```

---

## Epics & User Stories

### Epic 1 — Worlds & Free-standing Notes

**US-101 — Create a world**
- Required: name. Optional: tagline, system label, campaign link, tags.
- Can exist without campaign link. Multiple worlds per user.
- World card shows name, tagline, linked campaign, location count, last updated.

**US-102 — Manage worlds**
- Edit name/tagline/system/tags. Archive hides from main list (recoverable).
- Delete: confirmation warns that all locations, maps, factions, and timeline
  events are deleted. Linked Notes are NOT deleted — only references cleared.

**US-103 — Create a note**
- Contexts: personal (no scope), campaign-level, world-level, location-level
  (implicit link to the location it was created from), or standalone within
  an existing parent note. Session-scope is already covered by the Campaign
  Notes Hub in Feature 6.
- Pick note type + scope + visibility on creation. Visibility defaults to
  `private` for both players and GMs — explicit action to share.
- Blank note opens immediately with cursor in title field. No wizard.
- Autosaved ~1s debounce; "Saved" / "Saving…" indicator.

**US-104 — Edit a note**
- Author can always edit. `party_shared` notes are read-only for non-authors.
- Autosave continuous; no manual save; "Last edited [time]" in note header.
- Offline: edits queued locally with "Pending sync"; synced on reconnect.

**US-105 — Delete a note**
- Soft-delete (`isArchived: true`) with 30-day recovery window.
- If the note has children: *"This note contains [n] sub-note(s). Deleting
  it will also delete all nested notes."*
- "Recently Deleted" section in settings.

**US-106 — Pin a note** — Toggle in note header menu. Pinned notes float to the top, separated by a divider. Max 5 pinned per context. Pin state is per-user.

**US-107 — Duplicate a note** — " (Copy)" suffix, same parent. Visibility reset to `private`. Opens in edit mode.

---

### Epic 2 — Rich Text & Cross-linking

> **Already built:** `components/notes/RichTextEditor.tsx` +
> `RichTextRenderer.{native,web}.tsx`. Markdown stored as plain text,
> persistent 5-button toolbar (bold, italic, H2, bullet list, quote).
> `react-markdown` + `remark-gfm` on web; `react-native-markdown-display`
> on native. This epic **extends** that surface — it does not replace it.

**US-201 — Extended formatting**
- Add: H1, H3, underline, strikethrough, inline code, numbered list,
  horizontal rule. Keep Markdown storage.
- Keyboard shortcuts on web (⌘B, ⌘I, etc.).
- Optional polish: floating toolbar on text selection; persistent strip stays as the fallback.

**US-202 — Plain-text extraction for search**
- On save, derive `contentText` by running `body` through the Markdown
  renderer and taking the text content. Strips syntax so FTS indexes words,
  not `**bold**`.
- Trigger: same autosave debounce that persists `body`.

**US-203 — Insert a ContentRef chip (`@`)**
- Typing `@` opens an inline search popover querying ContentResolver
  (spells, creatures, items, features).
- Select → inserts a styled chip with name + type icon (e.g. ⚡ Fireball).
- Chip stores `{ key, sourceId, contentType }` only — **never description text** (legal constraint).
- Tier-2 source unavailable → chip renders with "source unavailable" but doesn't break the note.

**US-204 — Insert a note link (`[[`)**
- `[[` opens a search popover over notes the current user can read.
- Inserts a chip linking to the target note. Taps/clicks navigate or open a side panel on desktop.
- **Backlinks:** linked note's header shows "Referenced by [n] note(s)" with a navigable list.
- Deleted target note → chip renders as "Note not found" broken link.

**US-205 — Insert a world-entity chip**
- Same popover pattern; scope toggle exposes locations, factions, timeline
  events, NPC notes.
- Inserting also updates the target entity's `linkedNoteIds` (bidirectional).

---

### Epic 3 — Hierarchy, Tags & Search

**US-301 — Nest notes into a hierarchy**
- Any note can be parent of another. No separate "folder" entity.
- "New Sub-note" in parent menu; "Move to…" action elsewhere.
- No enforced depth; deep trees handled with collapse + breadcrumb.
- Breadcrumb in note header shows full ancestry, clickable.

**US-302 — Reorder notes** — Drag-and-drop within parent or at root. Fractional `sortOrder` avoids renumbering.

**US-303 — Tag notes** — Freeform tags, inline entry with autocomplete against previously used tags. Clicking a tag opens a tag-filtered view of all accessible notes carrying it.

**US-304 — Navigate the location hierarchy**
- Sidebar tree for the active world; expand/collapse per level.
- Search input filters tree in real time by name.
- Locations draggable to a new parent (confirmation prompt).
- Fractional `sortOrder`; drag-to-reorder within level.

**US-305 — Full-text search**
- Postgres FTS over `contentText` on notes + structured
  descriptions/summaries on locations, factions, timeline events.
- Ranked results: title, snippet (match highlighted), type badge, scope,
  last updated.
- Debounced ~300ms, scoped to active campaign by default; toggle expands to
  all content the user can read.
- Offline search falls back to locally cached recent content.

**US-306 — Filter panel**
- Multi-select: note type, tags, visibility, campaign, session, world, location.
- Quick filters: "GM Notes" (own `private` + `gm_visible`, GM users only),
  "Shared with Party" (all `party_shared` the user can read),
  "Shared with Me" (player-authored `gm_visible`, GM users only).

---

### Epic 4 — Visibility & Party Sharing

Applies to every entity with a `visibility` field: `notes`, `world_locations`, `factions`, `timeline_events`.

**US-401 — Visibility model**
- `private` → author only.
- `gm_visible` → author + the campaign's GM.
- `party_shared` → all campaign members.
- Players can set their own entities to `private` or `gm_visible` only.
- Only the GM can mark anything `party_shared`.
- Entities outside a campaign context are always `private`.

**US-402 — Server-side enforcement**
- RLS SELECT policy = `author = auth.uid()` OR
  (`visibility = 'gm_visible'` AND `is_campaign_dm(campaign_id)`) OR
  (`visibility = 'party_shared'` AND `is_campaign_member(campaign_id)`).
- RLS UPDATE policy = author only. Raising to `party_shared` requires
  `is_campaign_dm`.
- Reuses existing security-definer helpers (`is_campaign_dm`, `is_campaign_member`).

**US-403 — GM shares to party**
- GM toggles visibility via entity header menu.
- On a live session, realtime notification pushes to connected players.
- Revertible — dropping back to `private` removes the entity from players' views immediately.
- When a location becomes `party_shared`, its map is visible to players in read-only mode.

**US-404 — Player shares to GM**
- Player flips a `private` note to `gm_visible`; appears in the GM's "Shared with Me" inbox with a notification.
- Other players cannot see these notes. Player can revoke by setting it back to `private`.

**US-405 — Secret-field stripping**
- `Faction.secrets` and NPC `structuredData.secretInfo` stripped server-side
  from any payload returned to a non-GM viewer, regardless of the parent
  entity's visibility setting.
- Implemented via a server-side view or RPC that omits the column for
  non-GM viewers — never rely on the frontend to hide.
- GM sees these fields with a lock icon in the UI.

**US-406 — Player View preview**
- GM toggle on world / location / note detail pages that renders exactly
  what a player would see after visibility + stripping is applied.

---

### Epic 5 — Locations & Maps

**US-501 — Create a location** — From the world tree or from within a parent location's detail page. Required: name, location type. Any level can be created without requiring all ancestors to exist first.

**US-502 — Location detail page**
- Sections: Overview (structured fields), Map, Linked Notes, NPCs Here,
  Factions Present, Sub-locations, Timeline Events.
- Structured fields inline-editable; autosave with the same debounce as notes.
- Section count badges when collapsed on mobile.

**US-503 — Delete a location** — Warns if it has sub-locations. Deletes location, sub-locations, and associated `MapPin` records. Linked Notes not deleted — only `linkedNoteIds` references cleared.

**US-504 — Upload a map image**
- Accepted: PNG, JPG, WEBP; max 20 MB.
- Uploaded to Supabase Storage (S3-compatible); signed URL generated at render time.
- Each world or location has at most one active map. Replacing prompts confirmation (pins retained but may need position adjustment).
- Image dimensions stored on `WorldMap` for coordinate normalization.

**US-505 — View and navigate a map**
- Pan (drag) and zoom (scroll wheel on web; pinch on mobile) inside a constrained container.
- Zoom 0.5× – 4×; can't pan/zoom beyond image edges.
- Viewport preserved when navigating away and returning.
- Double-tap → 2× zoom on mobile; "Reset View" button.
- Read-only for players with `party_shared` access.

**US-506 — Place a pin** *(GM only)*
- "Place Pin" toggle in the map toolbar.
- Clicking/tapping in pin mode places a new pin at that position.
- Placement panel: pin type, linked entity (optional, searchable), label (defaults to entity name), color.
- Saved as `MapPin` with `x`/`y` as percentages.
- Multiple pins can be placed without leaving pin mode.

**US-507 — Interact with a pin**
- Tap opens popover: label, pin type icon, linked entity name, action buttons (Open, Edit Pin, Delete Pin).
- "Open" navigates to linked entity detail in side panel or full navigation.
- If pin links to a sub-location with its own map: "View Sub-map" shortcut.
- Pins draggable to new positions while in pin mode.

**US-508 — Navigate nested maps** — "View Sub-map" when a pin links to a sub-location with a map. Breadcrumb: "World Map > Ashveil > Market District". Back preserves the parent map's viewport.

**US-509 — Replace or remove a map**
- Replace: new image, pins retained.
- Remove: deletes `WorldMap` and all associated `MapPin` records.
- Both require confirmation.

---

### Epic 6 — Factions

**US-601 — Create and manage a faction** — Required: name. Optional: type, summary, goals, headquarters location, allies, rivals, status, tags. `secrets` field stripped from `party_shared` payloads (see US-405). Linkable to locations and pinnable on maps.

**US-602 — Faction membership** — "Members" section on faction detail; add member via search scoped to `noteType: "npc"`. Member cards: NPC name, occupation, status badge; click → NPC note. An NPC can belong to multiple factions.

**US-603 — Faction relationships**
- "Allied Factions" and "Rival Factions" sections; added via search.
- Symmetric: adding B as ally of A also adds A as ally of B.
- Cannot be both ally and rival simultaneously.
- "Relationships" view shows factions as nodes with alliance/rivalry edges.
  v1: simplified static layout. v2: interactive force-directed graph.

---

### Epic 7 — Timeline

**US-701 — Create a timeline event** — Required: name. Optional: in-world date (freeform string — no calendar enforcement), era, description (rich text), linked locations/NPCs/factions/notes, real session link, tags.

**US-702 — View the timeline**
- Events in `sortOrder` as a vertical scrolling list; era separator between groups.
- Each event shows: name, in-world date, era badge, tags, linked entity counts.
- Expand → description + navigable entity links.
- Drag-to-reorder with fractional indexing. Filter by era, location, faction, tags.

**US-703 — Link a campaign session to an event**
- "Link to Session" searches ended campaign sessions (from Feature 4).
- Session date shown alongside in-world date on the event card.
- `party_shared` notes from the linked session suggested as candidate links.

---

### Epic 8 — Structured Note Types

**US-801 — NPC tracker**
- Structured fields per `NPCData` above. GM users also see "GM Only" secret info.
- Dedicated "NPCs" quick view (filtered list of `noteType: "npc"`).
- NPC notes linkable to factions (membership) and locations (residence / last seen).

**US-802 — Quest log**
- Structured fields per `QuestData`. Status badge on note cards.
- "Quests" quick view grouped by status.
- Quest notes linkable to NPC and Location notes via note links.

---

## Build Order (rough)

Sequenced so each step unblocks the next without half-built middleware:

1. `notes` table + RLS (generalizes the `session_notes` pattern to a first-class `notes` table with the full visibility model).
2. Free-standing note CRUD reusing the shipped `RichTextEditor`.
3. Tags + autocomplete; `contentText` extraction; Postgres FTS.
4. Nesting + drag-to-reorder (notes).
5. `world`, `world_locations` schema; tree UI + location detail page with Linked Notes section.
6. `@` ContentRef chip + `[[` note-link chip + backlinks.
7. `factions` + relationships; NPC membership rendering.
8. `timeline_events` + session linking.
9. Map upload + pan/zoom + pins + nested-map navigation. (Largest single chunk — image storage, gesture handling, percentage-coord math.)
10. Party View preview + full secret-field stripping audit across all surfaces.
