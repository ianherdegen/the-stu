import crypto from "crypto";
import Busboy from "busboy";
import { del, put } from "@vercel/blob";
import { db, ensureSchema } from "../lib/db.js";
import { cleanText, json, readJson, requireAdmin } from "../lib/http.js";

export const config = {
  api: { bodyParser: false },
};

const TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

function ratioOf(value) {
  return value === "4:5" ? "4:5" : "3:4";
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  try {
    await ensureSchema();
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: "Database is not available." });
  }

  if (req.method === "GET") return list(res);
  if (req.method === "POST") return save(req, res, null);
  if (req.method === "PATCH") {
    const id = req.query?.id || new URL(req.url, "http://localhost").searchParams.get("id");
    if (!id) return json(res, 400, { error: "Piece not found." });
    return save(req, res, id);
  }
  if (req.method === "DELETE") return remove(req, res);
  res.setHeader("Allow", "GET, POST, PATCH, DELETE");
  return json(res, 405, { error: "Method not allowed." });
}

async function list(res) {
  const result = await db().execute(`
    SELECT p.id, p.title, p.artist_id, COALESCE(a.name, '') AS artist,
           COALESCE(p.collection, '') AS collection, p.description,
           COALESCE(p.image_url, '') AS image_url,
           CASE WHEN p.ratio = '4:5' THEN '4:5' ELSE '3:4' END AS ratio
    FROM pieces p
    LEFT JOIN artists a ON a.id = p.artist_id
    ORDER BY p.created_at DESC
  `);
  return json(res, 200, {
    pieces: result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      artistId: row.artist_id || "",
      artist: row.artist,
      collection: row.collection,
      description: row.description,
      imageUrl: row.image_url,
      ratio: row.ratio,
    })),
  });
}

function readForm(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers, limits: { fileSize: 4 * 1024 * 1024 } });
    const fields = {};
    let file = null;
    let tooBig = false;
    busboy.on("field", (name, value) => {
      fields[name] = value;
    });
    busboy.on("file", (name, stream, info) => {
      const chunks = [];
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("limit", () => {
        tooBig = true;
      });
      stream.on("end", () => {
        if (!info.filename) return;
        file = { buffer: Buffer.concat(chunks), mime: info.mimeType };
      });
    });
    busboy.on("error", reject);
    busboy.on("finish", () => {
      if (tooBig) reject(new Error("Image must be under 4MB."));
      else resolve({ fields, file });
    });
    req.pipe(busboy);
  });
}

async function save(req, res, existingId) {
  let form;
  try {
    const type = req.headers["content-type"] || "";
    if (type.includes("application/json")) {
      const body = await readJson(req);
      let file = null;
      if (body.image?.data) {
        const buffer = Buffer.from(String(body.image.data), "base64");
        if (!buffer.length) return json(res, 400, { error: "Add an image." });
        if (buffer.length > 4 * 1024 * 1024) return json(res, 400, { error: "Image must be under 4MB." });
        file = { buffer, mime: body.image.type || "image/jpeg" };
      }
      form = {
        fields: {
          title: body.title,
          artistId: body.artistId,
          collection: body.collection,
          description: body.description,
          ratio: body.ratio,
        },
        file,
      };
    } else {
      form = await readForm(req);
    }
  } catch (error) {
    return json(res, 400, { error: error.message || "Couldn't read the upload." });
  }

  const title = cleanText(form.fields.title, 120);
  if (!title) return json(res, 400, { error: "Title is required." });
  const description = String(form.fields.description || "").trim().slice(0, 2000);
  let artistId = String(form.fields.artistId || "").trim();
  let collection = cleanText(form.fields.collection, 80);

  if (artistId) {
    const artist = await db().execute({ sql: "SELECT id FROM artists WHERE id = ?", args: [artistId] });
    if (!artist.rows.length) return json(res, 400, { error: "Pick an artist or leave it unspecified." });
  } else {
    artistId = "";
    collection = "";
  }

  let current = null;
  let ratio = "3:4";
  if (existingId) {
    const found = await db().execute({
      sql: "SELECT image_url, ratio FROM pieces WHERE id = ?",
      args: [existingId],
    });
    if (!found.rows.length) return json(res, 404, { error: "Piece not found." });
    current = found.rows[0].image_url;
    ratio = ratioOf(found.rows[0].ratio);
  } else if (!form.file) {
    return json(res, 400, { error: "Add an image." });
  }
  if (form.file) ratio = ratioOf(form.fields.ratio);

  let imageUrl = current || "";
  let uploaded = "";
  if (form.file) {
    const ext = TYPES[form.file.mime];
    if (!ext || !form.file.buffer.length) return json(res, 400, { error: "Use a JPG, PNG, WEBP, or GIF." });
    try {
      const blob = await put(`art/${crypto.randomUUID()}.${ext}`, form.file.buffer, {
        access: "public",
        contentType: form.file.mime,
      });
      uploaded = blob.url;
      imageUrl = uploaded;
    } catch (error) {
      console.error(error);
      return json(res, 500, { error: "Image couldn't be uploaded." });
    }
  }

  try {
    if (existingId) {
      await db().execute({
        sql: `UPDATE pieces
              SET title = ?, artist_id = ?, collection = ?, description = ?, image_url = ?, ratio = ?
              WHERE id = ?`,
        args: [title, artistId || null, collection || null, description, imageUrl || null, ratio, existingId],
      });
    } else {
      await db().execute({
        sql: `INSERT INTO pieces (id, title, artist_id, collection, description, image_url, ratio)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [crypto.randomUUID(), title, artistId || null, collection || null, description, imageUrl, ratio],
      });
    }
  } catch (error) {
    console.error(error);
    if (uploaded) await del(uploaded).catch(() => {});
    return json(res, 500, { error: "Piece couldn't be saved." });
  }

  if (uploaded && current && current !== uploaded) await del(current).catch(() => {});
  return list(res);
}

async function remove(req, res) {
  const id = req.query?.id || new URL(req.url, "http://localhost").searchParams.get("id");
  if (!id) return json(res, 400, { error: "Piece not found." });
  const found = await db().execute({ sql: "SELECT image_url FROM pieces WHERE id = ?", args: [id] });
  await db().execute({ sql: "DELETE FROM pieces WHERE id = ?", args: [id] });
  const image = found.rows[0]?.image_url;
  if (image) await del(image).catch(() => {});
  return list(res);
}
