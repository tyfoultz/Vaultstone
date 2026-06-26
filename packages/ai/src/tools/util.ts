/** Truncate long text so tool results stay token-cheap. */
export function trimText(text: string | undefined | null, max = 1500): string {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * Turn an edition-suffixed content key into a readable label without a network
 * round-trip — e.g. `fighter-srd-2-0` → `Fighter`, `high-elf-srd-5-1` →
 * `High Elf`. The model can call search_game_content if it needs the full
 * canonical entry.
 */
export function prettifyKey(key: string | undefined | null): string {
  if (!key) return '';
  return key
    .replace(/-srd-5-1$|-srd-2-0$|-srd-2-24$/i, '')
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
