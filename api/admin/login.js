import { clearSession, json, passwordsMatch, readJson, setSession } from "../lib/http.js";

export default async function handler(req, res) {
  if (req.method === "DELETE") {
    clearSession(res);
    return json(res, 200, { ok: true });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, DELETE");
    return json(res, 405, { error: "Method not allowed." });
  }

  if (!process.env.ADMIN_PASSWORD || !process.env.ADMIN_SESSION_SECRET) {
    return json(res, 500, { error: "Admin sign-in is not configured." });
  }

  try {
    const body = await readJson(req);
    if (!passwordsMatch(body.password)) return json(res, 401, { error: "Wrong password." });
    setSession(req, res);
    return json(res, 200, { ok: true });
  } catch (error) {
    console.error(error);
    return json(res, 400, { error: "Sign in failed." });
  }
}
