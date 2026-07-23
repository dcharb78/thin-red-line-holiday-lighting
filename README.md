# Thin Red Line Holiday Lighting — Website

SEO-optimized static website for [Thin Red Line Holiday Lighting](https://thinredlineholidaylighting.com/), built for **Cloudflare Pages** deployment.

## Quick start (local)

```bash
# From repo root
python3 -m http.server 8080
# or
npx serve .
```

Open [http://localhost:8080](http://localhost:8080)

## Deploy to Cloudflare Pages

### Option A: Git integration (recommended)

1. Push this repo to GitHub/GitLab.
2. In [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Select the repository and configure:
   - **Framework preset:** None
   - **Build command:** *(leave empty)*
   - **Build output directory:** `/` (repository root)
4. Deploy. Cloudflare serves `index.html`, `404.html`, `robots.txt`, `sitemap.xml`, `_headers`, `_redirects`, and Pages Functions automatically.

### Option B: Wrangler CLI

```bash
npm install -g wrangler
wrangler pages deploy . --project-name=thin-red-line-holiday-lighting
```

### Custom domain

1. In Pages project → **Custom domains** → add `thinredlineholidaylighting.com`.
2. Update DNS at your registrar (Cloudflare will provide CNAME or A records).
3. Enable **Always Use HTTPS** and **Automatic HTTPS Rewrites** in Cloudflare SSL/TLS settings.

### Preview deployments

Preview URLs use `*.pages.dev`. Absolute URLs in meta tags and JSON-LD point to production (`thinredlineholidaylighting.com`).

## Project structure

```
index.html              Main page (hero, gallery, services, estimator, FAQ, contact)
404.html                Custom not-found page
css/styles.css          Festive Christmas-themed styles
js/config.js            Site URL, business info, estimator rates, optional API key
js/estimator.js         Roof/light estimator (Google Solar → OSM → manual)
js/main.js              Navigation, contact form → SMS
js/visualize.js         "See Your Home Glow" — photo upload + roofline lights preview
functions/api/solar.js  Cloudflare Pages Function — proxies Google Solar API
functions/api/roofline.js  Optional Gemini Vision roofline auto-detect
images/                 Company photos + og-image.jpg (festive social preview)
scripts/generate_og_image.py  Regenerate og-image.jpg
_headers / _redirects   Cloudflare Pages config
wrangler.toml           Pages project metadata
```

## Roof / light line estimator

### Data sources (priority order)

1. **Google Solar API** (when configured) — measured roof area, segment count, and pitch via [Building Insights](https://developers.google.com/maps/documentation/solar/building-insights). Same approach as the RoofingLeads project.
2. **OpenStreetMap** (Overpass + Nominatim) — building footprint polygon, no API key.
3. **Manual entry** — square footage with perimeter approximation.

### Google Solar API setup

1. Create a [Google Cloud project](https://console.cloud.google.com/) and enable **Solar API** (requires billing; Google provides free monthly credits).
2. Create an API key. Under **API restrictions**, allow **Solar API** only.
3. Under **Application restrictions**, use **None** for the Cloudflare proxy key (Pages Functions call Google from Cloudflare IPs, not your browser — IP or HTTP referrer locks will cause `403 API_KEY_IP_ADDRESS_BLOCKED`). RoofingLeads may use a separate key restricted to your local IP for dev.
4. **Recommended (keeps key server-side):** In Cloudflare Pages → **Settings** → **Environment variables**, add:
   ```
   GOOGLE_MAPS_API_KEY=your-key-here
   ```
   The `/api/solar` Pages Function proxies requests to Google.
5. **Optional client-side fallback:** Set `googleMapsApiKey` in `js/config.js` (restrict that key to your domain in Google Cloud Console).

Without a key, the estimator falls back to OpenStreetMap footprints and manual entry.

**Troubleshooting:** If `/api/solar` returns `403` with `API_KEY_IP_ADDRESS_BLOCKED`, edit the key in [Google Cloud Credentials](https://console.cloud.google.com/apis/credentials) and remove IP address restrictions (or create a dedicated server key for Cloudflare).

## See Your Home Glow (photo visualizer)

Interactive client-side preview: upload a house photo, trace the roofline by tapping/clicking, and overlay warm Christmas lights on canvas.

### How it works

1. **Upload** — JPG/PNG photo stays in the browser (never uploaded unless you use auto-detect).
2. **Trace roofline** — Click or tap along eaves and peaks; lights render automatically along your path.
3. **Customize** — Warm white, red/green, gold, or cranberry palettes; C7/C9 bulb sizes.
4. **Download / share** — Save PNG preview or share via mobile Web Share API.

### Optional AI roofline detection

`POST /api/roofline` with `{ "image": "data:image/jpeg;base64,..." }` uses **Gemini Vision** to suggest roofline points when configured:

```
GEMINI_API_KEY=your-gemini-api-key
```

Set in Cloudflare Pages → **Settings** → **Environment variables**. Enable the [Generative Language API](https://ai.google.dev/) on your Google Cloud project. Without this key, manual tracing works fully — the UI shows a friendly fallback message.

Regenerate the festive social preview image:

```bash
python3 scripts/generate_og_image.py
```

### Pricing & adjustments

Configurable in `js/config.js`: `$8–$15/linear foot` installed. Adjustments for story count, roof type, coverage (front / front+sides / full), and segment complexity (Google Solar).

## Photos

Real photos sourced from [thinredlineholidaylighting.com](https://thinredlineholidaylighting.com/) (GoDaddy-hosted public images):

| File | Source |
|------|--------|
| `hero-installation.jpg` | Main site hero — Christmas light installation |
| `gallery-residential.jpg` | Site gallery thumbnail |
| `about-team.jpg` | About page — installation team |
| `logo.png` | Company logo |

Attribution links to the company website and social profiles in the gallery section.

## Design

Festive **Christmas light installation** identity — professional, not cartoonish:

- **Evergreen + cranberry** on a deep winter-night base
- **Warm gold glow** on CTAs, prices, and light-bulb motifs
- **CSS string-light garland** (header), subtle **snowflake drift**, frost borders
- **Mountains of Christmas** accent font + Playfair Display headings
- Pill-shaped glowing buttons, wreath/card accents
- Custom **og-image.jpg** (1200×630) with house silhouette + string lights
- Real installation photos in hero, gallery, and service cards

## SEO checklist

- [x] Local keywords (Clarksville, Nashville, Bowling Green)
- [x] JSON-LD: LocalBusiness, Service, WebSite, FAQPage
- [x] Open Graph / Twitter Card with real hero photo
- [x] Mobile-first responsive layout
- [x] Semantic HTML

## Updating production URL

Edit `js/config.js` → `siteUrl`. Also update canonical/OG URLs in `index.html` and `sitemap.xml` if the domain changes.

After CSS/JS changes, increment `?v=N` in `index.html` and `404.html` to bust Cloudflare cache.

## Contact info

- **Phone:** 925-895-4443, 270-604-5265
- **Service areas:** Clarksville TN, Nashville TN, Bowling Green KY, Middle Tennessee
