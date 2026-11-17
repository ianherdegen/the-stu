import crypto from "crypto";
import { ensureSchema, db } from "./lib/db.js";
import { json } from "./lib/http.js";

function publicImage(row) {
  if (!row.image_url) return "";
  const version = crypto.createHash("sha1").update(`${row.artist}\0${row.image_url}`).digest("hex").slice(0, 10);
  return `/api/image?id=${encodeURIComponent(row.id)}&v=${version}`;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return json(res, 405, { error: "Method not allowed." });
  }

  try {
    await ensureSchema();
    const result = await db().execute(`
      SELECT p.id, p.title, COALESCE(a.name, '') AS artist,
             COALESCE(p.collection, '') AS collection,
             p.description, COALESCE(p.image_url, '') AS image_url,
             CASE WHEN p.ratio = '4:5' THEN '4:5' ELSE '3:4' END AS ratio
      FROM pieces p
      LEFT JOIN artists a ON a.id = p.artist_id
      ORDER BY p.created_at ASC, p.title ASC
    `);
    return json(res, 200, {
      pieces: result.rows.map((row) => ({
        id: row.id,
        title: row.title,
        artist: row.artist,
        collection: row.collection,
        description: row.description,
        imageUrl: publicImage(row),
        ratio: row.ratio,
      })),
    });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: "Art couldn't be loaded." });
  }
}
