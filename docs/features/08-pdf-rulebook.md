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

### Phase 5a — Indexing Scaffold ✅ Done (2026-04-14)
*On-device search framework. No PDF text extraction yet — parsing plugs in separately.*

- Native: `packages/content/src/local/search-db.native.ts` — SQLite FTS5 virtual
  table `content_fts` (source_id, page_number, text) + `source_index_meta` for
  per-source status. Returns ranked hits with `snippet(...)` highlights and
  BM25 ordering.
- Web: `packages/content/src/local/search-db.web.ts` — IndexedDB `pages` and
  `index_meta` stores; substring search with snippet extraction. Can be swapped
  for minisearch/lunr without changing the public API.
- Platform-agnostic facade: `packages/content/src/local/indexer.ts`
  - `indexSource(sourceId, pages[])` — caller supplies `PageText[]`
  - `searchCampaign(campaignId, query)` — ranked `CampaignHit[]`
  - `removeSourceFromIndex(sourceId)` — called from rulebook delete flow
  - `getIndexStatus(sourceId)` / `getCampaignIndexStatuses(campaignId)`
- Types in `@vaultstone/types`: `IndexStatus`, `IndexMeta`, `PageText`,
  `LocalContentHit`.
- UI scaffold: `app/campaign/[id]/search.tsx` with query input, debounced
  search, grouped results that deep-link to `/pdf-viewer?sourceId=…&page=N`.
- `pdf-viewer.tsx` now accepts an optional `page` param — `react-native-pdf`
  `page` prop on native, `#page=N` fragment on web.
- Rulebook delete flow now also calls `removeSourceFromIndex`.

---

### Parsing Build Plan — Phases 5b–5f

Everything below slots into the existing `indexer.indexSource(sourceId, pages)`
entry point. No changes to the search layer or FTS schema are required; we're
only adding producers of `PageText[]`.

#### Phase 5b — Web PDF text extraction ✅ Done (2026-04-14)
*Extract text from uploaded PDFs in the browser using `pdfjs-dist`.*

- **Dependency:** `pdfjs-dist` (ES module build, dynamically imported so the
  ~1MB bundle loads only when a user first uploads a PDF).
- **New file:** `packages/content/src/local/pdf-parser.web.ts`
  - Public API: `extractPages(source: Blob | string, options?: { onProgress?: (done: number, total: number) => void }): Promise<Omit<PageText, 'sourceId'>[]>`
  - Worker config: `GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()` so Metro/Vite/Netlify bundle the worker alongside the main JS.
  - For each page: call `page.getTextContent({ includeMarkedContent: false })`,
    join items with spaces, and insert newlines when the y-coordinate jumps
    (preserves paragraph boundaries for better snippets).
- **Accept criteria:** A 300-page PDF parses in under ~20s on a mid-range
  laptop; UI remains responsive thanks to pdf.js worker threading; produced
  `PageText.text` round-trips through FTS search with sensible snippets.

#### Phase 5c — Native PDF text extraction ⬜
*Same job, on iOS/Android, without the DOM or web workers.*

- **Strategy:** reuse `pdfjs-dist/legacy/build/pdf.js` on Hermes with a small
  polyfill shim. Legacy build is CommonJS and ES5-compatible; worker runs
  in-thread (no `Worker` class on Hermes). Decided against `react-native-pdf-lib`
  (unmaintained) and against writing a native bridge (too heavy for MVP).
- **Polyfills required:** `atob`/`btoa` (via `base-64`), `TextDecoder` (via
  `text-encoding`), and a no-op `DOMMatrix` stub (pdfjs references it but
  doesn't need it for `getTextContent`).
- **New file:** `packages/content/src/local/pdf-parser.native.ts`
  - Same public API shape as web; takes a `FileSystem` URI instead of a Blob.
  - Reads bytes via `FileSystem.readAsStringAsync(uri, { encoding: Base64 })`
    → `Uint8Array` → pdfjs `getDocument({ data })`.
  - Process pages in a yielding loop (`await new Promise(r => setTimeout(r, 0))`
    between pages) to keep the JS thread unblocked during indexing.
- **Risk:** Hermes startup cost for pdfjs. If unacceptable, fall back to a
  native bridge (e.g., `@react-native-pdf-to-image` forks or a custom Swift/
  Kotlin text-extraction module). Evaluate only if Hermes path fails.
- **Accept criteria:** Parses a 300-page PDF in under ~60s on a mid-range
  phone; no crashes on large files; memory stays under 200MB.

#### Phase 5d — Wire parsing into the upload flow ✅ Done (2026-04-14)
*Kick off indexing automatically after a successful upload.*

- In `app/campaign/[id]/rulebook.tsx` `handleTosConfirm`, after `saveSource`:
  ```ts
  const pages = await extractPages(source).catch(() => []);
  if (pages.length > 0) {
    indexSource(record.id, pages.map((p) => ({ ...p, sourceId: record.id })));
  }
  ```
  Fire-and-forget; UI polls `getIndexStatus` for progress.
- Add `reindexSource(sourceId)` helper to `indexer.ts` that re-runs the
  extraction + index for a single source (exposed as a "Re-index" button).
- `extractPages` is imported from `./local/pdf-parser` (Metro picks the
  right platform file).

#### Phase 5e — Progress UI polish ✅ Done (2026-04-14)
*Per-PDF indicator so users know what's happening.*

- In `rulebook.tsx`, each uploaded PDF row also shows index status:
  - `indexing` → spinner + "Indexing… (42 / 380)"
  - `indexed`  → "✓ 380 pages indexed"
  - `failed`   → "Indexing failed" with a **Retry** action
  - `not_indexed` → "Index now" action (for old uploads pre-parser)
- Poll `getIndexStatus(sourceId)` every ~500ms while any source is `indexing`.
- Search screen status panel already wired up — just feeds off the same API.

#### Phase 5f — ContentResolver Tier 2 wiring ⬜
*Let typed content queries (spells, monsters, etc.) hit user PDFs too.*

- Update `packages/content/src/local/index.ts` `search(query)` to query
  `content_fts` and synthesize `ContentResult[]`:
  - `key: 'local:${sourceId}:${pageNumber}'`
  - `tier: 'local'`
  - `type: query.type ?? 'feature'` (no structured type detection yet — that
    is Phase 6)
  - `description: snippet` so browse UIs have something to render
- After this, `ContentResolver.search({ search: 'Fireball', type: 'spell' })`
  will include page-level hits from every user PDF indexed on the device.
- Structured extraction (recognizing spell blocks vs monster stat blocks vs
  feature descriptions) is explicitly out of scope here — deferred to Phase 6.

### Phase 6 — Structured extraction & Spellbook / Content Browser ⬜ Planned
*Downstream features that consume the framework.*

- Recognize chapter headings / TOC entries during parsing to tag each page
  with a likely content type. A simple rule-based pass (e.g. "page follows
  a '`Spells`' H1") gets us 80% of the way without an LLM.
- Enables typed browsing screens (Spellbook, Bestiary, Items) to surface
  user-uploaded content with proper categorization.
- UI surfaces for these browsers are intentionally left open — we'll decide
  where they live (campaign tab? global drawer?) once the data pipeline works.

### Phase 7 — In-session "Look it up" panel ⬜ Planned
*Quick rule lookup without leaving the active session screen.*

- Add a small search affordance to the session screen (e.g. a magnifying-glass
  pinned in the action bar) that opens a slide-over panel.
- Panel reuses the existing `searchCampaign(campaignId, query, options)` API
  with a tighter `limit` (top 3–5 hits) and a smaller snippet window so it
  reads as a quick-reference card instead of a full results list.
- Each hit shows: source filename, page number, snippet — plus an "Open page"
  action that deep-links into the PDF viewer (`?page=N`) without losing the
  session route.
- Default to "search all indexed PDFs" but persist the last-used filter from
  the main search screen (per-campaign, in `useCampaignStore`) so a player
  who only cares about the PHB doesn't have to retoggle every session.
- Optional: remember the last 5 queries for the active session so DMs can
  re-pull the same lookup mid-fight without retyping.
- **Out of scope for this phase:** voice search, in-line dice detection (see
  brainstorm), structured content recognition (Phase 6 covers that).
- **Accept criteria:** opening the panel mid-session does not unmount or
  reset the session state; deep-linking to a page leaves a back-button trail
  that returns to the session.

### Phase 8 — Bookmarks / page pins ⬜ Planned
*Star a page so you can jump back without re-searching.*

- New on-device table: `pdf_bookmarks (id, source_id, page_number, label, created_at)`.
  Keep it local per the legal constraint — bookmarks reference pages from the
  user's own PDF, so they only make sense on their device.
- Add a "Pin this page" affordance in the PDF viewer toolbar; allow an
  optional short label (e.g. "My subclass", "Conditions"). Default label is
  the source filename + page number.
- Surface pins in two places:
  - A dedicated "Pinned" section at the top of the search screen (always
    visible, independent of any active query).
  - Optional drawer/section on the rulebook screen, grouped by source.
- Pins are also a search filter: a "Pinned only" toggle on the search screen
  scopes hits to `(sourceId, pageNumber)` pairs that are pinned.
- Tap a pin → opens PDF viewer at that page.
- Edit/delete actions on each pin (long-press or trailing menu).
- **Out of scope:** annotations or note text on a pin (covered separately by
  the existing Notes feature). Pins are just navigational shortcuts.
- **Accept criteria:** pins survive app reloads on both web (IndexedDB) and
  native (SQLite); tapping a pin always opens to the correct page; pins for
  a deleted source are auto-removed.

### Phase 9 — DM-shared search results ⬜ Planned
*Share the **fact** of a hit with the party without sharing PDF text.*

- Hard legal rule: PDF page text never leaves the device. This phase shares
  *citations only* — `(sourceKey, pageNumber, label)` — which any party
  member who also indexed the same source can re-resolve locally.
- New table (Supabase): `session_lookups`
  ```sql
  create table session_lookups (
    id            uuid primary key default gen_random_uuid(),
    session_id    uuid not null references sessions(id) on delete cascade,
    shared_by     uuid not null references auth.users(id),
    source_key    text not null,            -- e.g. 'phb_2024' (matches campaign.content_sources.key)
    page_number   int  not null,
    query         text,                     -- the search the DM ran (optional, for context)
    label         text,                     -- short caption like "Grappled condition"
    shared_at     timestamptz default now()
  );
  ```
  RLS: only members of the parent campaign can read; only DM (or party with
  permission) can insert. Snippet text is **never** stored server-side —
  the `query` field is the user's typed query, not extracted PDF content.
- "Share to party" button on each hit in the in-session lookup panel
  (Phase 7) and the main search screen.
- Realtime broadcast on `session:{id}` so other clients show a toast like
  *"GM shared a reference: PHB p.217 (Counterspell)"* with a "Open" action.
- On the receiving side: if the user has the same `source_key` indexed, the
  Open action deep-links to their local copy at that page. If they don't,
  show "You haven't uploaded this source — go to Rulebook to add your copy."
- A dedicated "Shared this session" feed in the session screen so late
  joiners can scroll back through what was looked up.
- **Out of scope:** DM annotations, in-line snippets, sharing arbitrary text.
  All sharing is citation-only by design.
- **Accept criteria:** a DM share never transmits a single character of PDF
  page text; receiving clients without the same source see a clear "you
  don't have this PDF" prompt rather than an empty viewer.

---

### Dependencies introduced by the parsing plan

| Phase | Package(s) | Notes |
|---|---|---|
| 5b | `pdfjs-dist` | Web + (via legacy build) native. Dynamic import. |
| 5c | `base-64`, `text-encoding` | Tiny shims for Hermes compatibility. |
| 7  | *(none)* | Reuses existing search APIs + viewer routes. |
| 8  | *(none)* | Local-only persistence via existing IDB/SQLite layers. |
| 9  | *(none new)* | Adds a Supabase table + Realtime channel reuse. |

No server changes for Phases 7 and 8. Phase 9 adds one citation-only table;
PDF content remains on-device per the legal constraint.

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
- Automatic detection of which rulebook was uploaded
- Structured entity extraction (spell blocks, stat blocks) — Phase 6
