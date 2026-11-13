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
        ratio TEXT NOT NULL DEFAULT '3:4',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `).then(async () => {
      const info = await db().execute("PRAGMA table_info(pieces)");
      if (!info.rows.some((row) => row.name === "ratio")) {
        await db().execute("ALTER TABLE pieces ADD COLUMN ratio TEXT NOT NULL DEFAULT '3:4'");
      }
    }).catch((error) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}
