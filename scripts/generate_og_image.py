#!/usr/bin/env python3
"""Generate festive og-image.jpg (1200x630) for social sharing."""
from PIL import Image, ImageDraw, ImageFont
import math
import os

W, H = 1200, 630
OUT = os.path.join(os.path.dirname(__file__), '..', 'images', 'og-image.jpg')

# Palette
MIDNIGHT = (10, 18, 32)
EVERGREEN = (27, 67, 50)
EVERGREEN_D = (15, 45, 32)
CRANBERRY = (185, 28, 60)
GOLD = (232, 197, 71)
WARM = (255, 248, 231)
SNOW = (255, 255, 255, 180)

img = Image.new('RGB', (W, H), MIDNIGHT)
draw = ImageDraw.Draw(img, 'RGBA')

# Night sky gradient
for y in range(H):
    t = y / H
    r = int(MIDNIGHT[0] * (1 - t * 0.3) + EVERGREEN_D[0] * t * 0.3)
    g = int(MIDNIGHT[1] * (1 - t * 0.3) + EVERGREEN_D[1] * t * 0.3)
    b = int(MIDNIGHT[2] * (1 - t * 0.3) + EVERGREEN_D[2] * t * 0.3)
    draw.line([(0, y), (W, y)], fill=(r, g, b))

# Soft snow on ground
for y in range(H - 80, H):
    alpha = int(30 + (y - (H - 80)) * 1.2)
    draw.line([(0, y), (W, y)], fill=(255, 255, 255, min(alpha, 60)))

# Snowflakes
import random
random.seed(42)
for _ in range(55):
    x, y = random.randint(0, W), random.randint(0, H - 100)
    s = random.randint(1, 3)
    draw.ellipse([x - s, y - s, x + s, y + s], fill=(255, 255, 255, random.randint(40, 120)))

# House silhouette with warm glow
hx, hy, hw, hh = 380, 280, 440, 260
draw.polygon([(hx, hy + hh), (hx + hw // 2, hy - 60), (hx + hw, hy + hh)], fill=(20, 35, 28))
draw.rectangle([hx + 60, hy + 80, hx + hw - 60, hy + hh], fill=(25, 42, 35))
# Windows glow
for wx in [hx + 100, hx + hw - 160]:
    draw.rectangle([wx, hy + 140, wx + 60, hy + 200], fill=(255, 220, 140, 200))
    draw.rectangle([wx - 8, hy + 132, wx + 68, hy + 208], fill=(255, 200, 80, 40))

# Roofline light bulbs
bulb_colors = [GOLD, WARM[:3], CRANBERRY, (45, 106, 79), GOLD, WARM[:3]]
n_bulbs = 18
for i in range(n_bulbs):
    t = i / (n_bulbs - 1)
    bx = hx + 20 + t * (hw - 40)
    by = hy + 20 + abs(t - 0.5) * 80
    color = bulb_colors[i % len(bulb_colors)]
    # glow
    for r, a in [(18, 30), (12, 60), (7, 180)]:
        draw.ellipse([bx - r, by - r, bx + r, by + r], fill=(*color, a))
    draw.ellipse([bx - 5, by - 5, bx + 5, by + 5], fill=color)

# String lights garland top
for i in range(24):
    x = 30 + i * ((W - 60) / 23)
    y = 28 + math.sin(i * 0.7) * 8
    c = bulb_colors[i % len(bulb_colors)]
    draw.ellipse([x - 7, y - 7, x + 7, y + 7], fill=(*c, 50))
    draw.ellipse([x - 4, y - 4, x + 4, y + 4], fill=c)

# Wreath circles left/right
for cx in [90, W - 90]:
    draw.ellipse([cx - 35, 120, cx + 35, 190], outline=(*EVERGREEN, 200), width=6)
    draw.ellipse([cx - 28, 127, cx + 28, 183], outline=(*CRANBERRY, 150), width=3)
    draw.ellipse([cx - 5, 145, cx + 5, 155], fill=CRANBERRY)

# Text
try:
    title_font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Georgia.ttf', 52)
    sub_font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Georgia.ttf', 28)
    badge_font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 22)
except OSError:
    title_font = ImageFont.load_default()
    sub_font = title_font
    badge_font = title_font

draw.text((W // 2, 480), 'Thin Red Line Holiday Lighting', fill=GOLD, font=title_font, anchor='mm')
draw.text((W // 2, 540), 'Professional Christmas Light Installation', fill=WARM[:3], font=sub_font, anchor='mm')
draw.text((W // 2, 590), 'Clarksville · Nashville · Bowling Green', fill=(168, 184, 204), font=badge_font, anchor='mm')

# Frost border
draw.rectangle([8, 8, W - 8, H - 8], outline=(*GOLD, 80), width=2)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
img.save(OUT, 'JPEG', quality=92)
print(f'Wrote {OUT}')
