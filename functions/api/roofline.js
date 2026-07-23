/**
 * Cloudflare Pages Function — optional Gemini Vision roofline detection.
 * Set GEMINI_API_KEY in Cloudflare Pages → Settings → Environment variables.
 * POST { "image": "data:image/jpeg;base64,..." }
 * Returns { "points": [{ "x": 0.12, "y": 0.34 }, ...] } normalized 0–1.
 */
export async function onRequestPost(context) {
  const key = context.env.GEMINI_API_KEY;
  if (!key) {
    return Response.json(
      {
        error: 'Gemini API not configured',
        hint: 'Set GEMINI_API_KEY in Cloudflare Pages environment variables, or trace the roofline manually.',
      },
      { status: 503 }
    );
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const image = body?.image;
  if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
    return Response.json({ error: 'image (base64 data URL) required' }, { status: 400 });
  }

  const base64 = image.replace(/^data:image\/\w+;base64,/, '');
  const mimeMatch = image.match(/^data:(image\/\w+);base64,/);
  const mimeType = mimeMatch?.[1] || 'image/jpeg';

  const prompt = `You are analyzing a photo of a house for Christmas light installation along the roofline and eaves.

Identify the visible front roofline edge where professional C9/C7 string lights would be installed (along gutters, eaves, and peak lines visible from this camera angle).

Return ONLY valid JSON with no markdown, in this exact shape:
{"points":[{"x":0.0,"y":0.0}, ...]}

Rules:
- x and y are normalized 0.0 to 1.0 (0,0 is top-left of image)
- Provide 8 to 24 points following the roofline left-to-right (or along the visible roof edge)
- Points should sit ON the roofline/eave edge, not on the ground or sky
- If multiple roof segments are visible, prioritize the main front-facing roofline
- If no house is visible, return {"points":[]}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: base64 } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1024,
        },
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return Response.json(
        { error: data.error?.message || 'Gemini request failed' },
        { status: res.status }
      );
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return Response.json({ error: 'Could not parse roofline from AI response' }, { status: 422 });
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return Response.json({ error: 'Invalid JSON from AI' }, { status: 422 });
    }

    const points = (parsed.points || [])
      .filter((p) => typeof p.x === 'number' && typeof p.y === 'number')
      .map((p) => ({
        x: Math.min(1, Math.max(0, p.x)),
        y: Math.min(1, Math.max(0, p.y)),
      }));

    return Response.json({ points }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Roofline detection request failed' }, { status: 502 });
  }
}
