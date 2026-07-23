#!/usr/bin/env node
/**
 * Regenerate gallery section in index.html from processed-images.json
 */
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const manifestPath = join(__dirname, "processed-images.json");
const indexPath = join(root, "index.html");

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const photos = [...(manifest.processed || [])];

photos.sort((a, b) => {
  if (a.role === "hero") return -1;
  if (b.role === "hero") return 1;
  return (b.width || 0) - (a.width || 0);
});

const items = photos.map((p, i) => {
  const src = `/${p.output}`;
  const featured = i === 0 ? " gallery-item-featured" : "";
  const caption = p.alt && p.alt.length > 10 ? p.alt : 'Professional holiday light installation';
  return `          <figure class="gallery-item${featured}">
            <img src="${src}" alt="${p.alt.replace(/"/g, "&quot;")}" loading="lazy" width="${p.width}" height="${p.height}">
            <figcaption>${caption}</figcaption>
          </figure>`;
});

const galleryBlock = `        <div class="gallery-grid gallery-grid-large">
${items.join("\n")}
        </div>
        <p class="gallery-attribution">
          ${photos.length} photos from our
          <a href="https://www.facebook.com/2280588978933497" rel="noopener noreferrer" target="_blank">Facebook</a>
          page and albums. Also on
          <a href="https://www.instagram.com/thinredlineholidaylighting/" rel="noopener noreferrer" target="_blank">Instagram</a> and
          <a href="https://www.tiktok.com/@thinredlineholidaylights" rel="noopener noreferrer" target="_blank">TikTok</a>.
        </p>`;

let html = readFileSync(indexPath, "utf8");
const re = /(<section id="gallery">[\s\S]*?<header class="section-header">[\s\S]*?<\/header>\n)[\s\S]*?(<\/div>\n    <\/section>)/;
if (!re.test(html)) throw new Error("Could not find gallery section");
html = html.replace(re, `$1${galleryBlock}\n      $2`);
writeFileSync(indexPath, html);
console.log(`Updated gallery with ${photos.length} photos`);
