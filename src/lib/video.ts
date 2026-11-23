/**
 * Lesson videos are curated links; Lenigo hosts no video. YouTube is the primary source
 * (embedded in-app, watch time tracked through the player API). Google Drive files are
 * embedded through Drive's preview player. Anything else is an https link opened in a new tab.
 *
 * Curators paste a link; the server keeps only a validated id for YouTube/Drive and always
 * rebuilds watch/embed URLs from it, never from what was pasted.
 */
export type VideoProvider = "YOUTUBE" | "GOOGLE_DRIVE" | "EXTERNAL";
export type VideoSource = { provider: VideoProvider; providerId: string | null; url: string };

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const DRIVE_ID = /^[A-Za-z0-9_-]{20,}$/;
const YT_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtube-nocookie.com", "youtube-nocookie.com"]);
const DRIVE_HOSTS = new Set(["drive.google.com", "docs.google.com"]);

function toUrl(input: string): URL | null {
  try {
    const url = new URL(input.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

/** YouTube id from a watch, youtu.be, shorts, embed or live URL (or a bare id). */
export function parseYouTubeId(input: string): string | null {
  if (YT_ID.test(input.trim())) return input.trim();
  const url = toUrl(input);
  if (!url || !YT_HOSTS.has(url.hostname.toLowerCase())) return null;
  let id: string | null = null;
  if (url.hostname.endsWith("youtu.be")) id = url.pathname.split("/")[1] ?? null;
  else if (url.pathname === "/watch") id = url.searchParams.get("v");
  else {
    const [, kind, value] = url.pathname.split("/");
    if (kind === "shorts" || kind === "embed" || kind === "live" || kind === "v") id = value ?? null;
  }
  return id && YT_ID.test(id) ? id : null;
}

/** Drive file id from /file/d/<id>/view, /open?id=<id> or /uc?id=<id>. */
export function parseDriveId(input: string): string | null {
  const url = toUrl(input);
  if (!url || !DRIVE_HOSTS.has(url.hostname.toLowerCase())) return null;
  const m = url.pathname.match(/\/file\/d\/([^/]+)/);
  const id = m?.[1] ?? url.searchParams.get("id");
  return id && DRIVE_ID.test(id) ? id : null;
}

/** Classifies a pasted lesson link. Returns null if it isn't a usable https link. */
export function parseVideoSource(input: string): VideoSource | null {
  const yt = parseYouTubeId(input);
  if (yt) return { provider: "YOUTUBE", providerId: yt, url: youTubeWatchUrl(yt) };
  const drive = parseDriveId(input);
  if (drive) return { provider: "GOOGLE_DRIVE", providerId: drive, url: `https://drive.google.com/file/d/${drive}/view` };
  const url = toUrl(input);
  if (!url || url.protocol !== "https:") return null;
  return { provider: "EXTERNAL", providerId: null, url: url.toString() };
}

export const youTubeWatchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
export const youTubeThumbnail = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

/** In-app player URL, or null when the video must open in a new tab. */
export function embedUrl(source: { provider: VideoProvider; providerId: string | null }): string | null {
  if (source.provider === "YOUTUBE" && source.providerId)
    return `https://www.youtube-nocookie.com/embed/${source.providerId}?enablejsapi=1&rel=0&modestbranding=1`;
  if (source.provider === "GOOGLE_DRIVE" && source.providerId) return `https://drive.google.com/file/d/${source.providerId}/preview`;
  return null;
}

/**
 * How the server credits watch time:
 *  player     YouTube player events (position + heartbeat), capped by wall-clock time
 *  time-on-page  Drive preview has no player API: heartbeats while the lesson is open, capped at the video length
 *  none       external link: can't be verified; the module still requires its checkpoints and capstone
 */
export function trackingFor(provider: VideoProvider): "player" | "time-on-page" | "none" {
  return provider === "YOUTUBE" ? "player" : provider === "GOOGLE_DRIVE" ? "time-on-page" : "none";
}

/** "Learn more" articles: external https links only (no javascript:, data:, http:). */
export function parseArticleUrl(input: string): string | null {
  const url = toUrl(input);
  return url && url.protocol === "https:" ? url.toString() : null;
}
