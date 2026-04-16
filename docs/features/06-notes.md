# Feature 6: Session Notes & Campaign Notes Hub

> Session-scoped note-taking and the DM-facing recap surface.
> Everything else that used to live here (the deep notes manager —
> creation, hierarchy, rich editor, search, visibility model,
> structured note types) was consolidated into
> [07-world-building.md](./07-world-building.md) since those features
> are tightly bound to the world-building knowledge graph.
>
> All content is user-generated. See [Legal Constraints](../legal.md).

**Status of this feature:** ✅ Shipped on `feature/campaign-notes-hub`. Covered below.

---

## What's in this file

- **Session Notes** — per-user private note row created on Start Session,
  written during play, unlocked to the campaign after End Session.
- **Campaign Notes Hub** — DM-only route (`/campaign/[id]/recap`) that
  aggregates per-session notes and lets the DM author the session recap
  after play wraps.

For free-standing campaign/world notes, rich-text `@content-ref` / `[[note-link]]` chips,
tagging, full-text search, the general visibility model, and structured NPC/Quest
note types → see **Feature 7 (world-building)**, Epics 1–4 and 8.

---

## Schema & RLS

Migrations that landed with this feature:

- `20260417000000_session_participants_notes_summary.sql` — adds
  `session_participants`, `session_notes`, and `sessions.summary`.
  RLS hides other users' `session_notes` until `sessions.ended_at`
  is set; then opens them to every campaign member.
- `20260418000000_dm_edit_own_notes_anytime.sql` — loosens the
  `session_notes` UPDATE policy so the campaign DM can always edit
  their own row (any session, any time). Players remain locked to
  `ended_at IS NULL`.

---

## User Stories (shipped)

### Session Notes (during play)

**US-601 — Pick participants on Start Session** — DM selects which campaign members are playing tonight; `session_participants` row created per user. Non-participants don't get a `session_notes` row.

**US-602 — Per-user notes during a live session** — Each participant (DM included) gets a private `session_notes` row scoped to `(session_id, user_id)`. Live, only author and GM can read it (RLS).

**US-603 — Cross-window pop-out for the notes editor** — Single-editor model via BroadcastChannel. The `/campaign/[id]/notes` pop-out and the inline rail stay in lockstep; the rail goes read-only while a pop-out is alive.

**US-604 — Session History card on campaign detail** — Lists ended sessions with recap + everyone's notes once `ended_at` flips. 440 px scroll cap; notes and recap rendered via `RichTextRenderer`. Refetches on screen focus.

### Campaign Notes Hub (post-session recap)

**US-801 — Aggregation view of per-session notes**
- DM-only route `/campaign/[id]/recap`. Reached via the compact `CampaignNotesCard` CTA on the campaign detail page.
- Collapsible session sidebar lists ended sessions newest-first with "Session N" labels (oldest = 1); live session pinned to the top with a Live pill.
- Main surface is a `react-mosaic-component` dock with three panels: Recap, Your Session Notes, Player Notes. Resizable, drag-to-rearrange, persist-per-device via `useRecapLayoutStore`.
- Each panel can be popped out into its own browser window; dock-side panel goes read-only with a banner while a pop-out is alive, then rehydrates/refetches when the pop-out closes. Presence coordination is BroadcastChannel-only.
- Native devices fall back to a stacked single-column layout.

**US-802 — Author the recap**
- `RichTextEditor` (Markdown) bound to a per-DM, per-session draft store (`useRecapDraftStore`, persisted to AsyncStorage). Autosaves the draft so the DM can come back later.
- The DM's own `session_notes` row is editable from the hub for any session, ever (driven by migration `20260418000000`).
- Player notes blocks are read-only references. DM copy-pastes anything they want to pull into the recap.

**US-803 — Publish to history**
- Publish button writes the recap to `sessions.summary`, clears the local draft, shows a persistent "Published hh:mm" pill until the DM types again.
- Republish allowed — last write wins, no version history.
- Parent hub state updates in the same render via an `onPublished` callback so the newly published recap surfaces immediately; `SessionHistoryCard` refetches on focus.

**US-804 — Live session signal**
- While a session is live, the hub shows it in the sidebar with a Live pill.
- RLS still hides other players' notes until End Session, so the Player Notes panel renders a locked notice. DM's own editor stays editable.

---

## Known follow-ups

- **Hub polish pass** — see `docs/build-status.md` Phase 5.1 for the shipped list (dark theme, flex-fill editors, Session N labels, publish-refresh + back-button fixes).
