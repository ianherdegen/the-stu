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

async function broadcast(videoId) {
  const response = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
    body: JSON.stringify({
      context: { client: { clientName: "WEB", clientVersion: "2.20241120.01.00", hl: "en" } },
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
    embeddable: status.playableInEmbed === true && status.status === "OK",
    title: data.videoDetails?.title || "",
  };
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

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return json(res, 405, { error: "Method not allowed." });
  }

  try {
    const videos = await recentVideos();
    const checks = await Promise.all(videos.map(async (video) => ({
      video,
      status: await broadcast(video.videoId).catch(() => null),
    })));
    const hit = checks.find((item) => item.status?.live);
    if (hit) {
      return json(res, 200, {
        live: true,
        embeddable: hit.status.embeddable,
        videoId: hit.video.videoId,
        title: hit.status.title || hit.video.title,
        url: LIVE_URL,
        thumbnail: hit.video.thumbnail,
      });
    }
    if (checks.some((item) => item.status)) return json(res, 200, OFF);
    return json(res, 200, (await fromPage()) || OFF);
  } catch (error) {
    console.error(error);
    try {
      return json(res, 200, (await fromPage()) || OFF);
    } catch (fallbackError) {
      console.error(fallbackError);
      return json(res, 200, OFF);
    }
  }
}
