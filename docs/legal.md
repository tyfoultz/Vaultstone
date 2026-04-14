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

## Part 2: User-Uploaded Content

Users may upload their own legally obtained PDFs for personal use. The app processes and indexes this content **locally on the user's device only**. The developer never stores, transmits, or accesses this content.

### Permitted
- Parsing and indexing PDF content locally for personal search and reference
- Storing extracted text in a local database on the user's device
- Providing search and lookup against content the user has uploaded
- Supporting any TTRPG system a user has legally purchased

### Not Permitted
- Transmitting user-uploaded copyrighted content to any server or third-party API
- Sharing extracted source text with other users
- Building any feature that allows a user without a book to access its content via another user's upload
- Caching or storing user content on the developer's infrastructure in any form

> **Rule:** User content stays on the user's device. The developer's servers never touch it.

**Required ToS obligation:** The app's Terms of Service must clearly state that users are solely responsible for ensuring they have lawful rights to any content they upload, and that the app is intended for personal, private use of content the user legally owns.

---

## Part 3: User-Generated Content (Homebrew, Notes, etc.)

- Character sheets, stats, backstories, notes, custom lore — belongs to the user
- Homebrew spells, items, monsters, classes, species created in-app — belongs to the user
- Session notes, world-building documents, campaign journals — belongs to the user

This content may be stored and synced server-side.

---

## Part 4: Party and Campaign Sharing

A GM creates a campaign that players join. The session synchronizes **gameplay state — not source material**.

### Permitted to Sync Across a Party
- Character sheet state: ability scores, HP, level, class features, equipment, spell slot tracking
- Session and campaign notes authored by the GM or players
- Initiative order, combat tracking, real-time session state
- Homebrew content created by the GM or players from scratch
- Structural references (e.g., "this character has Fireball prepared at slot level 3") without transmitting description text

### Never Permitted to Sync
- Extracted or parsed text from any user-uploaded copyrighted source material
- Any content that allows a user who doesn't own a book to read its content through a party member who does

> **Rule:** What syncs across a party is character data and user-created content — not book content. If a player wants to read a spell description, their app pulls it from their own uploaded source. If they don't have the source, they see the name and metadata only.

---

## Part 5: What This App Is Not

- **Not a D&D app.** No WotC branding, the D&D name, or associated iconography.
- **Not a content distributor.** No copyrighted TTRPG content is bundled, hosted, or made available for download.
- **Not a D&D Beyond competitor.** Competes on tooling and experience, not content libraries.
- **Not a VTT.** Emphasis is on world lore, notes, and campaign management — not tactical grid combat.

---

## Summary Table

| Content Type | Permitted | Condition |
|---|---|---|
| SRD 5.1 / SRD 2.0 content | Yes | Attribution required (CC-BY 4.0) |
| Other open-license TTRPG content | Yes | Per that license's terms |
| Non-SRD publisher content | No | Cannot be bundled |
| User-uploaded PDFs (local) | Yes | Stays on user's device only |
| User-uploaded content (server) | No | Cannot be transmitted |
| User-created character data | Yes | Belongs to user, freely syncable |
| User-created homebrew | Yes | Belongs to user, freely syncable |
| Party sync — character state | Yes | No source text transmitted |
| Party sync — source text | No | Cannot share across users |

---

> *This document is a working reference for application requirements and is not legal advice. For questions about specific content or edge cases, consult a lawyer with IP or copyright experience before implementation.*
