import { json } from "../lib/http.js";

const LIVE_URL = "https://www.youtube.com/@ItsMilwaukeeMagic/live";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return json(res, 405, { error: "Method not allowed." });
  }

  try {
    const response = await fetch(LIVE_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept-Language": "en",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    const html = await response.text();
    const liveAt = html.indexOf('"isLiveNow":true');
    const nearby = liveAt === -1 ? "" : html.slice(liveAt, liveAt + 900);
    const videoId = nearby.match(/"externalVideoId":"([\w-]{11})"/)?.[1] || null;
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1]?.replace(/ - YouTube$/, "").trim() || "Milwaukee Magic";
    const live = liveAt !== -1 && Boolean(videoId);

    return json(res, 200, {
      live,
      embeddable: live && html.includes('"playableInEmbed":true'),
      videoId: live ? videoId : "",
      title: live ? title : "",
      url: LIVE_URL,
      thumbnail: live ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "",
    });
  } catch (error) {
    console.error(error);
    return json(res, 200, { live: false });
  }
}
