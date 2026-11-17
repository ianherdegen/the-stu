import { db, ensureSchema } from "../lib/db.js";
import { requireAdmin } from "../lib/http.js";
import { readStored } from "../lib/stored.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).end("Method not allowed.");
    return;
  }
  if (!requireAdmin(req, res)) return;

  const id = req.query?.id || new URL(req.url, "http://localhost").searchParams.get("id");
  if (!id) {
    res.status(404).end("Not found.");
    return;
  }

  try {
    await ensureSchema();
    const found = await db().execute({
      sql: "SELECT COALESCE(image_url, '') AS image_url FROM pieces WHERE id = ?",
      args: [id],
    });
    const storedName = found.rows[0]?.image_url;
    if (!storedName) {
      res.status(404).end("Not found.");
      return;
    }
    const stored = await readStored(storedName);
    if (!stored) {
      res.status(404).end("Not found.");
      return;
    }
    res.setHeader("Content-Type", stored.type);
    res.setHeader("Cache-Control", "private, no-store");
    res.status(200).end(stored.buffer);
  } catch (error) {
    console.error(error);
    res.status(500).end("Image couldn't be loaded.");
  }
}
