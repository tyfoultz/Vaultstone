# Feature 6: Notes Manager

> Primary long-form writing surface for players and GMs. All content is user-generated and may be stored and synced server-side. Notes may link to content entries via `ContentRef` but must never embed description text from Tier 2 sources. See [Legal Constraints](../legal.md).

**Status:** Post-MVP

---

## Visibility Model

Every note has a `visibility` field — enforced server-side on every read, not just in the frontend.

```
"private"       → visible to the author only
"gm_visible"    → visible to the author + the campaign GM
"party_shared"  → visible to all campaign members
```

Additional rules:
- GM can write notes with any visibility level
- Players can write `private` or `gm_visible` notes only — cannot set their own to `party_shared`
- GM can promote a player's `gm_visible` note to `party_shared` (player notified)
- `party_shared` notes readable by all campaign members, editable only by the author
- Notes outside a campaign context are always `private`
- Visibility filter applied on every note fetch based on requesting user's role

---

## Data Models

### Note
```typescript
Note {
  id: uuid, authorId: string,
  campaignId: uuid | null,         // null = personal note
  sessionId: uuid | null,          // set for notes from Feature 4 session mode
  parentId: uuid | null,           // null = root-level note
  sortOrder: float,                // fractional indexing for reorder
  title: string,
  content: string,                 // rich text as JSON (editor-native format)
  contentText: string,             // plain-text extraction for FTS
  visibility: "private" | "gm_visible" | "party_shared",
  noteType: "general" | "npc" | "quest" | "session_log" | "location" | "lore",
  structuredData: json | null,     // populated for npc/quest types
  tags: string[],
  contentRefs: ContentRef[],       // links to spells, creatures, items by key
  isPinned: boolean,
  isArchived: boolean,
  createdAt: timestamp, updatedAt: timestamp
}
```

### NPC Structured Data
```typescript
NPCData {
  race: string | null, occupation: string | null, location: string | null,
  affiliation: string | null, relationshipToParty: string | null,
  status: "alive" | "dead" | "unknown" | "missing",
  firstSeen: string | null, lastSeen: string | null,
  secretInfo: string | null  // GM-only; stripped from party_shared payloads
}
```

### Quest Structured Data
```typescript
QuestData {
  status: "active" | "completed" | "failed" | "abandoned",
  giver: string | null, objective: string,
  reward: string | null, relatedNoteIds: uuid[]
}
```

---

## Epics & User Stories

### Epic 1 — Note Creation & Management

**US-101 — Create a note**
- Contexts: personal, campaign-level, session-level (auto-scoped to `sessionId` when session active)
- Select note type + campaign scope + initial visibility on creation
- Visibility defaults: `private` for players and GMs (explicit action to share)
- Blank note opens immediately with cursor in title field — no creation wizard
- Autosaved with ~1s debounce; "Saved" / "Saving..." indicator

**US-102 — Edit a note**
- All notes the user authored are editable; `party_shared` notes are read-only for non-authors
- Autosave continuous; no manual "Save" button; "Last edited [time]" in note header
- Offline: edits queued locally with "Pending sync" indicator; synced on connectivity restore

**US-103 — Delete a note**
- If note has children: *"This note contains [n] sub-note(s). Deleting it will also delete all nested notes."*
- Soft-delete (`isArchived: true`) for 30-day recovery window before permanent deletion
- "Recently Deleted" section in settings for recovery

**US-104 — Pin a note** — Toggle in note header menu. Pinned notes appear at top, separated by divider. Max 5 pinned per campaign context. Pinned state is per-user.

**US-105 — Duplicate a note** — Copy with " (Copy)" appended, same parent. Visibility reset to `private`. Opens in edit mode.

---

### Epic 2 — Rich Text Editor

**US-201 — Format note content**
- Supported: H1, H2, H3, paragraph, bold, italic, underline, strikethrough, inline code, blockquote, bullet list, numbered list, horizontal rule
- Floating toolbar on text selection + keyboard shortcuts
- Content stored as portable JSON (e.g., ProseMirror/Tiptap JSON) — not raw HTML
- `contentText` plain-text extraction generated on every save for search indexing
- Floating toolbar adapted for touch on mobile

**US-202 — Insert a content reference link**
- Typing `@` opens inline search popover querying ContentResolver (spells, creatures, items, features)
- Inserts styled chip with content name and type icon (e.g., ⚡ Fireball)
- Chip links to spell or creature detail view without navigating away from note
- Stores only `{ key, sourceId, contentType }` — no description text in the note
- Tier 2 source unavailable: chip renders with "source unavailable" indicator but doesn't break the note

**US-203 — Insert a note link**
- Typing `[[` opens inline search popover querying user's accessible notes by title
- Note link chip navigates to linked note or opens in side panel (desktop)
- Backlinks: linked note header shows "Referenced by [n] note(s)"
- Deleted note: chip renders as "Note not found" broken link

**US-204 — Use note templates**
- Structured types (NPC, Quest, Location, Lore) pre-populate with template: structured field section + suggested heading prompts
- Templates are hardcoded per note type in v1 — not user-editable
- Template content is inert starter text; deleting it has no consequences

---

### Epic 3 — Hierarchy & Organization

**US-301 — Nest notes into a hierarchy**
- Any note can be parent of another; no separate "folder" entity — notes act as containers
- "New Sub-note" option in parent note's menu
- Existing notes can be moved via drag-and-drop in sidebar or "Move to..." action
- No enforced depth limit; deep trees handled with collapse + breadcrumb navigation
- Breadcrumb in note header shows full ancestry, clickable

**US-302 — Reorder notes**
- Drag-and-drop within same parent or at root level
- Fractional indexing (`sortOrder: float`) avoids renumbering on every move
- Default sort (alphabetical or by creation date) can be applied temporarily without persisting

**US-303 — Tag notes**
- Freeform text tags; inline entry in note header area; autocomplete suggests previously used tags
- Clicking a tag anywhere opens tag-filtered view showing all accessible notes with that tag
- Tags not shared between users — visible to readers of `party_shared` notes but managed by author

---

### Epic 4 — Search & Filtering

**US-401 — Full-text search**
- Queries `contentText` field across all notes the user has read access to
- Ranked results: title, snippet with match highlighted, type badge, scope, last updated
- Debounced ~300ms; scoped to active campaign by default; toggle to expand to all notes
- Offline search works against local cache for recently accessed content

**US-402 — Filter notes**
- Filter panel: note type (multi-select), tags, visibility, campaign scope, session
- "GM Notes" quick filter: all `private` + `gm_visible` authored by GM (GM users only)
- "Shared with Party" quick filter: all `party_shared` visible to current user

---

### Epic 5 — GM vs Player Visibility

**US-501 — GM-only notes view**
- GM's notes panel: "My Notes" (private + gm_visible) and "Shared Notes" (party_shared) top-level toggle
- `private` and `gm_visible` notes never transmitted to player clients — enforced at API layer
- GM can see player's `gm_visible` notes in "Shared with Me" section
- Note's current visibility always shown in note header

**US-502 — Share a note with the party**
- GM changes visibility to `party_shared` via note header menu
- Real-time notification to connected party members (if active session via Feature 4 WebSocket)
- Players receive read-only view; GM can revert to `private` at any time (disappears from players' shared views immediately)

**US-503 — Player shares a note with GM**
- Players set notes to `gm_visible`; appears in GM's "Shared with Me" inbox
- GM notified in-app; other players cannot see these notes
- Player can revoke by changing back to `private`

**US-504 — NPC secret fields stripped for player-facing views**
- NPC-type `secretInfo` field stripped server-side when note is included in `party_shared` responses
- GM sees it with a lock icon; NPC note can be `party_shared` while GM retains hidden secret info in same note

---

### Epic 6 — Structured Note Types

**US-601 — NPC tracker** — Structured fields: name (note title), race/species, occupation, location, affiliation, relationship to party, status (Alive/Dead/Unknown/Missing), first/last seen. GM users also see "GM Only" secret info field. Dedicated "NPCs" quick view (filtered list of `noteType: "npc"`).

**US-602 — Quest log** — Fields: quest name, status (Active/Completed/Failed/Abandoned), quest giver, objective, reward. Status badge on note cards. "Quests" quick view by status. Quest notes linkable to NPC and Location notes via note link system.

**US-603 — Session log** — Notes created during active session are auto-typed as `session_log` and scoped to `sessionId`. Appear in both Notes Manager ("Sessions" section) and Feature 4 session history. GM can write/edit session summary in session log note post-session. Visibility rules apply.

---

### Epic 7 — Session Integration

**US-701 — Access session notes from Notes Manager**
- "Sessions" section in sidebar listing all campaigns and their sessions chronologically
- Selecting a session shows all notes from that session (visibility rules applied)
- Notes can be moved out of session context via "Move to..." action

**US-702 — Create a note from active session view**
- Notes panel in Feature 4 Session View is a lightweight embedded Notes Manager scoped to active session
- Notes created here are full `Note` records with `sessionId` set; immediately accessible in Notes Manager after session
- Full rich text editor and ContentRef linking supported in embedded view

---

## Suggested Build Order
1. `Note` data model, PostgreSQL schema, FTS index (`tsvector` on `contentText`)
2. Visibility enforcement middleware — `getNotes(userId, campaignId, requestingRole)` applies visibility filter server-side
3. Note CRUD REST API
4. Rich text editor integration — select library, implement editor + formatting toolbar
5. Note list + sidebar with hierarchy tree rendering
6. Autosave with debounce and sync status indicator
7. Note creation flow with type selection and template pre-population
8. Pin, duplicate, delete with soft-delete recovery
9. Tag system — inline entry, autocomplete, tag-filtered view
10. Full-text search and filter panel
11. Content ref inline linking via `@` trigger
12. Note-to-note linking via `[[` trigger with backlink tracking
13. Visibility controls — share to party, share to GM, NPC secret field stripping
14. Structured NPC and Quest note types with dedicated quick views
15. Session log integration
16. Drag-to-reorder with fractional indexing
17. Offline edit queue and sync
