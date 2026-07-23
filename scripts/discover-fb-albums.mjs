#!/usr/bin/env node
/**
 * Discover all public Facebook albums for Thin Red Line Holiday Lighting.
 * Adapted from BlueWaterTravel album discovery workflow.
 *
 * Usage: node scripts/discover-fb-albums.mjs
 */
import { chromium } from "playwright-core";
import { createRequire } from "module";
import {
  FB_PAGE,
  FB_PAGE_URL,
  saveAlbums,
  loadAlbums,
  decodeSrc,
} from "./fb-lib.mjs";

const require = createRequire(import.meta.url);
const executablePath = require("playwright-core").chromium.executablePath();

const SEED_URLS = [
  `${FB_PAGE_URL}/photos`,
  `${FB_PAGE_URL}/photos_albums`,
  `https://m.facebook.com/${FB_PAGE}/photos`,
  `https://m.facebook.com/${FB_PAGE}/photos_albums`,
  FB_PAGE_URL,
];

const browser = await chromium.launch({ headless: true, executablePath });
const page = await browser.newPage({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
});

const albums = new Map();

function addAlbum(href, name) {
  if (!href) return;
  let url = decodeSrc(href);
  if (url.startsWith("/")) url = `https://www.facebook.com${url}`;
  if (!url.includes("set=a.") && !url.includes("/album/")) return;
  const setMatch = url.match(/set=a\.(\d+)/);
  if (!setMatch) return;
  const key = setMatch[1];
  const cleanHref = `https://www.facebook.com/media/set/?set=a.${key}`;
  const cleanName = (name || `Album ${key}`).trim().slice(0, 120);
  if (/profile pictures|cover photos|timeline photos|view profile cover/i.test(cleanName)) return;
  albums.set(key, { href: cleanHref, name: cleanName });
}

for (const url of SEED_URLS) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(2500);
    for (let i = 0; i < 30; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(800);
    }

    const found = await page.evaluate(() => {
      const results = [];
      for (const a of document.querySelectorAll('a[href*="set=a."], a[href*="/album/"]')) {
        results.push({ href: a.href, name: a.innerText?.trim() || a.getAttribute("aria-label") || "" });
      }
      return results;
    });

    for (const { href, name } of found) addAlbum(href, name);

    const html = await page.content();
    for (const m of html.matchAll(/media\/set\/\?set=a\.(\d+)/g)) {
      addAlbum(`https://www.facebook.com/media/set/?set=a.${m[1]}`, "");
    }
    for (const m of html.matchAll(/"album_id":"(\d+)"/g)) {
      addAlbum(`https://www.facebook.com/media/set/?set=a.${m[1]}`, "");
    }

    console.error(`[${url}] albums so far: ${albums.size}`);
  } catch (e) {
    console.error(`[${url}] FAIL:`, e.message);
  }
}

await browser.close();

const existing = loadAlbums();
for (const a of existing) {
  const key = a.href.match(/set=a\.(\d+)/)?.[1];
  if (key && !albums.has(key)) albums.set(key, { href: a.href, name: a.name });
}

const list = [...albums.values()].sort((a, b) => a.name.localeCompare(b.name));
saveAlbums(list);
console.log(JSON.stringify({ count: list.length, albums: list.map((a) => a.name) }, null, 2));
