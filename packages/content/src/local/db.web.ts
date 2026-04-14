// Web implementation of local source storage using localStorage.
// Note: file_path on web is a blob object URL — ephemeral per session.

export type LocalSource = {
  id: string;
  campaign_id: string;
  source_key: string;
  file_name: string;
  file_path: string;
  uploaded_at: string;
};

const STORAGE_KEY = 'vaultstone_content_sources';

function load(): LocalSource[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function persist(sources: LocalSource[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sources));
}

export async function getSourceByCampaign(campaignId: string): Promise<LocalSource | null> {
  return load().find((s) => s.campaign_id === campaignId) ?? null;
}

export async function saveSource(source: LocalSource): Promise<void> {
  const rest = load().filter((s) => s.campaign_id !== source.campaign_id);
  persist([...rest, source]);
}

export async function deleteSource(campaignId: string): Promise<void> {
  persist(load().filter((s) => s.campaign_id !== campaignId));
}
