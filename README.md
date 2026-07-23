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
4. Deploy. Cloudflare serves `index.html`, `404.html`, `robots.txt`, `sitemap.xml`, `_headers`, and `_redirects` automatically.

### Option B: Wrangler CLI

```bash
npm install -g wrangler
wrangler pages deploy . --project-name=thin-red-line-holiday-lighting
```

### Custom domain

1. In Pages project → **Custom domains** → add `thinredlineholidaylighting.com`.
2. Update DNS at your registrar (Cloudflare will provide CNAME or A records).
3. Enable **Always Use HTTPS** and **Automatic HTTPS Rewrites** in Cloudflare SSL/TLS settings.
4. Optionally uncomment the www → apex redirect in `_redirects`.
5. HSTS can be enabled in Cloudflare **SSL/TLS → Edge Certificates** (recommended for production).

### Preview deployments

Preview URLs use `*.pages.dev`. Absolute URLs in meta tags and JSON-LD point to production (`thinredlineholidaylighting.com`). Update `js/config.js` → `siteUrl` if you need preview-specific canonical URLs.

## Project structure

```
index.html          Main page (hero, services, estimator, FAQ, contact)
404.html            Custom not-found page (Cloudflare Pages auto-serves)
css/styles.css      Styles (cache-busted ?v=1)
js/config.js        Site URL, business info, estimator rates
js/estimator.js     Roof/light line estimator (Nominatim + Overpass)
js/main.js          Navigation, contact form → SMS
robots.txt          Crawler directives + sitemap reference
sitemap.xml         Single-page sitemap with absolute production URLs
_headers            Security + cache headers for Cloudflare Pages
_redirects          Optional URL redirects (www, legacy paths)
wrangler.toml       Cloudflare Pages project config
```

## Roof / light line estimator

### How it works

1. **Address lookup tab**
   - Geocodes the address via [Nominatim](https://nominatim.openstreetmap.org/) (OpenStreetMap, no API key).
   - Queries [Overpass API](https://overpass-api.de/) for nearby `building` footprints.
   - Computes polygon area and perimeter → estimated roofline linear feet.
   - Falls back to manual square footage if no OSM building outline exists.

2. **Manual entry tab**
   - Uses home square footage with a perimeter approximation: `√sqft × 4.2`.

3. **Adjustments**
   - Story count, roof type (gable/hip/flat/complex), and coverage (front / front+sides / full).

4. **Pricing**
   - Configurable in `js/config.js`: `$8–$15/linear foot` installed (materials, labor, removal, storage).

### Accuracy limits (shown in UI)

- OSM building footprints are ground footprints, not exact roof edges.
- Trees, dormers, peaks, and design complexity are not modeled.
- Output is a **ballpark range** — final quotes come from the team.

### No API keys required

Nominatim requires a descriptive `User-Agent` (configured in `js/config.js`). Respect [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/): one request per user action, no bulk geocoding.

## Public reviews & social proof

We searched Google, Yelp, Facebook, and general web results for **Thin Red Line Holiday Lighting** reviews. **No substantial public review profile was found** at build time. The site:

- Does **not** fabricate testimonials.
- Links to [Facebook](https://www.facebook.com/2280588978933497), [Instagram](https://www.instagram.com/thinredlineholidaylighting/), and [TikTok](https://www.tiktok.com/@thinredlineholidaylights).
- Highlights verifiable credentials: firefighter/veteran owned, serving since 2018 (from existing site).

## SEO checklist

### On-page

- [x] Unique `<title>` and meta description with local keywords (Clarksville, Nashville, Bowling Green)
- [x] Single H1, logical H2 hierarchy
- [x] Canonical URL (`https://thinredlineholidaylighting.com/`)
- [x] Open Graph + Twitter Card meta tags with absolute URLs
- [x] Social preview image (`images/og-image.png`, 1200×630) + favicon
- [x] JSON-LD: `LocalBusiness`, `Service`, `WebSite`, `FAQPage` with absolute `@id` URLs
- [x] Internal anchor navigation (services, estimator, FAQ, contact)
- [x] Mobile-first responsive layout
- [x] Semantic HTML (`header`, `main`, `section`, `article`, `nav`, `footer`)

### Technical / Cloudflare

- [x] Static site — no server-side dependencies
- [x] `robots.txt` with sitemap reference
- [x] `sitemap.xml` at site root
- [x] `404.html` for missing routes
- [x] `_headers` — security headers + long-cache static assets
- [x] `_redirects` — ready for www/legacy redirects
- [x] `wrangler.toml` for Pages project metadata
- [x] Asset cache-busting via `?v=1` query strings
- [x] `preconnect` hints for Google Fonts
- [x] No cookie banner blocking content (old site had intrusive cookie modal)

### Improvements over old site (thinredlineholidaylighting.com)

| Old site issue | New site fix |
|---|---|
| GoDaddy builder, thin content | Custom static site with deep service/FAQ content |
| Duplicate H2 headings | Unique, keyword-rich heading hierarchy |
| No structured data | Full JSON-LD LocalBusiness + FAQ |
| No instant estimator | OSM-powered roofline estimator + manual fallback |
| Placeholder/base64 images | Clean typography-first design (no broken images) |
| Cookie overlay on first visit | No blocking overlays |
| Weak CTAs | Prominent call, text, and estimate CTAs throughout |

## Updating production URL

Edit `js/config.js`:

```js
siteUrl: 'https://thinredlineholidaylighting.com',
```

Also update canonical/OG URLs in `index.html`, `sitemap.xml`, and JSON-LD if the domain changes.

After CSS/JS changes, increment `?v=1` → `?v=2` in `index.html` and `404.html` to bust Cloudflare cache (or purge cache in dashboard).

## Contact info (from existing site)

- **Phone:** 925-895-4443, 270-604-5265
- **Service areas:** Clarksville TN, Nashville TN, Bowling Green KY, Middle Tennessee
