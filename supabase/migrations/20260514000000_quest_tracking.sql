-- Add 'quests' to the section template_key constraint and 'quest' to page_kind.

ALTER TABLE world_sections DROP CONSTRAINT IF EXISTS world_sections_template_key_check;
ALTER TABLE world_sections ADD CONSTRAINT world_sections_template_key_check
  CHECK (template_key IN ('locations','npcs','players','factions','lore','blank','timeline','quests'));

ALTER TABLE world_pages DROP CONSTRAINT IF EXISTS world_pages_page_kind_check;
ALTER TABLE world_pages ADD CONSTRAINT world_pages_page_kind_check
  CHECK (page_kind IN ('custom','location','npc','faction','religion','organization','item','lore','timeline','pc_stub','player_character','quest'));
