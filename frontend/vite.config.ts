import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// 로컬 개발 환경에서 Python 서버 없이도 Node.js가 즉각 외부 이미지를 CORS 없이 프록시해주는 플러그인
function imageProxyPlugin(): Plugin {
  return {
    name: 'vite-plugin-image-proxy',
    configureServer(server) {
      server.middlewares.use('/api/proxy-image', async (req, res) => {
        try {
          const host = req.headers.host || 'localhost:5173';
          const query = new URL(req.url || '', `http://${host}`).searchParams;
          const targetUrl = query.get('url');

          if (!targetUrl) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.end('Missing url parameter');
            return;
          }

          const parsed = new URL(targetUrl);
          const response = await fetch(targetUrl, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Referer': `${parsed.protocol}//${parsed.host}/`,
              'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            },
          });

          if (!response.ok) {
            res.statusCode = response.status;
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.end(`Upstream failed with status: ${response.status}`);
            return;
          }

          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          res.setHeader('Content-Type', response.headers.get('content-type') || 'image/jpeg');

          const arrayBuffer = await response.arrayBuffer();
          res.end(Buffer.from(arrayBuffer));
        } catch (err: any) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end(`Proxy error: ${err.message}`);
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), imageProxyPlugin()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
});
