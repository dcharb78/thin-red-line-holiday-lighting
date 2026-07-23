/**
 * Shared helpers for Thin Red Line Facebook album scrape / download.
 * Adapted from BlueWaterTravel scripts/fb-lib.mjs
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

export const __dirname = dirname(fileURLToPath(import.meta.url));
export const root = join(__dirname, "..");
export const albumsPath = join(__dirname, "fb-albums.json");
export const fullPath = join(__dirname, "fb-photo-inventory-full.json");
export const legacyPath = join(__dirname, "fb-photo-inventory.json");
export const progressPath = join(__dirname, "fb-scrape-progress.json");
export const outDir = join(__dirname, "social-raw");

export const FB_PAGE = "2280588978933497";
export const FB_PAGE_URL = `https://www.facebook.com/${FB_PAGE}`;

export function decodeSrc(src) {
  return (src || "")
    .replace(/&amp;/g, "&")
    .replace(/\\u0026/g, "&")
    .replace(/\\\//g, "/");
}

export function mediaId(src) {
  const m = decodeSrc(src).match(/\/(\d+_\d+_\d+_[^/?]+)/);
  return m ? m[1].replace(/\.(jpg|jpeg|png|webp)$/i, "") : null;
}

export function scoreUrl(src, w = 0) {
  const s = decodeSrc(src);
  return (
    (w || 0) +
    (s.includes("82787-15") ? 1000 : 0) +
    (s.includes("mx1440") || s.includes("mx1536") || s.includes("mx2048") || s.includes("mx1347") ? 500 : 0) +
    (s.includes("s960x960") || s.includes("s1080x1080") || s.includes("p1280x605") ? 400 : 0) +
    (s.includes("p130x130") || s.includes("p240x240") || s.includes("s100x100") ? -500 : 0) +
    s.length
  );
}

export function normalizeAlt(alt, fallback = "") {
  const a = alt || "";
  if (a === "No photo description available.") return fallback;
  if (/profile picture|cover photo/i.test(a)) return fallback;
  return a;
}

export function loadInventory() {
  for (const p of [fullPath, legacyPath, join(__dirname, "social-inventory.json")]) {
    if (!existsSync(p)) continue;
    const raw = JSON.parse(readFileSync(p, "utf8"));
    const photos = Array.isArray(raw) ? raw : raw.photos || [];
    return new Map(
      photos
        .map((item) => {
          const id = mediaId(item.src);
          if (!id) return null;
          return [id, { ...item, src: decodeSrc(item.src), score: scoreUrl(item.src, item.w) }];
        })
        .filter(Boolean)
    );
  }
  return new Map();
}

export function saveInventory(byId) {
  const photos = [...byId.values()].map(({ src, alt, w, source, platform }) => ({
    src: decodeSrc(src),
    alt: alt || "",
    w: w || 0,
    source: source || "",
    platform: platform || "facebook",
  }));
  writeFileSync(fullPath, JSON.stringify({ count: photos.length, scrapedAt: new Date().toISOString(), photos }, null, 2));
  writeFileSync(legacyPath, JSON.stringify(photos, null, 2));
  return photos.length;
}

export function loadProgress() {
  if (!existsSync(progressPath)) return { scraped: [], albums: [] };
  return JSON.parse(readFileSync(progressPath, "utf8"));
}

export function saveProgress(progress) {
  writeFileSync(progressPath, JSON.stringify(progress, null, 2));
}

export function loadAlbums() {
  if (!existsSync(albumsPath)) return [];
  const data = JSON.parse(readFileSync(albumsPath, "utf8"));
  return (data.albums || []).map((a, i) => ({ ...a, index: i }));
}

export function saveAlbums(albums) {
  writeFileSync(albumsPath, JSON.stringify({ count: albums.length, scrapedAt: new Date().toISOString(), albums }, null, 2));
}

export async function downloadPhoto(context, src, filename) {
  mkdirSync(outDir, { recursive: true });
  const filepath = join(outDir, filename);
  if (existsSync(filepath)) return "skipped";
  try {
    const url = decodeSrc(src);
    const response = await context.request.get(url);
    if (!response.ok()) return `fail:${response.status()}`;
    const buf = await response.body();
    if (buf.length < 800) return "fail:tiny";
    writeFileSync(filepath, buf);
    return "saved";
  } catch (e) {
    return `err:${e.message}`;
  }
}

export function harvestHtml(html, source, byId, albumName = "") {
  const decoded = html.replace(/\\u([\dA-Fa-f]{4})/g, (_, c) => String.fromCharCode(parseInt(c, 16)));
  const urlRe = /https:\\\/\\\/scontent[^"\\]+|https:\/\/scontent[^"'<>\s\\]+/g;
  for (const raw of decoded.match(urlRe) || []) {
    const url = decodeSrc(raw.replace(/\\\//g, "/"));
    if (!url.includes("scontent") || url.includes("hsts-pixel") || url.includes("rsrc.php")) continue;
    const id = mediaId(url);
    if (!id) continue;
    const sc = scoreUrl(url);
    const prev = byId.get(id);
    if (!prev || sc > prev.score) {
      byId.set(id, { src: url, alt: albumName, w: 0, source, platform: "facebook", score: sc });
    }
  }
}

export const scrapeAlbumPageExpr = `
async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const found = new Map();
  function mediaId(src) {
    const m = src.match(/\\/(\\d+_\\d+_\\d+_[^/?]+)/);
    return m ? m[1].replace(/\\.(jpg|jpeg|png|webp)$/i, "") : null;
  }
  function scoreUrl(src, w) {
    return (
      (w || 0) +
      (src.includes("82787-15") ? 1000 : 0) +
      (src.includes("mx1440") || src.includes("mx1536") || src.includes("mx2048") ? 500 : 0) +
      (src.includes("p130x130") || src.includes("p240x240") ? -500 : 0) +
      src.length
    );
  }
  function collect() {
    for (const img of document.querySelectorAll("img")) {
      if (!img.src?.includes("scontent")) continue;
      const id = mediaId(img.src);
      if (!id) continue;
      const alt = img.alt || "";
      if (/profile picture|cover photo/i.test(alt)) continue;
      const w = img.naturalWidth || parseInt(img.width) || 0;
      if (w > 0 && w < 80) continue;
      const prev = found.get(id);
      const sc = scoreUrl(img.src, w);
      if (!prev || sc > prev.score) found.set(id, { src: img.src, alt, w, source: location.href, score: sc });
    }
    const html = document.documentElement.innerHTML;
    const urlRe = /https:\\/\\/scontent[^"'\\\\<>\\s]+/g;
    for (const url of html.match(urlRe) || []) {
      const id = mediaId(url);
      if (!id) continue;
      const prev = found.get(id);
      const sc = scoreUrl(url, 0);
      if (!prev || sc > prev.score) found.set(id, { src: url, alt: "", w: 0, source: location.href, score: sc });
    }
  }
  let last = 0;
  let stable = 0;
  for (let i = 0; i < 150; i++) {
    window.scrollTo(0, document.body.scrollHeight);
    await sleep(600);
    collect();
    const n = found.size;
    if (n === last) stable++;
    else stable = 0;
    last = n;
    if (stable >= 8) break;
  }
  return [...found.values()].map(({ src, alt, w, source }) => ({
    src,
    alt: alt === "No photo description available." ? "" : alt,
    w,
    source,
  }));
}
`;
