#!/usr/bin/env node
/**
 * Comprehensive Facebook scrape for Thin Red Line Holiday Lighting.
 * Follows BlueWaterTravel fb-scrape-all-albums.mjs + deep-scrape-fb.mjs patterns.
 *
 * Usage:
 *   node scripts/fb-scrape-all.mjs                  # discover albums + scrape + download
 *   node scripts/fb-scrape-all.mjs --discover-only
 *   node scripts/fb-scrape-all.mjs --download-only
 *   node scripts/fb-scrape-all.mjs --limit 3          # test first 3 albums
 */
import { chromium } from "playwright-core";
import { createRequire } from "module";
import { execSync } from "child_process";
import { join } from "path";
import {
  __dirname,
  FB_PAGE,
  FB_PAGE_URL,
  mediaId,
  scoreUrl,
  normalizeAlt,
  decodeSrc,
  loadInventory,
  saveInventory,
  loadProgress,
  saveProgress,
  loadAlbums,
  downloadPhoto,
  harvestHtml,
} from "./fb-lib.mjs";

const require = createRequire(import.meta.url);
const executablePath = require("playwright-core").chromium.executablePath();

const args = process.argv.slice(2);
const discoverOnly = args.includes("--discover-only");
const downloadOnly = args.includes("--download-only");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

if (!downloadOnly && !discoverOnly) {
  try {
    execSync(`node ${join(__dirname, "discover-fb-albums.mjs")}`, { stdio: "inherit" });
  } catch (e) {
    console.warn("Album discovery had errors, continuing with known albums");
  }
}

const albums = loadAlbums();
const progress = loadProgress();
const scrapedSet = new Set((progress.scraped || []).map((s) => s.href || s.name));
const remaining = albums.filter((a) => !scrapedSet.has(a.href)).slice(0, limit);

const byId = loadInventory();
console.error(
  JSON.stringify({
    totalAlbums: albums.length,
    remainingAlbums: remaining.length,
    inventoryPhotos: byId.size,
  })
);

if (discoverOnly) process.exit(0);

const browser = await chromium.launch({ headless: true, executablePath });
const context = await browser.newContext({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  locale: "en-US",
});
const page = await context.newPage();

async function scrapeAlbumPage() {
  return page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const found = new Map();
    function mid(src) {
      const m = src.match(/\/(\d+_\d+_\d+_[^/?]+)/);
      return m ? m[1].replace(/\.(jpg|jpeg|png|webp)$/i, "") : null;
    }
    function scUrl(src, w) {
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
        const id = mid(img.src);
        if (!id) continue;
        const alt = img.alt || "";
        if (/profile picture|cover photo/i.test(alt)) continue;
        const w = img.naturalWidth || parseInt(img.width) || 0;
        if (w > 0 && w < 80) continue;
        const prev = found.get(id);
        const sc = scUrl(img.src, w);
        if (!prev || sc > prev.score) found.set(id, { src: img.src, alt, w, source: location.href, score: sc });
      }
      const html = document.documentElement.innerHTML;
      const urlRe = /https:\/\/scontent[^"'<>\s]+/g;
      for (const url of html.match(urlRe) || []) {
        const id = mid(url);
        if (!id) continue;
        const prev = found.get(id);
        const sc = scUrl(url, 0);
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
  });
}

async function deepScrapeFeed(urls, label) {
  for (const url of urls) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.waitForTimeout(2500);
      for (let i = 0; i < 40; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(900);
      }
      const photos = await scrapeAlbumPage();
      harvestHtml(await page.content(), url, byId);
      let added = 0;
      for (const item of photos) {
        const id = mediaId(item.src);
        if (!id) continue;
        const alt = normalizeAlt(item.alt);
        const sc = scoreUrl(item.src, item.w);
        const prev = byId.get(id);
        if (!prev) added++;
        if (!prev || sc > prev.score) {
          byId.set(id, {
            src: decodeSrc(item.src),
            alt,
            w: item.w,
            source: item.source || url,
            platform: "facebook",
            score: sc,
          });
        }
      }
      console.error(`[${label}] ${url} → ${photos.length} imgs, +${added} new (total ${byId.size})`);
    } catch (e) {
      console.error(`[${label}] ${url} FAIL:`, e.message);
    }
  }
}

if (!downloadOnly) {
  // Main page feeds (deep scroll)
  await deepScrapeFeed(
    [
      `${FB_PAGE_URL}/photos`,
      `${FB_PAGE_URL}/photos_of`,
      `${FB_PAGE_URL}/posts`,
      FB_PAGE_URL,
      `https://m.facebook.com/${FB_PAGE}/photos`,
      `https://m.facebook.com/${FB_PAGE}`,
      `https://m.facebook.com/${FB_PAGE}/posts`,
    ],
    "feed"
  );

  // Each album
  for (let i = 0; i < remaining.length; i++) {
    const album = remaining[i];
    const url = `${album.href}&type=3`;
    console.error(`\n[album ${i + 1}/${remaining.length}] ${album.name}`);
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.waitForTimeout(2500);
      const photos = await scrapeAlbumPage();
      harvestHtml(await page.content(), url, byId, album.name);
      let added = 0;
      for (const item of photos) {
        const id = mediaId(item.src);
        if (!id) continue;
        const alt = normalizeAlt(item.alt, album.name);
        const sc = scoreUrl(item.src, item.w);
        const prev = byId.get(id);
        if (!prev) added++;
        if (!prev || sc > prev.score) {
          byId.set(id, {
            src: decodeSrc(item.src),
            alt,
            w: item.w,
            source: url,
            platform: "facebook",
            score: sc,
          });
        }
      }
      progress.scraped = (progress.scraped || []).filter((s) => s.href !== album.href);
      progress.scraped.push({ href: album.href, name: album.name, count: photos.length });
      saveProgress(progress);
      const total = saveInventory(byId);
      console.error(`  scraped ${photos.length}, +${added} new → inventory ${total}`);

      if (!downloadOnly) {
        let saved = 0,
          skipped = 0,
          failed = 0;
        for (const item of photos) {
          const id = mediaId(item.src);
          if (!id) continue;
          const best = byId.get(id);
          const r = await downloadPhoto(context, best.src, `fb-${id}.jpg`);
          if (r === "saved") saved++;
          else if (r === "skipped") skipped++;
          else failed++;
        }
        console.error(`  downloaded ${saved} new (${skipped} skipped, ${failed} failed)`);
      }
    } catch (e) {
      console.error(`  ERROR: ${e.message}`);
    }
  }

  saveInventory(byId);
}

// Download any missing inventory files
console.error("\nDownloading missing inventory files...");
let saved = 0,
  skipped = 0,
  failed = 0;
for (const [, item] of byId) {
  const id = mediaId(item.src);
  if (!id) continue;
  const r = await downloadPhoto(context, item.src, `fb-${id}.jpg`);
  if (r === "saved") saved++;
  else if (r === "skipped") skipped++;
  else failed++;
}
console.error(JSON.stringify({ downloadPass: { saved, skipped, failed, total: byId.size } }));

await browser.close();

// Process all raw images → images/ with EXIF strip
try {
  execSync(`python3 ${join(__dirname, "process-all-social-images.py")}`, { stdio: "inherit" });
} catch (e) {
  console.warn("Image processing failed:", e.message);
}

console.log(
  JSON.stringify({
    albums: albums.length,
    inventory: byId.size,
    downloaded: saved,
  }, null, 2)
);
