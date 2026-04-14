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

## 6. Notes Manager
Hierarchical, rich-text note-taking for players and GMs. Visibility model: private / gm_visible / party_shared. Nested pages, full-text search, tagging. Structured note types: NPC profiles, quest logs, session logs, locations, lore. Integrates with Feature 4 session notes.

→ [Full requirements](06-notes.md)

## 7. World Building Toolkit
GM workspace for building and managing campaign worlds. Location hierarchy (world → continent → region → city → district → building). World map with zoomable/pannable image and interactive pins. Faction tracker with membership and relationship graph. Timeline with in-world date events. Full bidirectional linking with Notes Manager.

→ [Full requirements](07-world-building.md)

## 8. Campaign System Card — PDF Rulebook
Allows a DM to declare the rulebook their campaign uses and for each user to upload their own local PDF copy for in-app reading. PDFs stored on-device only — never transmitted to server or shared between users. Hard legal requirement.

→ [Full requirements](08-pdf-rulebook.md)
