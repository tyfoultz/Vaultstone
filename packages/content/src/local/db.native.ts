import * as SQLite from 'expo-sqlite';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!_db) {
    _db = await SQLite.openDatabaseAsync('vaultstone_local.db');
    await _db.execAsync(`
      CREATE TABLE IF NOT EXISTS user_content_sources (
        id          TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        source_key  TEXT NOT NULL,
        file_name   TEXT NOT NULL,
        file_path   TEXT NOT NULL,
        uploaded_at TEXT NOT NULL
      );
    `);
  }
  return _db;
}

export type LocalSource = {
  id: string;
  campaign_id: string;
  source_key: string;
  file_name: string;
  file_path: string;
  uploaded_at: string;
};

export async function getSourcesByCampaign(campaignId: string): Promise<LocalSource[]> {
  const db = await getDb();
  return db.getAllAsync<LocalSource>(
    'SELECT * FROM user_content_sources WHERE campaign_id = ? ORDER BY uploaded_at ASC',
    [campaignId],
  );
}

export async function getSourceById(sourceId: string): Promise<LocalSource | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<LocalSource>(
    'SELECT * FROM user_content_sources WHERE id = ? LIMIT 1',
    [sourceId],
  );
  return row ?? null;
}

export async function saveSource(source: LocalSource): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO user_content_sources
       (id, campaign_id, source_key, file_name, file_path, uploaded_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [source.id, source.campaign_id, source.source_key, source.file_name, source.file_path, source.uploaded_at],
  );
}

export async function deleteSourceById(sourceId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM user_content_sources WHERE id = ?', [sourceId]);
}
