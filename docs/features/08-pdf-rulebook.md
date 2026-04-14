# Feature 8: Campaign System Card — Local PDF Rulebook

> Allows a DM to declare the rulebook their campaign uses and for each user to upload their own local PDF copy for in-app reading. **This is a hard legal requirement — not a design choice.** PDFs are stored on-device only and are NEVER transmitted to Supabase or shared with other users. See [Legal Constraints](../legal.md).

---

## Legal Requirements
- PDF files are **never** transmitted to Supabase Storage or any third-party server
- PDF files are **never** shared between users — each person uploads their own copy
- A Terms of Service acknowledgment gate is required before every upload
- The campaign stores only a **metadata label** server-side — no file content
- SRD 5.1 / SRD 2.0 content bundled in the app requires CC-BY 4.0 attribution display
- A notice must be visible to players: *"This campaign uses [X]. Each player must upload their own legally-obtained copy."*

---

## Architecture

**What is stored server-side (Supabase):**
- `campaigns.content_sources` (JSONB) — declares which rulebook the campaign uses (label + source key only)
- Example: `{ "label": "D&D Player's Handbook 2024", "key": "phb_2024" }`

**What is stored on-device only:**
- The actual PDF file — saved to `expo-file-system` document directory (native) or IndexedDB (web)
- Local SQLite record: `{ id, campaign_id, source_key, local_file_path, file_name, uploaded_at }`

**ContentResolver integration:**
- Uploaded PDFs feed into Tier 2 of the existing ContentResolver architecture
- Phase 5 (indexing) wires this into FTS5 SQLite search — deferred to Feature 3 build

---

## DB Migration

```sql
alter table campaigns
  add column if not exists content_sources jsonb default null;
```

## Local SQLite Schema

```sql
create table if not exists user_content_sources (
  id          text primary key,
  campaign_id text not null,
  source_key  text not null,
  file_name   text not null,
  file_path   text not null,
  uploaded_at text not null
);
```

---

## Build Phases

### Phase 1 — Campaign Source Metadata ✅ Done (2026-04-14)
*Server-side declaration of which rulebook the campaign uses. No file involved.*
- `content_sources jsonb` column added to `campaigns` table via migration
- System Card UI: DM picks from preset list (SRD 5.1, SRD 2.0, Custom) or types freeform title
- Preset source keys: `srd_5_1`, `srd_2_0`, `custom`
- Selected source saved to `campaigns.content_sources`
- Players see the declared source label on campaign detail
- CC-BY badge shown for open-licensed sources

**Deliverables (merged 2026-04-14):**
- `supabase/migrations/20260413000001_campaign_content_sources.sql`
- `packages/types/src/database.types.ts` — `content_sources: Json | null` on campaigns
- `packages/api/src/campaigns.ts` — `updateCampaignContentSource()`
- `app/campaign/[id]/index.tsx` — System Card preset radio picker, CC-BY badge, Rulebook nav button
- `app/campaign/[id]/rulebook.tsx` — stub page with empty-state placeholder and legal notice

**Deliverables (2026-04-14):**
- `packages/content/src/local/db.ts` — expo-sqlite helpers for `user_content_sources` (open, create table, get/save/delete)
- `app/campaign/[id]/rulebook.tsx` — full upload flow: document picker → ToS modal → copy to FileSystem → SQLite record; shows uploaded state with Read/Remove actions
- `app/campaign/[id]/pdf-viewer.tsx` — full-screen viewer: `react-native-pdf` on native, `<iframe>` blob URL on web
- New packages: `expo-document-picker`, `react-native-pdf`, `react-native-blob-util`

### Phase 2 — Local PDF Upload ✅ Done (2026-04-14)
*Each user uploads their own copy. File stays on device.*
- File picker via `expo-document-picker` (PDF filter only)
- On selection: ToS acknowledgment modal must be accepted before proceeding
  - Modal text: *"By uploading this file, you confirm that you own or have a lawful license to this material. Vaultstone does not receive or store this file — it remains on your device only."*
- On confirm: copy file to `expo-file-system` document directory
  - Native path: `FileSystem.documentDirectory/vaultstone/sources/<campaign_id>/<filename>.pdf`
  - Web: store as IndexedDB blob, generate an object URL for viewing
- Write local SQLite record
- System Card shows upload status: "Not uploaded" / "Uploaded ✓ — filename.pdf"
- **New packages required:** `npx expo install expo-document-picker`

### Phase 3 — In-App PDF Viewer ✅ Done (2026-04-14)
*Full-screen reader accessible from System Card.*
- Native: `react-native-pdf` package — renders local file path
- Web: `<iframe src={objectURL}>` using blob URL created from IndexedDB entry
- Full-screen with back navigation
- "Read" button accessible only if user has uploaded their own copy
- **New packages required:** `npx expo install react-native-pdf`

### Phase 4 — Player-Facing Source Prompt ✅ Done (2026-04-14)
*Tells players which book the campaign uses and prompts them to upload their own copy.*
- Campaign detail System Card shows for all members:
  - DM-declared source label
  - If current user has uploaded a matching copy: "Uploaded ✓ — [Read]"
  - If not: "Upload your own copy to read it in-app"
- Upload flow (Phase 2) accessible from this prompt
- Stub page built at `/campaign/[id]/rulebook`; upload UI and Read button pending Phases 2–3

### Phase 5 — Content Indexing ⬜ Deferred (Feature 3 scope)
*FTS5 full-text indexing of PDF content for in-app search and ContentResolver Tier 2 queries.*
- After upload, parse PDF text on-device and index into SQLite FTS5 table
- ContentResolver routes Tier 2 queries (source key = uploaded file) to local SQLite
- Only content keys ever sync to server — descriptions resolve locally at render time
- **Do not build here. Wire up stub interface only.**

---

## System Card UI

**Before (current):**
```
[ System Card ]
  Game System
  D&D 5e
  [Manage System] (DM only)
```

**After (target):**
```
[ System Card ]
  Game System
  D&D Player's Handbook 2024

  Rulebook
  ✓ PHB_2024.pdf  [Read]          ← if uploaded
  [Upload Your Copy]               ← if not uploaded

  ℹ Each player must upload their
    own legally-obtained copy.
```

---

## Out of Scope
- Sharing a PDF between users (copyright violation)
- Storing PDFs in Supabase Storage
- Publisher content licensing agreements (future business development)
- FTS5 content indexing (Feature 3 scope)
- Automatic detection of which rulebook was uploaded
