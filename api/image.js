import { db, ensureSchema } from "../lib/db.js";
import { readStored } from "../lib/stored.js";
import { watermark } from "../lib/watermark.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).end("Method not allowed.");
    return;
  }

  const id = req.query?.id || new URL(req.url, "http://localhost").searchParams.get("id");
  if (!id) {
    res.status(404).end("Not found.");
    return;
  }

  try {
    await ensureSchema();
    const found = await db().execute({
      sql: `SELECT COALESCE(p.image_url, '') AS image_url, COALESCE(a.name, '') AS artist
            FROM pieces p
            LEFT JOIN artists a ON a.id = p.artist_id
            WHERE p.id = ?`,
      args: [id],
    });
    const row = found.rows[0];
    if (!row?.image_url) {
      res.status(404).end("Not found.");
      return;
    }

    const stored = await readStored(row.image_url);
    if (!stored) {
      res.status(404).end("Not found.");
      return;
    }

    const marked = row.artist ? await watermark(stored.buffer, row.artist) : null;
    const body = marked || stored.buffer;
    const type = marked ? "image/jpeg" : stored.type;
    res.setHeader("Content-Type", type);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.status(200).end(body);
  } catch (error) {
    console.error(error);
    res.status(500).end("Image couldn't be loaded.");
  }
}
