import crypto from "crypto";
import { db, ensureSchema } from "../lib/db.js";
import { cleanText, json, readJson, requireAdmin } from "../lib/http.js";

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  try {
    await ensureSchema();
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: "Database is not available." });
  }

  if (req.method === "GET") return list(res);
  if (req.method === "POST") return create(req, res);
  if (req.method === "PATCH") return rename(req, res);
  if (req.method === "DELETE") return remove(req, res);
  res.setHeader("Allow", "GET, POST, PATCH, DELETE");
  return json(res, 405, { error: "Method not allowed." });
}

async function list(res) {
  const result = await db().execute("SELECT id, name FROM artists ORDER BY name COLLATE NOCASE");
  return json(res, 200, { artists: result.rows });
}

async function create(req, res) {
  const body = await readJson(req);
  const name = cleanText(body.name, 80);
  if (!name) return json(res, 400, { error: "Artist name is required." });
  try {
    await db().execute({
      sql: "INSERT INTO artists (id, name) VALUES (?, ?)",
      args: [crypto.randomUUID(), name],
    });
  } catch (error) {
    if (String(error.message || error).includes("UNIQUE")) {
      return json(res, 409, { error: "That artist already exists." });
    }
    console.error(error);
    return json(res, 500, { error: "Artist couldn't be saved." });
  }
  return list(res);
}

async function rename(req, res) {
  const body = await readJson(req);
  const name = cleanText(body.name, 80);
  if (!body.id || !name) return json(res, 400, { error: "Artist name is required." });
  try {
    const result = await db().execute({
      sql: "UPDATE artists SET name = ? WHERE id = ?",
      args: [name, body.id],
    });
    if (result.rowsAffected === 0) return json(res, 404, { error: "Artist not found." });
  } catch (error) {
    if (String(error.message || error).includes("UNIQUE")) {
      return json(res, 409, { error: "That artist already exists." });
    }
    console.error(error);
    return json(res, 500, { error: "Artist couldn't be saved." });
  }
  return list(res);
}

async function remove(req, res) {
  const id = req.query?.id || new URL(req.url, "http://localhost").searchParams.get("id");
  if (!id) return json(res, 400, { error: "Artist not found." });
  await db().batch([
    { sql: "UPDATE pieces SET artist_id = NULL, collection = NULL WHERE artist_id = ?", args: [id] },
    { sql: "DELETE FROM artists WHERE id = ?", args: [id] },
  ], "write");
  return list(res);
}
