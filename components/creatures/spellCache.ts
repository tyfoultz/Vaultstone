import { ContentResolver } from '@vaultstone/content';
import type { SpellResult } from '@vaultstone/types';

const cache = new Map<string, SpellResult | null>();
const pending = new Map<string, Promise<SpellResult | null>>();

export async function getCachedSpell(name: string): Promise<SpellResult | null> {
  const key = name.toLowerCase();
  if (cache.has(key)) return cache.get(key)!;
  if (pending.has(key)) return pending.get(key)!;

  const promise = ContentResolver.getSpell(name).then((result) => {
    cache.set(key, result);
    pending.delete(key);
    return result;
  });
  pending.set(key, promise);
  return promise;
}
