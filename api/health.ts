// Vercel Edge Function — minimal config-status endpoint.
//
// Returns booleans for which integration keys are configured server-side.
// Used by Settings to surface silent-degradation conditions (e.g. USDA key
// not set → all nutrition lookups fall through to Open Food Facts only,
// which is a real quality regression we should make visible).

export const config = { runtime: 'edge' };

function corsHeaders(origin: string | null): HeadersInit {
  const ok = !origin
    || origin.endsWith('.vercel.app')
    || origin.startsWith('http://localhost')
    || origin === (typeof process !== 'undefined' ? process.env.ALLOWED_ORIGIN : '');
  return {
    'Access-Control-Allow-Origin': ok && origin ? origin : '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export default async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin);

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: { message: 'Method not allowed' } }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const env = typeof process !== 'undefined' ? process.env : ({} as Record<string, string | undefined>);
  return new Response(JSON.stringify({
    anthropic_configured: !!env.ANTHROPIC_API_KEY,
    usda_configured: !!env.USDA_FDC_API_KEY,
    environment: env.VITE_FIREBASE_PATH_PREFIX === 'rooms-dev' ? 'development' : 'production',
  }), {
    status: 200,
    headers: {
      ...cors,
      'Content-Type': 'application/json',
      // Cached briefly — config doesn't change often, no need to hammer the endpoint.
      'Cache-Control': 'public, max-age=60',
    },
  });
}
