-- =============================================================================
-- Add content_sources JSONB column to campaigns
-- Stores the declared rulebook/source for the campaign (metadata only).
-- No file content is ever stored here — PDFs remain on-device.
-- Example value: { "key": "srd_5_1", "label": "SRD 5.1 — D&D 5e (2014)" }
-- =============================================================================

alter table campaigns
  add column if not exists content_sources jsonb default null;
