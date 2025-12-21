import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  base: '/Touhou-Isekai-Izakaya/',
  plugins: [
    vue(),
    tailwindcss(),
    {
      name: 'configure-server',
      configureServer(server) {
        server.middlewares.use('/api/spoof', async (req, res) => {
          try {
            const targetBaseUrl = req.headers['x-target-url'] as string;
            if (!targetBaseUrl) {
              res.statusCode = 400;
              res.end('Missing x-target-url header');
              return;
            }

            // Construct target URL
            // req.url is relative to the mount point '/api/spoof'
            // e.g., if full URL is /api/spoof/chat/completions, req.url is /chat/completions
            
            // Handle URL construction manually to preserve path in targetBaseUrl
            // new URL('path', 'http://base/v1') -> 'http://base/path' (drops v1), which is not what we want
            const cleanBase = targetBaseUrl.replace(/\/+$/, '');
            const cleanPath = req.url!.replace(/^\/+/, '');
            const targetUrl = `${cleanBase}/${cleanPath}`;
            
            console.log(`[Proxy] Forwarding to: ${targetUrl}`);

            // Prepare body
            const buffers: any[] = [];
            for await (const chunk of req) {
              buffers.push(chunk);
            }
            const body = Buffer.concat(buffers);

            // Forward request
            // @ts-ignore - fetch is available in Node 18+
            // Filter out headers that node-fetch/undici doesn't like or we want to override
            const { host, connection, 'content-length': cl, 'transfer-encoding': te, 'x-target-url': xt, ...cleanedHeaders } = req.headers;
            
            const proxyRes = await fetch(targetUrl, {
              method: req.method,
              headers: {
                ...(cleanedHeaders as Record<string, string>),
                'user-agent': 'SillyTavern',
                'referer': 'http://127.0.0.1:8000/',
                'origin': 'http://127.0.0.1:8000',
                'x-requested-with': 'XMLHttpRequest'
              },
              body: req.method !== 'GET' && req.method !== 'HEAD' ? body : undefined
            });

            // Pipe response back
            res.statusCode = proxyRes.status;
            proxyRes.headers.forEach((value: string, key: string) => {
               res.setHeader(key, value);
            });
            
            if (proxyRes.body) {
              // @ts-ignore
              for await (const chunk of proxyRes.body) {
                res.write(chunk);
              }
            }
            res.end();
          } catch (e) {
            console.error('Proxy error:', e);
            res.statusCode = 500;
            res.end('Proxy error: ' + String(e));
          }
        });
      }
    }
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    host: '0.0.0.0', // Listen on all network interfaces
    port: 14791
  }
})
