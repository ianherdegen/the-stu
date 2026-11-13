import { createClient } from "@libsql/client";

let client;
let ready;

export function db() {
  if (!client) {
    client = createClient({
      url: (process.env.TURSO_DATABASE_URL || "").trim(),
      authToken: (process.env.TURSO_AUTH_TOKEN || "").trim(),
    });
  }
  return client;
}

export function ensureSchema() {
  if (!ready) {
    ready = db().executeMultiple(`
      CREATE TABLE IF NOT EXISTS artists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS pieces (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        artist_id TEXT REFERENCES artists(id) ON DELETE SET NULL,
        collection TEXT,
        description TEXT NOT NULL DEFAULT '',
        image_url TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `).catch((error) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}
