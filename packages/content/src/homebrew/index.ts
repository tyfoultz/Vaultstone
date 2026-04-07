import type { ContentResult, ContentQuery } from '@vaultstone/types';

// Homebrew content is user-created and stored in Supabase.
// Queried via the API package when network is available.

export async function search(_query: ContentQuery): Promise<ContentResult[]> {
  // TODO: query Supabase homebrew_content table
  return [];
}
