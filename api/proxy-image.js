// Vercel Serverless Function (Node.js) for CORS-free Image Proxy
export default async function handler(req, res) {
  // CORS Preflight handling
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url } = req.query;
  if (!url || typeof url !== 'string') {
    return res.status(400).send('URL query parameter is required');
  }

  try {
    const parsed = new URL(url);
    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': `${parsed.protocol}//${parsed.host}/`,
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    };

    const upstream = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(25000),
    });

    if (!upstream.ok) {
      return res.status(upstream.status).send(`Upstream server returned error: ${upstream.statusText}`);
    }

    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);

    const arrayBuffer = await upstream.arrayBuffer();
    return res.status(200).send(Buffer.from(arrayBuffer));
  } catch (err) {
    return res.status(500).send(`Image proxy error: ${err.message}`);
  }
}
