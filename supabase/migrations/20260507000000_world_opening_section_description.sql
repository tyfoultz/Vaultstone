-- Opening prose block on the world dashboard (editable title + rich text body)
alter table worlds
  add column if not exists opening_title text default 'World Description',
  add column if not exists opening_body jsonb,
  add column if not exists opening_body_text text,
  add column if not exists opening_updated_at timestamptz,
  add column if not exists opening_updated_by uuid references auth.users(id);

-- Per-section description shown on the world landing cards
alter table world_sections
  add column if not exists description text;
