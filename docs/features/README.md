# Feature Overview

Vaultstone is a system-agnostic TTRPG campaign management app. Ships with D&D 5e SRD 5.1 and SRD 2.0 content (CC-BY 4.0). Supports any TTRPG system through user-uploaded local content and homebrew authoring. See [Legal Constraints](../legal.md) for full content and sharing rules.

---

## 1. Character Creation & Sheet Manager
Step-by-step character creation and ongoing sheet management. Ships with SRD 5.1 and SRD 2.0 content; extensible to any system via user-uploaded or homebrew content. Auto-calculates modifiers, proficiency bonuses, saving throws. Tracks HP, spell slots, hit dice, and conditions.

→ [Full requirements](01-character.md)

## 2. Spellbook Reference
Searchable spell compendium for players and GMs. Unified spell index across all content tiers. Filters by class, level, school, casting time. Prepared spell tracking, spell slot management, and concentration tracker. Offline-capable.

→ [Full requirements](02-spellbook.md)

## 3. Homebrew & Uploaded Content
The content pipeline that powers extensibility. Two distinct flows: local parsing of user-owned PDFs (on-device only, never transmitted), and in-app authoring of original homebrew. Toggle content visibility per campaign. Feeds into the unified ContentResolver.

→ [Full requirements](03-content.md)

## 4. Party Hub / Session Mode
Shared real-time space for active sessions. Live HP, conditions, spell slots per player. Shared initiative tracker and turn tracking. Session notes and loot tracking. GM controls visibility. Syncs character state and user-created content — never source text.

→ [Full requirements](04-party-hub.md)

## 5. GM Toolkit
Bestiary browser, encounter builder, and encounter template library. Ships with SRD creature stat blocks. Difficulty calculation (D&D 5e XP model). Save and reuse encounter templates. Pushes encounters directly into the initiative tracker.

→ [Full requirements](05-gm-toolkit.md)

## 6. Session Notes & Campaign Notes Hub ✅ Shipped
Per-user private notes during a live session; Campaign Notes Hub (DM-only route) that aggregates per-session notes and hosts the recap editor. Dock with resizable, drag-rearrangeable, pop-out-able panels. Session History card surfaces the recap + participant notes after end-of-session.

→ [Full requirements](06-notes.md)

## 7. World Building & Campaign Knowledge Base
GM workspace for worlds, locations, maps, factions, timeline, and the deeper notes layer (hierarchical notes, `@content-refs`, `[[note-links]]`, tags, full-text search, three-tier visibility, structured NPC/Quest types). Absorbed the non-session notes infrastructure that used to live in Feature 6.

→ [Full requirements](07-world-building.md)

## 8. Campaign System Card — PDF Rulebook
Allows a DM to declare the rulebook their campaign uses and for each user to upload their own local PDF copy for in-app reading. PDFs stored on-device only — never transmitted to server or shared between users. Hard legal requirement.

→ [Full requirements](08-pdf-rulebook.md)
