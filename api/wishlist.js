import { db, ensureSchema } from "./lib/db.js";
import { json } from "./lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return json(res, 405, { error: "Method not allowed." });
  }

  try {
    await ensureSchema();
    const result = await db().execute(
      "SELECT id, name FROM wishlist ORDER BY created_at ASC, name COLLATE NOCASE"
    );
    return json(res, 200, {
      items: result.rows.map((row) => ({ id: row.id, name: row.name })),
    });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: "Wishlist couldn't be loaded." });
  }
}
