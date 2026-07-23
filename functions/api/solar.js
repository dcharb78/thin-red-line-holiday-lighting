/**
 * Cloudflare Pages Function — proxies Google Solar API (Building Insights).
 * Set GOOGLE_MAPS_API_KEY in Cloudflare Pages → Settings → Environment variables.
 * Keeps the API key server-side; client calls /api/solar?lat=&lon=
 */
export async function onRequestGet(context) {
  const { searchParams } = new URL(context.request.url);
  const lat = searchParams.get('lat');
  const lon = searchParams.get('lon');
  const key = context.env.GOOGLE_MAPS_API_KEY;

  if (!key) {
    return Response.json({ error: 'Google Solar API not configured' }, { status: 503 });
  }
  if (!lat || !lon) {
    return Response.json({ error: 'lat and lon required' }, { status: 400 });
  }

  const solarUrl = new URL('https://solar.googleapis.com/v1/buildingInsights:findClosest');
  solarUrl.searchParams.set('location.latitude', lat);
  solarUrl.searchParams.set('location.longitude', lon);
  solarUrl.searchParams.set('requiredQuality', 'BASE');
  solarUrl.searchParams.set('key', key);

  try {
    const res = await fetch(solarUrl.toString());
    const data = await res.json();
    if (!res.ok) {
      return Response.json(data, { status: res.status });
    }
    return Response.json(data, {
      headers: { 'Cache-Control': 'private, max-age=3600' },
    });
  } catch (err) {
    return Response.json({ error: 'Solar API request failed' }, { status: 502 });
  }
}
