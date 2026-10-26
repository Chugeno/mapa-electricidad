// Cloudflare Pages Function: /api/topology
export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);

  // Serve static topology.json with 1-day browser and edge cache
  const assetUrl = new URL('/api/topology.json', url.origin);
  const response = await context.env.ASSETS.fetch(assetUrl);

  const newHeaders = new Headers(response.headers);
  newHeaders.set('Cache-Control', 'public, max-age=86400, s-maxage=86400');
  newHeaders.set('Access-Control-Allow-Origin', '*');

  return new Response(response.body, {
    status: response.status,
    headers: newHeaders
  });
}
