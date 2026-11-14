import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import handler from './api/evaluate.js';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load environment variables from .env / .env.local without VITE_ prefix
  const env = loadEnv(mode, process.cwd(), '');
  // Populate process.env for local serverless emulation
  Object.assign(process.env, env);

  return {
    plugins: [
      react(),
      {
        name: 'local-serverless-api',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url === '/api/evaluate' || req.url.startsWith('/api/evaluate?')) {
              // Read JSON body for POST request
              let bodyStr = '';
              req.on('data', (chunk) => {
                bodyStr += chunk;
              });

              req.on('end', async () => {
                try {
                  req.body = bodyStr ? JSON.parse(bodyStr) : {};
                } catch {
                  req.body = {};
                }

                // Polyfill minimal Express/Vercel helper methods on res
                res.status = function (code) {
                  res.statusCode = code;
                  return res;
                };
                res.json = function (obj) {
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify(obj));
                  return res;
                };

                try {
                  await handler(req, res);
                } catch (err) {
                  console.error('Local handler error:', err);
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: err.message || 'Internal server error' }));
                }
              });
            } else {
              next();
            }
          });
        },
      },
    ],
  };
});
