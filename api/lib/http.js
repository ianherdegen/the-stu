import crypto from "crypto";

const COOKIE = "stu_admin";

export function json(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json(body);
  return false;
}

export async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body) return JSON.parse(req.body);
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function cookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return out;
}

function sign(value) {
  const mac = crypto.createHmac("sha256", process.env.ADMIN_SESSION_SECRET || "").update(value).digest("base64url");
  return `${value}.${mac}`;
}

export function isAdmin(req) {
  const token = cookies(req)[COOKIE];
  if (!token || !process.env.ADMIN_SESSION_SECRET) return false;
  const dot = token.lastIndexOf(".");
  if (dot === -1) return false;
  const value = token.slice(0, dot);
  const expected = sign(value);
  const left = Buffer.from(token);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return false;
  const expires = Number(value);
  return Number.isFinite(expires) && expires > Date.now();
}

export function requireAdmin(req, res) {
  if (isAdmin(req)) return true;
  return json(res, 401, { error: "Sign in required." });
}

export function setSession(req, res) {
  const expires = Date.now() + 1000 * 60 * 60 * 24 * 14;
  const secure = req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${sign(String(expires))}; HttpOnly; Path=/; SameSite=Lax; Max-Age=1209600${secure}`
  );
}

export function clearSession(res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

export function passwordsMatch(input) {
  const expected = process.env.ADMIN_PASSWORD || "";
  const given = String(input || "");
  const left = Buffer.from(given);
  const right = Buffer.from(expected);
  if (!expected || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function cleanText(value, max) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (!text || text.length > max) return "";
  return text;
}
