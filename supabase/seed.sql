-- Dev seed data — runs after migrations in local dev environment.
-- Do not run against production.

-- Seed game systems
INSERT INTO game_systems (id, display_name, version, license, is_bundled, definition)
VALUES
  ('dnd5e', 'D&D 5th Edition', '2024', 'CC-BY-4.0', true, '{}'),
  ('custom', 'Custom System', '1.0', 'custom', false, '{}')
ON CONFLICT (id) DO NOTHING;
