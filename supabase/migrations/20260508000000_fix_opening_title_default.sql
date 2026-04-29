-- Fix the default title from "Opening · Read Aloud" to null (code provides the display default)
alter table worlds alter column opening_title set default null;
-- Update any existing rows that got the old default
update worlds set opening_title = null where opening_title = 'Opening · Read Aloud';
