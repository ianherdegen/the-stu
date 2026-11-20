import { json } from "../lib/http.js";

const CHANNEL_ID = "UCaq5RR0xFO7qYpsmC_xjeqg";
const LIVE_URL = "https://www.youtube.com/@ItsMilwaukeeMagic/live";
const OFF = {
  live: false,
  embeddable: false,
  videoId: "",
  title: "",
  url: LIVE_URL,
  thumbnail: "",
};

function decode(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function recentVideos() {
  const response = await fetch(
    `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`,
    { signal: AbortSignal.timeout(8000) }
  );
  if (!response.ok) return [];
  const xml = await response.text();
  const videos = [];
  for (const match of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    if (videos.length >= 3) break;
    const block = match[1];
    const videoId = block.match(/<yt:videoId>([\w-]{11})<\/yt:videoId>/)?.[1];
    if (!videoId) continue;
    videos.push({
      videoId,
      title: decode(block.match(/<title>([^<]*)<\/title>/)?.[1] || ""),
      thumbnail: block.match(/<media:thumbnail url="([^"]+)"/)?.[1]
        || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    });
  }
  return videos;
}

const CLIENTS = [
  { clientName: "MWEB", clientVersion: "2.20241120.01.00" },
  { clientName: "WEB", clientVersion: "2.20241120.01.00" },
];

async function ask(videoId, client) {
  const response = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
    body: JSON.stringify({
      context: { client: { ...client, hl: "en" } },
      videoId,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  const data = await response.json();
  const details = data.microformat?.playerMicroformatRenderer?.liveBroadcastDetails;
  const status = data.playabilityStatus || {};
  return {
    live: details?.isLiveNow === true,
    known: typeof details?.isLiveNow === "boolean",
    embeddable: status.playableInEmbed === true && status.status === "OK",
    title: data.videoDetails?.title || "",
    playability: status.status || "",
    client: client.clientName,
  };
}

async function broadcast(videoId) {
  let last = null;
  for (const client of CLIENTS) {
    const result = await ask(videoId, client);
    if (!result) continue;
    last = result;
    if (result.known || result.live) return result;
  }
  return last;
}

async function fromPage() {
  const response = await fetch(LIVE_URL, {
    headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "en" },
    redirect: "follow",
    signal: AbortSignal.timeout(8000),
  });
  const html = await response.text();
  const liveAt = html.indexOf('"isLiveNow":true');
  if (liveAt === -1) return null;
  const videoId = html.slice(liveAt, liveAt + 900).match(/"externalVideoId":"([\w-]{11})"/)?.[1];
  if (!videoId) return null;
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1]?.replace(/ - YouTube$/, "").trim() || "";
  return {
    live: true,
    embeddable: html.includes('"playableInEmbed":true'),
    videoId,
    title,
    url: LIVE_URL,
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };
}

function withDebug(body, debug, enabled) {
  return enabled ? { ...body, debug } : body;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return json(res, 405, { error: "Method not allowed." });
  }

  const debugEnabled = req.query?.debug === "1";
  const debug = { videos: [], broadcasts: [], page: null, error: null };

  try {
    const videos = await recentVideos();
    debug.videos = videos.map((video) => video.videoId);
    const checks = await Promise.all(videos.map(async (video) => {
      try {
        const status = await broadcast(video.videoId);
        debug.broadcasts.push({ videoId: video.videoId, status });
        return { video, status };
      } catch (error) {
        debug.broadcasts.push({ videoId: video.videoId, error: String(error) });
        return { video, status: null };
      }
    }));
    const hit = checks.find((item) => item.status?.live);
    if (hit) {
      return json(res, 200, withDebug({
        live: true,
        embeddable: hit.status.embeddable,
        videoId: hit.video.videoId,
        title: hit.status.title || hit.video.title,
        url: LIVE_URL,
        thumbnail: hit.video.thumbnail,
      }, debug, debugEnabled));
    }
    if (checks.length && checks.every((item) => item.status?.known)) {
      return json(res, 200, withDebug(OFF, debug, debugEnabled));
    }
    const page = await fromPage();
    debug.page = page;
    return json(res, 200, withDebug(page || OFF, debug, debugEnabled));
  } catch (error) {
    debug.error = String(error);
    console.error(error);
    try {
      const page = await fromPage();
      debug.page = page;
      return json(res, 200, withDebug(page || OFF, debug, debugEnabled));
    } catch (fallbackError) {
      debug.pageError = String(fallbackError);
      console.error(fallbackError);
      return json(res, 200, withDebug(OFF, debug, debugEnabled));
    }
  }
}
