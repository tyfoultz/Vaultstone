# Legal Boundary Statement

Reference guide defining the legal scope of content use, storage, and sharing for Vaultstone.

---

## What This App Is

Vaultstone is a **general-purpose, system-agnostic TTRPG campaign management tool**. It is not a D&D product, not affiliated with Wizards of the Coast or any other publisher, and does not distribute, replicate, or bundle any third-party copyrighted content. It is a tool — players and GMs bring their own content to it.

---

## Part 1: Built-In Content (What Ships With the App)

### Permitted
- Content from the **D&D 5e SRD 5.1**, released under **CC-BY 4.0** (January 2023)
- Content from the **D&D 2024 SRD 2.0**, also released under **CC-BY 4.0** (2025)
- Rules, mechanics, or content from other TTRPG systems under open/permissive licenses (e.g., Pathfinder ORC License)
- Generic game mechanics and dice systems (not copyrightable)
- App-generated templates, character sheet layouts, and structures created independently

### Not Permitted
- Non-SRD content from any publisher (Forgotten Realms lore, named characters, settings, proprietary monsters, subclasses, non-SRD adventures)
- Art, logos, trade dress, or branding from any TTRPG publisher
- Content from other publishers beyond what they've explicitly released under open licenses

> **Rule:** If it's not in an SRD or open license document, it does not ship with the app.

**CC-BY 4.0 attribution is required** on every screen displaying SRD content. Minimum text: *"Content from the Systems Reference Document 5.1 / 2.0 is available under the Creative Commons Attribution 4.0 International License."*

---

## Part 2: User-Uploaded PDFs (Read-Only Reader)

The app includes a per-campaign PDF reader for users who want to keep their legally obtained rulebooks alongside their games. The reader is a viewer only — there is no text extraction, no full-text search, no indexing, and the PDF's contents do not flow into ContentResolver search results.

### Permitted
- Storing PDF binaries the user uploaded **on the user's own device only** (Expo FileSystem on native, IndexedDB on web)
- Rendering those PDFs in-app for that user's personal reference
- Supporting any TTRPG system the user has legally purchased

### Not Permitted
- Transmitting PDF bytes to Vaultstone servers, third-party APIs, or other users
- Extracting, parsing, indexing, or searching the contents of uploaded PDFs
- Sharing a PDF or any content derived from it across a party
- Letting a player without their own copy of a PDF read its contents through a party member's upload

> **Rule:** Uploaded PDFs are private to the uploader and stay on the uploader's device. The reader never derives searchable or shareable content from them.

**Required ToS obligation (PDFs):** The app's Terms of Service must clearly state that users are solely responsible for ensuring they have lawful rights to any PDF they upload, and that the reader is intended for personal, private use of content the user legally owns.

---

## Part 3: User-Imported Structured Content (5e.tools-Style JSON Imports)

Users can extend a game system with structured JSON content — typically a community export from 5e.tools (subclasses, feats, spells, backgrounds, items, species, monsters, classes). The app parses the JSON in-runtime via a per-content-type transform and writes the resulting entries to the importer's user-scoped content pack on Supabase. This content is **not on-device-only** — it lives on Vaultstone's infrastructure, scoped to the importer's account.

This is a different posture than uploaded PDFs and intentionally so: imports are structured data the user can choose to share with their own party (via their content pack) once they've vouched that they have the right to use it.

### Permitted
- Parsing user-supplied JSON files and transforming entries into Vaultstone's `*Result` shape
- Storing imported entries in the Supabase `imported_content` table, parented under a `homebrew_packs` row owned by the importer
- Surfacing imported entries to the importer alongside SRD content via ContentResolver
- Letting the importer attach their own pack to one of their campaigns so party members can use those entries — same affordance as authored homebrew

### Not Permitted
- Auto-sharing an imported pack with anyone other than the importer until the importer attaches it to a campaign they DM
- Bundling, redistributing, or making any user's imported content available outside the importer's account
- Importing structured content that the user does not have the legal right to use

> **Rule:** Imported content is the importer's responsibility. It lives under the importer's pack, scoped to their account, and only spreads to other users when the importer chooses to attach the pack to a campaign they run.

**Required ToS obligation (imports) — per-import gate.** The app must present an in-app Terms of Service callout before each import that states the user is solely responsible for ensuring they have lawful rights to the content being imported, that imported entries are stored on Vaultstone's infrastructure under their account, and that they accept responsibility for any sharing they later configure. The user must affirmatively accept before the import proceeds.

### Pack Export / Import (User-to-User Pack Transfer)

A pack owner can export their entire pack (authored homebrew + imported structured content) to a `vaultstone-pack/v1` JSON file. Another user can import that file into their own account, which creates a **new pack owned by the importer** with all entries restored. There is no shared-state link back to the original — the file is a one-way handoff, not a synced share.

This path matters legally because it lets users move content between accounts without going back through the original 5e.tools-style JSON. The same per-import attestation must apply: receiving content from another user does not change who carries the rights obligation.

#### Permitted
- A pack owner exporting their pack to a JSON file for backup, debugging, or out-of-band sharing with users they trust
- An importer creating a fresh pack in their own account from a received file, after accepting the per-import ToS callout
- A new owner subsequently attaching the imported pack to a campaign they DM, on the same terms as any other pack (see Part 5)

#### Not Permitted
- Importing a pack file containing content the importer does not have the lawful right to use, even if the original exporter accepted the rights attestation
- Building a public pack registry, marketplace, or distribution channel without revisiting the legal posture for that scale of distribution
- Treating a received pack as a shared resource — once imported, it lives entirely under the importer's account; the original exporter has no audit, revocation, or sync path

> **Rule:** Pack export creates a portable file. Pack import re-grounds responsibility under the new owner. Both ends accept the per-import ToS callout — the exporter to confirm they had rights to the content they're packaging, the importer to re-attest before the file lands in their account.

**Required ToS obligation (pack import) — per-import gate, same wording line as JSON imports.** The receiving user must affirmatively accept that they have lawful rights to the content in the file before the new pack row is created. The exporter side surfaces the same line at the moment of export. Both sides retain transcripts of acceptance for audit.

---

## Part 4: User-Generated Content (Homebrew, Notes, etc.)

- Character sheets, stats, backstories, notes, custom lore — belong to the user
- Homebrew spells, items, monsters, classes, species, feats authored in-app — belong to the user
- Session notes, world-building documents, campaign journals — belong to the user

This content is stored and synced server-side under the user's account.

---

## Part 5: Party and Campaign Sharing

A GM creates a campaign that players join. The session synchronizes **gameplay state and content the GM has chosen to share — not raw source material from publishers**.

### Permitted to Sync Across a Party
- Character sheet state: ability scores, HP, level, class features, equipment, spell slot tracking
- Session and campaign notes authored by the GM or players
- Initiative order, combat tracking, real-time session state
- Authored homebrew content the GM or players created from scratch
- Imported structured content that the GM has explicitly attached to the campaign as one of its content packs (subject to Part 3 — the GM accepted the per-import ToS at import time)
- Structural references (e.g., "this character has Fireball prepared at slot level 3")

### Never Permitted to Sync
- Bytes of any user-uploaded PDF, or any content derived from one (text, page snippets, indices)
- Any content that allows a user who doesn't own a book to read its contents through a PDF a party member uploaded

> **Rule:** What syncs across a party is user-created data, character state, and content packs the GM has explicitly attached to the campaign. PDFs never sync.

---

## Part 6: What This App Is Not

- **Not a D&D app.** No WotC branding, the D&D name, or associated iconography.
- **Not a content distributor.** No copyrighted TTRPG content is bundled, hosted, or made available for download.
- **Not a D&D Beyond competitor.** Competes on tooling and experience, not content libraries.
- **Not a VTT.** Emphasis is on world lore, notes, and campaign management — not tactical grid combat.

---

## Part 7: AI Assistant (Third-Party LLM Processing)

The optional AI assistant sends the user's question — and, on demand, the specific campaign/character/world data the user is allowed to see — to **Google's Gemini API** to generate a reply.

### Posture
- **Provider:** Google Gemini (free tier) via a developer-owned key behind a server-side relay. The key is never exposed to clients.
- **What is sent:** the user's chat messages plus tool results drawn from data the signed-in user already has access to (enforced by RLS). A player only ever sends their own character, general rules, and player-visible world pages; DM-only content is never reachable on the player path.
- **What is NOT sent:** user-uploaded PDF bytes or anything derived from them (the assistant has no PDF tool), and any campaign/world data the user couldn't otherwise read.
- **Storage:** chat history is stored **only on the user's device**. Vaultstone stores no message content server-side (only an anonymous per-user daily request counter for rate-limiting).
- **Google's use of data:** on the free tier, Google may use submitted content to improve their models. **The user must accept an in-app disclosure to this effect before first use.** Enabling billing on the Google account removes this; the app behaves identically.

> **Rule:** The assistant only transmits content the user is already authorized to see, plus their own prompts. PDFs and unauthorized content are never sent. A pre-use disclosure covers Google's free-tier data handling.

---

## Summary Table

| Content Type | Permitted | Where it lives | Sharing |
|---|---|---|---|
| SRD 5.1 / SRD 2.0 content | Yes | Bundled in app | Yes — CC-BY 4.0, attribution required |
| Other open-license TTRPG content | Yes | Bundled in app | Per that license's terms |
| Non-SRD publisher content | No | — | Cannot be bundled |
| User-uploaded PDFs | Yes | User's own device only | Never — reader is private to the uploader |
| User-imported structured JSON content | Yes (per-import ToS gate) | Supabase, scoped to importer's pack | Only when importer attaches pack to a campaign they DM |
| User-to-user pack transfer (export/import file) | Yes (per-import ToS gate on both ends) | New Supabase pack scoped to receiving user | One-way file handoff — recipient owns their copy |
| User-created character data | Yes | Supabase, scoped to user | Freely syncable to the user's campaigns |
| User-authored homebrew | Yes | Supabase, scoped to user's pack | Same as imports — pack attaches to a campaign |
| Party sync — character state | Yes | Real-time + DB | No raw publisher source text transmitted |
| Party sync — PDF contents | No | — | Cannot share across users |

---

> *This document is a working reference for application requirements and is not legal advice. For questions about specific content or edge cases, consult a lawyer with IP or copyright experience before implementation.*
