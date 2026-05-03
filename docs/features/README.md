# Feature Overview

Vaultstone is a system-agnostic TTRPG campaign management app. Ships with D&D 5e SRD 5.1 and SRD 2.0 content (CC-BY 4.0). Supports any TTRPG system through user-uploaded local content and homebrew authoring. See [Legal Constraints](../legal.md) for full content and sharing rules.

---

## 1. Character Creation & Sheet Manager
Step-by-step character creation and ongoing sheet management. Ships with SRD 5.1 and SRD 2.0 content; extensible to any system via user-uploaded or homebrew content. Auto-calculates modifiers, proficiency bonuses, saving throws. Tracks HP, spell slots, hit dice, and conditions.

→ [Full requirements](01-character.md)

## 2. Spellbook Reference
Searchable spell compendium for players and GMs. Unified spell index across all content tiers. Filters by class, level, school, casting time. Prepared spell tracking, spell slot management, and concentration tracker. Offline-capable.

→ [Full requirements](02-spellbook.md)

## 3. Homebrew & Imported Content
The content pipeline that powers extensibility. Two flows: in-app authoring of original homebrew (Supabase-backed, party-shareable) and on-device JSON content imports (e.g. 5e.tools community packs — never transmitted). Both feed into the unified ContentResolver alongside SRD.

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
Notion/OneNote-style world workspace. DM owns worlds; each world links to one or more campaigns. Sidebar of default + user-defined sections (Locations, NPCs, Factions, Players, Timeline, Maps, etc.) with unlimited sub-page nesting. Rich page editor (Tiptap on web, 10tap-editor on native) with `@mention` chips that link to pages, pins, and PCs. Multiple uploaded maps with drill-down sub-maps and 7 categorized pin types. Per-page player-reveal toggle with section-level overrides. Unified search across pages, pins, and timeline. Soft-delete with 30-day recovery; 500MB per-user storage cap.

→ [Full requirements](07-world-building.md)

## 8. PDF Reader (campaign-side)
Each user can upload their own legally-owned PDF copy of the campaign's rulebook for in-app reading. PDFs stored on-device only — never transmitted to server or shared between users. Hard legal requirement. The original "PDF as content extension" spec was superseded by the imported content tier (Feature 3).

→ [Superseded spec note](08-pdf-rulebook.md)
