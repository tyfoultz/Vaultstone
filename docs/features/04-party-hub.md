# Feature 4: Party Hub / Session Mode

> The real-time multiplayer layer. What may sync: character state, initiative, session notes, shared homebrew. What may NEVER sync: description text from user-uploaded sources. Party sync transmits references (`{ key, sourceId }`) not content text. See [Legal Constraints](../legal.md).

**Status:** Partially complete (Campaign CRUD done; session mode not started)

---

## Real-Time Sync Architecture

**Persistent layer (PostgreSQL + REST):** Campaign metadata, member rosters, session logs, notes, loot, homebrew config.

**Ephemeral layer (Supabase Realtime):** Live session state — initiative order, current turn, real-time HP changes, conditions, spell slots. Channel per session: `session:{session_id}`.

### Permitted Sync Payloads (whitelist)
```typescript
CharacterStateUpdate  { characterId, field, value }
InitiativeUpdate      { entries: InitiativeEntry[] }
TurnAdvance           { currentTurnIndex }
CombatantUpdate       { combatantId, field, value }
SessionNoteUpdate     { noteId, content, authorId }
LootUpdate            { lootId, item, quantity, assignedTo }
SharedHomebrewSync    { homebrewEntryId, data }    // user-authored only
VisibilityUpdate      { targetId, visibleToPlayers }

// NEVER permitted:
// Any description, rawText, or fullText from a Tier 2 source
// Any LocalContentEntry data or UserContentSource records
```

---

## Data Models

### Campaign / CampaignMember (see [Architecture](../architecture.md) for DB schema)
```typescript
Session {
  id: uuid, campaignId: uuid, name: string | null,
  startedAt: timestamp, endedAt: timestamp | null, summary: string | null
}

InitiativeEntry {
  id: uuid, sessionId: uuid, label: string,
  type: "player" | "npc" | "creature",
  characterId: uuid | null, initiativeRoll: int,
  currentHP: int | null, maxHP: int | null, ac: int | null,
  conditions: ConditionKey[], isVisible: boolean, sortOrder: int
}

SessionNote {
  id: uuid, sessionId: uuid, campaignId: uuid, authorId: string,
  visibility: "gm_only" | "all", title: string | null,
  content: string,              // rich text, user-authored
  linkedEntityRefs: ContentRef[],
  createdAt: timestamp, updatedAt: timestamp
}

LootEntry {
  id: uuid, sessionId: uuid, campaignId: uuid,
  itemRef: ContentRef | null, itemName: string,
  quantity: int, assignedToCharacterId: uuid | null,
  addedByUserId: string, notes: string | null
}
```

---

## Epics & User Stories

### Epic 1 — Campaign Management

**US-101 — Create a campaign** ✅ Complete
- "New Campaign" from home screen; name required, system label and description optional
- GM role auto-assigned; join code generated; campaign appears in list immediately

**US-102 — Invite players to a campaign** 🟡 In Progress
- Join code displayed on campaign detail with copy-to-clipboard; DM can regenerate (old code immediately invalidated)
- **Deferred (post-MVP):** Email invite (requires Edge Function + email provider), 7-day expiry, max player count

**US-103 — Join a campaign** ✅ Complete
- 6-char code lookup via security-definer RPC; `campaign_members` row inserted; campaign appears in player's list
- **Deferred:** Character linking prompt post-join (wires in after character builder is complete), GM notification on join

**US-104 — Manage campaign members** ✅ Complete (MVP scope)
- Campaign detail shows member list with display name and role badge
- DM can remove any player (immediate access revocation)
- Players can leave voluntarily
- **Deferred:** Campaign archive, co-GM promotion UI

**US-105 — Link a character to a campaign** ✅ Complete
- Character picker modal on campaign detail; players link/swap/unlink characters from their roster
- Linked character name + class/level shown in party roster for all members
- DM and players can tap linked character name to navigate to character sheet

---

### Epic 2 — Session Lifecycle

**US-201 — Start a session** *(GM only)*
- Creates `Session` record, opens Supabase Realtime channel keyed to `session:{session_id}`
- Online members notified; GM taken to Session View immediately
- One active session per campaign at a time

**US-202 — Join an active session**
- "Rejoin Session" banner on campaign dashboard if session in progress
- Late joiners receive full current state snapshot on connect
- Presence indicator shows which members are connected

**US-203 — End a session** *(GM only)*
- On end: ephemeral state snapshotted to DB, `Session.endedAt` set, channel closed
- All clients notified; returned to campaign dashboard
- HP/condition/slot changes persisted to character records
- GM prompted to add optional session summary

**US-204 — View session history**
- Campaign dashboard: "Session History" section listing past sessions
- Each session: name/date/duration/GM summary
- Expanding shows notes (visibility rules apply), loot log, participating characters
- Read-only

---

### Epic 3 — Party Dashboard

**US-301 — View live party overview**
- Each party member card: character name, class + level, species, current HP / max HP (bar + numeric), active conditions (badges), presence indicator
- Spell slot summary for spellcasting characters
- Class resource summaries as pip trackers
- All values update in real time
- Cards ordered by initiative if combat active, else alphabetically

**US-302 — Players update their own state from session view**
- Tapping own card opens inline state editor (not full character sheet)
- Controls: HP adjust, temp HP, condition toggles, spell slot pips, class resource pips
- Changes broadcast immediately + persist to character server-side
- Players cannot edit other players' cards

**US-303 — GM updates any party member's state**
- GM can tap any party member's card to open inline state editor
- External change shows "Updated by GM" indicator for 3 seconds on receiving player's card
- GM cannot edit equipment, level, spell selection — only session-state fields (HP, conditions, slots, resources)

---

### Epic 4 — Initiative & Combat Tracker

**US-401 — Set up initiative**
- "Start Combat" opens Initiative Tracker panel
- Player characters pre-populated from linked characters
- GM adds NPCs/creatures by name (optionally linked to `ContentRef` from bestiary)
- Each entry has initiative roll input; players can roll their own if GM enables it
- Auto-sorts descending; ties broken by DEX modifier, then manually
- Full sorted list visible to all members once GM confirms

**US-402 — Advance turns**
- "Next Turn" button advances to next combatant; active turn highlighted for all clients
- Round counter increments when order wraps
- Players notified when it becomes their character's turn
- GM can manually set active turn to any position

**US-403 — Track combatant state**
- Each entry shows: name, initiative roll, current HP / max HP, AC, condition badges
- GM can inline-edit HP and toggle conditions per entry
- Player character entries pull live character state
- NPC entries hidden from players by default
- Death saves activate for player characters at 0 HP

**US-404 — Add and remove combatants mid-combat**
- "Add Combatant" during active combat; placed at any initiative value
- Removing a combatant collapses them (retained in session log, not permanently deleted)
- "End Combat" when all non-player combatants removed or GM ends it; clears initiative order

**US-405 — Persist combat log**
- HP changes, turn advances, conditions, combatant additions/removals appended as `SessionEvent` records
- Log visible in session history
- Format: `[22:14] Firbolg Warrior took 12 damage. HP: 31 → 19`
- Append-only, not editable

---

### Epic 5 — Session Notes & Loot

**US-501 — GM session notes**
- Notes panel in Session View (GM only)
- `gm_only` (default) or `all` visibility; `gm_only` notes never transmitted to player clients (server-enforced)
- `all` notes visible to all connected members in real time
- Rich text; multiple notes per session; persisted to `SessionNote` table

**US-502 — Player session notes**
- Personal Notes panel in Session View
- Player notes visible only to the player and GM
- Players cannot see each other's notes
- Session notes shared underlying data model with Feature 6 Notes Manager

**US-503 — Shared loot tracker**
- Loot panel visible to all party members
- GM (and optionally players) can add: item name or ContentRef, quantity, optional notes
- Each entry assignable to a specific character; unassigned items in "Party Pool"
- Assigned items optionally added to character's equipment list with one tap
- Persists in session history

---

### Epic 6 — GM Visibility Controls

**US-601 — Control NPC and creature visibility**
- Each non-player `InitiativeEntry` has `isVisible` toggle (GM only)
- Hidden entries not transmitted to player clients in WebSocket payloads
- When revealed, appears in players' initiative tracker immediately
- Hidden entries shown to GM with eye-slash icon

**US-602 — Control character stat visibility**
- Campaign settings: toggles for show HP / conditions / spell slots / class resources to all players
- Each player always sees their own full card regardless of settings
- GM always sees full detail for all members

**US-603 — Reveal information selectively**
- GM can share any GM-only note by changing visibility to `all`
- GM can push a creature's stat block (SRD or homebrew only — never Tier 2) to all players as a reference card
- Pushed stat blocks appear as pop-up or pinned card; GM can dismiss from all players' views

---

## Suggested Build Order
1. Supabase Realtime setup — channel management keyed to `sessionId`, connection lifecycle
2. `ContentSyncFilter` middleware — whitelist enforcement on all outbound WS payloads
3. Campaign CRUD (US-101 → US-104)
4. Character-to-campaign linking (US-105)
5. Session lifecycle: start, join, end, history (US-201 → US-204)
6. Party Dashboard: real-time state broadcast and display (US-301 → US-303)
7. Initiative Tracker: setup, turn advance, combatant state, add/remove (US-401 → US-405)
8. Session Notes: GM private and shared, player notes (US-501 → US-502)
9. Loot tracker (US-503)
10. GM visibility controls (US-601 → US-603)
11. Offline / reconnection resilience — late-join state snapshot, disconnect/reconnect handling
