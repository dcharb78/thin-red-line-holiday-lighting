#!/usr/bin/env python3
"""
Batch-process all scraped Facebook raw images:
- Apply EXIF orientation, strip ALL metadata (GPS, camera serial, etc.)
- Resize for web, save optimized JPEG to images/gallery-fb-{id}.jpg
- Write scripts/processed-images.json manifest for gallery HTML generation

Usage: python3 scripts/process-all-social-images.py
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "scripts" / "social-raw"
OUT_DIR = ROOT / "images"
INVENTORY_PATH = ROOT / "scripts" / "fb-photo-inventory.json"
MANIFEST_PATH = ROOT / "scripts" / "processed-images.json"

MAX_WIDTH = 1400
QUALITY = 82
MIN_BYTES = 1500


def fb_id_from_name(name: str) -> str:
    m = re.match(r"fb-(.+)\.jpg$", name)
    return m.group(1) if m else name.replace(".jpg", "")


def alt_from_inventory(fb_id: str, inventory: dict) -> str:
    for item in inventory.get("photos", []):
        src = item.get("src", "")
        if fb_id.replace("-", "_") in src or fb_id in src:
            alt = item.get("alt", "")
            if alt and alt != "No photo description available.":
                return alt
    return "Christmas light installation by Thin Red Line Holiday Lighting"


def process_image(src_path: Path, dest_path: Path) -> dict:
    with Image.open(src_path) as img:
        img = ImageOps.exif_transpose(img)
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        w, h = img.size
        if w > MAX_WIDTH:
            ratio = MAX_WIDTH / w
            img = img.resize((MAX_WIDTH, int(h * ratio)), Image.Resampling.LANCZOS)
        out_w, out_h = img.size
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        img.save(dest_path, format="JPEG", quality=QUALITY, optimize=True)

    with Image.open(dest_path) as check:
        exif = check.getexif()

    return {"width": out_w, "height": out_h, "exif_stripped": len(exif) == 0}


def main() -> None:
    inventory = {}
    if INVENTORY_PATH.exists():
        raw = json.loads(INVENTORY_PATH.read_text())
        inventory = raw if isinstance(raw, dict) else {"photos": raw}

    results = []
    raw_files = sorted(RAW_DIR.glob("fb-*.jpg"))
    processed = 0
    skipped = 0

    for raw_path in raw_files:
        if raw_path.stat().st_size < MIN_BYTES:
            skipped += 1
            continue
        fb_id = fb_id_from_name(raw_path.name)
        slug = f"gallery-fb-{fb_id[:60]}"
        dest = OUT_DIR / f"{slug}.jpg"
        meta = process_image(raw_path, dest)
        alt = alt_from_inventory(fb_id, inventory)
        entry = {
            "slug": slug,
            "output": str(dest.relative_to(ROOT)),
            "source": raw_path.name,
            "alt": alt,
            "platform": "facebook",
            "pageUrl": "https://www.facebook.com/2280588978933497",
            **meta,
        }
        results.append(entry)
        processed += 1

    def hero_score(entry: dict) -> float:
        w, h = entry["width"], entry["height"]
        if w < 800 or h < 450:
            return 0.0
        ratio = w / h if h else 0
        if ratio > 2.2 or ratio < 0.55:
            return 0.0
        return w * h

    candidates = sorted(results, key=hero_score, reverse=True)
    if candidates and hero_score(candidates[0]) > 0:
        best = OUT_DIR / f"{candidates[0]['slug']}.jpg"
        hero = OUT_DIR / "hero-installation.jpg"
        if best.exists() and not hero.exists():
            process_image(best, hero)
            candidates[0]["role"] = "hero"

    MANIFEST_PATH.write_text(json.dumps({"count": len(results), "processed": results}, indent=2))
    print(f"Processed {processed} images, skipped {skipped} tiny files → {MANIFEST_PATH}")


if __name__ == "__main__":
    main()
