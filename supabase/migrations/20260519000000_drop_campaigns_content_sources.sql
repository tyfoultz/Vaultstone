-- Drop campaigns.content_sources.
--
-- Holdover from the original PDF-as-content-source design — a per-campaign
-- JSONB declaring which rulebook the campaign used (e.g.
-- { key: 'srd_5_1', label: 'SRD 5.1 — D&D 5e (2014)' }). When the System
-- Card was reduced to a system + content-packs summary in M2 of the
-- imports↔homebrew unification, every reader of this column went away.
-- Confirmed by greps before this migration: no active code path in the
-- product surface reads or writes it.
--
-- system_label is intentionally retained — it's the only place a DM
-- running a Custom system can name what they're actually playing
-- (Pathfinder 2e, etc.), and the campaign-list and home cards still
-- render it as a sublabel on the campaign card.

alter table campaigns drop column if exists content_sources;
