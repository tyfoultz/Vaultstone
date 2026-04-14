# Feature 7: World Building Toolkit

> GM workspace for building and managing campaign worlds — locations, maps, factions, NPCs, and timeline. All world-building content is user-generated and may be stored and synced server-side. Integrates with Feature 6 (Notes), Feature 4 (Sessions), and Feature 3 (Homebrew). See [Legal Constraints](../legal.md).

**Status:** Post-MVP

---

## Key Design Principles
- **System-agnostic.** No D&D-specific concepts. Works for any TTRPG setting.
- **Hierarchy is flexible.** Locations nest arbitrarily: world → continent → region → city → district → building → room. No enforced depth.
- **Maps are optional overlays.** Any level of the location hierarchy can have a map. Maps don't replace the hierarchy.
- **Pins use percentage coordinates.** `x` and `y` stored as percentages (0–100) of image dimensions — accurate at any zoom or resolution.
- **Notes are the narrative layer.** Locations and factions have structured fields for mechanics; all prose lives in linked notes from Feature 6.

---

## Data Models

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
  summary: string | null, status: "active"|"ruined"|"unknown"|"destroyed"|"custom",
  customStatus: string | null, population: string | null,
  governingFactionId: uuid | null,
  linkedNoteIds: uuid[], linkedFactionIds: uuid[],
  sortOrder: float, tags: string[]
}

LocationTypeKey:
  "world" | "continent" | "sea" | "region" | "nation" |
  "city" | "town" | "village" | "outpost" |
  "district" | "building" | "dungeon" | "wilderness" |
  "plane" | "point_of_interest" | "custom"
```

### WorldMap
```typescript
WorldMap {
  id: uuid, ownerId: uuid,        // WorldLocation.id or World.id
  ownerType: "world" | "location",
  label: string | null, imageKey: string,
  imageWidth: int, imageHeight: int
}
// Signed URL generated at render time from imageKey — raw object URL never stored.
// Each World or WorldLocation may have at most one active map.
```

### MapPin
```typescript
MapPin {
  id: uuid, mapId: uuid,
  x: float,   // percentage of image width (0.0–100.0)
  y: float,   // percentage of image height (0.0–100.0)
  pinType: PinTypeKey, label: string | null, color: string | null, iconKey: string | null,
  linkedEntityType: "location"|"npc_note"|"faction"|"timeline_event"|"note" | null,
  linkedEntityId: uuid | null, sortOrder: int
}

PinTypeKey: "city"|"town"|"village"|"dungeon"|"wilderness"|"npc"|"faction"|"event"|"point_of_interest"|"custom"
```

### Faction
```typescript
Faction {
  id: uuid, worldId: uuid, name: string, summary: string | null,
  type: string | null, goals: string | null,
  secrets: string | null,        // GM-only; never transmitted to players
  status: "active" | "disbanded" | "unknown",
  memberNoteIds: uuid[],         // NPC-type Note records
  alliedFactionIds: uuid[], rivalFactionIds: uuid[],
  headquartersLocationId: uuid | null,
  linkedNoteIds: uuid[], tags: string[]
}
```

### TimelineEvent
```typescript
TimelineEvent {
  id: uuid, worldId: uuid, name: string, description: string,
  inWorldDate: string | null,    // freeform — e.g. "Year 1203, Month of Ice"
  era: string | null,            // grouping label
  realSessionId: uuid | null,    // linked campaign session from Feature 4
  linkedLocationIds: uuid[],
  linkedNPCNoteIds: uuid[],      // NPC-type Notes
  linkedFactionIds: uuid[],
  linkedNoteIds: uuid[],
  sortOrder: float, tags: string[]
}
```

---

## Epics & User Stories

### Epic 1 — World Management

**US-101 — Create a world** — Name required; tagline, system label, campaign link, tags optional. Can exist without campaign link. Multiple worlds per user. World card shows name, tagline, linked campaign, location count, last updated.

**US-102 — Manage worlds** — Edit name/tagline/system/tags. Archive hides from main list (recoverable). Delete requires confirmation and warns all locations, maps, factions, and timeline events will be deleted. Linked Notes are NOT deleted — only references are removed.

---

### Epic 2 — Location Hierarchy

**US-201 — Create a location** — From world's tree view or from within an existing location's detail page. Required: name, location type. Locations can be created at any level without requiring parent levels to exist first.

**US-202 — Navigate the location hierarchy**
- Sidebar with full location tree; expandable/collapsible at each level
- Search input filters tree in real time by name
- Locations can be dragged to a new parent within the tree (re-parenting with confirmation)
- Fractional indexing for sort order; drag-to-reorder within level

**US-203 — View and edit a location's detail page**
- Sections: Overview (structured fields), Map, Linked Notes, NPCs Here, Factions Present, Sub-locations, Timeline Events
- Structured fields inline-editable; autosave with same debounce as Feature 6
- Section count badges when collapsed on mobile

**US-204 — Delete a location** — Warns if has sub-locations. Deletes location, sub-locations, and associated MapPin records. Linked Notes not deleted — only `linkedNoteIds` references cleared.

---

### Epic 3 — World Map

**US-301 — Upload a map image**
- Accepted: PNG, JPG, WEBP; maximum 20MB
- Uploaded to server-side object store (S3-compatible); signed URL generated at render time
- Each world or location has at most one active map; replacing prompts confirmation (pins retained but may need position adjustment)
- Original dimensions stored on `WorldMap` for coordinate normalization

**US-302 — View and navigate a map**
- Pan (drag) and zoom (scroll wheel on web; pinch on mobile) within a constrained container
- Zoom range: 0.5× to 4×; cannot pan or zoom beyond image edges
- Viewport position preserved when navigating away and returning
- Double-tap to zoom to 2× on mobile; "Reset View" button
- Read-only for players who have access via `party_shared` world

**US-303 — Place a pin on the map** *(GM only)*
- "Place Pin" mode toggle in map toolbar
- Clicking/tapping in pin-placement mode places new pin at that position
- Placement panel: pin type, linked entity (optional, searchable), label (defaults to entity name), color
- Saved as `MapPin` with `x` and `y` as percentages of image dimensions
- Multiple pins can be placed without leaving pin-placement mode

**US-304 — Interact with a pin**
- Tapping a pin opens popover: label, pin type icon, linked entity name, action buttons (Open, Edit Pin, Delete Pin)
- "Open" navigates to linked entity detail in side panel or full navigation
- If pin links to sub-location with its own map: "View Sub-map" shortcut
- Pins can be dragged to new positions while in pin-placement mode

**US-305 — Navigate between nested maps**
- "View Sub-map" option when pin links to sub-location with a map
- Breadcrumb trail: "World Map > Ashveil > Market District"
- Navigating back preserves parent map's viewport position

**US-306 — Replace or remove a map**
- "Replace Map": new image, all existing pins retained
- "Remove Map": deletes `WorldMap` and all associated `MapPin` records
- Both require confirmation; removal returns Map section to empty state

---

### Epic 4 — Notes Manager Integration

**US-401 — Link a note to a location**
- From the note: "Link to Location" field opens location search popover
- From the location: "Linked Notes" section has "Add Note" button
- Bidirectional: `Note.linkedLocationIds` and `WorldLocation.linkedNoteIds` both updated
- A note can link to multiple locations; a location can have many notes
- Visibility rules from Feature 6 apply to linked notes display

**US-402 — Link a note to a faction** — Same bidirectional pattern. NPC-type notes linked to a faction also appear in the faction's "Members" section.

**US-403 — Link a note to a timeline event** — Same bidirectional pattern. Session log notes can link to timeline events connecting real sessions to in-world history.

**US-404 — View world entity links from the Notes Manager**
- Notes linked to world entities show a "World Links" section in note header: each linked location (with world breadcrumb), faction, and timeline event
- Each entry is navigable; removing a link updates both sides of the bidirectional relationship

---

### Epic 5 — Faction Tracker

**US-501 — Create and manage a faction**
- Required: name. Optional: type, summary, goals, headquarters location, allies, rivals, status, tags
- "Secrets" field — stripped server-side from any `party_shared` payload
- Linkable to locations and pinnable on maps

**US-502 — Manage faction membership**
- "Members" section on faction detail; add member via search scoped to `noteType: "npc"` notes
- Member cards: NPC name, occupation, status badge; clicking navigates to NPC note
- An NPC can be a member of multiple factions

**US-503 — Track faction relationships**
- "Allied Factions" and "Rival Factions" sections; added by search
- Relationships are symmetric: adding B as ally of A also adds A to B's ally list
- Cannot be both ally and rival simultaneously
- Faction list includes optional "Relationships" view showing factions as nodes with alliance/rivalry edges (v1: simplified static layout; v2: interactive force-directed graph)

---

### Epic 6 — Timeline

**US-601 — Create a timeline event** — Required: name. Optional: in-world date (freeform string — no calendar system enforcement), era, description (rich text), linked locations/NPCs/factions/notes, real session link, tags.

**US-602 — View the timeline**
- Events in `sortOrder` sequence as a vertical scrolling list; era separator between groups
- Each event: name, in-world date, era badge, tags, linked entity counts
- Expanding shows description and navigable links to linked entities
- Drag-to-reorder with fractional indexing; filter by era, location, faction, tags

**US-603 — Link a campaign session to a timeline event**
- "Link to Session" field searches completed campaign sessions (from Feature 4)
- Session date shown alongside in-world date on event card
- `party_shared` notes from the linked session suggested as candidate notes to link

---

### Epic 7 — Sharing & Party Visibility

**US-701 — Share world content with the party**
- Individual locations, factions, and timeline events have `gm_only` (default) or `party_shared` toggle
- When a location is `party_shared`, its map is also visible to players in read-only mode
- Pins on a shared map visible to players only if the pin's linked entity is also `party_shared`
- Faction `secrets` fields always stripped from party-facing responses regardless of visibility setting
- "Player View" preview toggle in world detail shows exactly what players will see

**US-702 — Party view of world content**
- Players access shared world content from "World" section in campaign view
- Location hierarchy tree shows only `party_shared` nodes — doesn't reveal existence of hidden parent/sibling nodes
- Players can view shared maps, pan/zoom, and tap visible pins
- Players cannot create, edit, pin, or delete world-building content

---

## Suggested Build Order
1. `World`, `WorldLocation`, `Faction`, `TimelineEvent` schemas + CRUD REST API
2. World and location hierarchy tree UI — expandable sidebar, breadcrumb navigation
3. Location detail page layout with section panels
4. Faction CRUD — create, membership, relationships
5. Timeline CRUD — create, sort, era grouping
6. Notes Manager bidirectional linking — `linkedLocationIds`, `linkedFactionIds`, `linkedTimelineEventIds`
7. `WorldMap` upload — image storage, signed URL generation, map render with pan/zoom
8. `MapPin` placement — pin-placement mode, percentage coordinate storage, pin CRUD
9. Nested map navigation with breadcrumb trail
10. Map replace/remove
11. Session-to-timeline linking
12. Party visibility controls — `party_shared` toggling, server-side field stripping, Player View preview
