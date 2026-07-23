/**
 * Site configuration — update SITE_URL when deploying to production.
 * Used for canonical URLs, sitemap references, and JSON-LD absolute URLs.
 */
window.SITE_CONFIG = {
  siteUrl: 'https://thinredlineholidaylighting.com',
  business: {
    name: 'Thin Red Line Holiday Lighting',
    phonePrimary: '925-895-4443',
    phonePrimaryTel: '+19258954443',
    phoneSecondary: '270-604-5265',
    phoneSecondaryTel: '+12706045265',
    email: 'info@thinredlineholidaylighting.com',
    founded: 2018,
    serviceAreas: [
      'Clarksville, TN',
      'Nashville, TN',
      'Bowling Green, KY',
      'Middle Tennessee',
    ],
    social: {
      facebook: 'https://www.facebook.com/2280588978933497',
      instagram: 'https://www.instagram.com/thinredlineholidaylighting/',
      tiktok: 'https://www.tiktok.com/@thinredlineholidaylights',
    },
  },
  estimator: {
    /** Installed price range per linear foot (materials + labor). */
    pricePerFootMin: 8,
    pricePerFootMax: 15,
    /** Default roofline multiplier when only footprint area is known. */
    perimeterFactor: 4.2,
    /** Story height adjustment to accessible roofline. */
    storyMultipliers: { 1: 1.0, 2: 1.35, 3: 1.55 },
    roofTypeMultipliers: {
      gable: 1.0,
      hip: 1.15,
      flat: 0.85,
      complex: 1.35,
    },
    coverageOptions: {
      front: 0.35,
      'front-sides': 0.6,
      full: 1.0,
    },
    /** Nominatim requires a descriptive User-Agent. */
    nominatimUserAgent: 'ThinRedLineHolidayLighting/1.0 (quote-estimator; contact@thinredlineholidaylighting.com)',
    /**
     * Optional Google Maps Platform key for client-side Solar API fallback.
     * Prefer Cloudflare env var GOOGLE_MAPS_API_KEY + /api/solar proxy (keeps key server-side).
     * Restrict any browser key to your domain in Google Cloud Console.
     */
    googleMapsApiKey: '',
  },
};
