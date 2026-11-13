import { db, ensureSchema } from "../lib/db.js";
import { cleanText, json, readJson, requireAdmin } from "../lib/http.js";

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return json(res, 405, { error: "Method not allowed." });
  }

  try {
    await ensureSchema();
    const body = await readJson(req);
    const artistId = String(body.artistId || "").trim();
    const from = cleanText(body.from, 80);
    const to = cleanText(body.to, 80);
    if (!artistId || !from) return json(res, 400, { error: "Pick a collection to rename." });
    if (!to) return json(res, 400, { error: "Name the collection." });

    const artist = await db().execute({ sql: "SELECT id FROM artists WHERE id = ?", args: [artistId] });
    if (!artist.rows.length) return json(res, 400, { error: "Pick an artist first." });

    const existing = await db().execute({
      sql: "SELECT DISTINCT collection FROM pieces WHERE artist_id = ? AND collection IS NOT NULL",
      args: [artistId],
    });
    const taken = existing.rows.some((row) => {
      const name = String(row.collection || "");
      return name.toLowerCase() === to.toLowerCase() && name !== from;
    });
    if (taken) return json(res, 400, { error: "That collection already exists." });

    await db().execute({
      sql: "UPDATE pieces SET collection = ? WHERE artist_id = ? AND collection = ?",
      args: [to, artistId, from],
    });
    return json(res, 200, { ok: true });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: "Collection couldn't be renamed." });
  }
}
