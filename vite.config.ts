import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Loads .env.local and .env securely into process.env for local API gateway simulation.
 * Never exposes these variables to client bundles.
 */
function loadLocalEnv() {
  const envFiles = ['.env.local', '.env'];
  for (const file of envFiles) {
    const fullPath = path.resolve(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim();
          if (!process.env[key] && val) {
            process.env[key] = val;
          }
        }
      }
    }
  }
}

loadLocalEnv();

async function nodeToWebRequest(req: IncomingMessage, defaultHost = 'localhost:5173'): Promise<Request> {
  const host = req.headers.host || defaultHost;
  const url = `http://${host}${req.url}`;
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (value) {
      if (Array.isArray(value)) {
        value.forEach((v) => headers.append(key, v));
      } else {
        headers.set(key, value);
      }
    }
  }

  let body: Buffer | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    body = Buffer.concat(chunks);
  }

  return new Request(url, {
    method: req.method,
    headers,
    body: body && body.length > 0 ? body : undefined,
    // @ts-expect-error Node fetch Request duplex init
    duplex: 'half',
  });
}

async function sendWebResponse(res: ServerResponse, webRes: Response) {
  res.statusCode = webRes.status;
  res.statusMessage = webRes.statusText;
  webRes.headers.forEach((val, key) => {
    res.setHeader(key, val);
  });
  const buf = await webRes.arrayBuffer();
  res.end(Buffer.from(buf));
}

/**
 * Local simulation plugin for Vercel Serverless Functions (/api/health and /api/ai).
 * Uses identical Web Request/Response handler logic in both dev and preview modes.
 */
function vercelApiSimulationPlugin(): Plugin {
  return {
    name: 'vercel-api-simulation',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) {
          return next();
        }

        try {
          const webReq = await nodeToWebRequest(req, `localhost:${server.config.server.port || 5173}`);
          const pathname = new URL(webReq.url).pathname;

          if (pathname === '/api/health') {
            const { handleHealth } = await import('./api/_lib/handler');
            const webRes = await handleHealth(webReq);
            return sendWebResponse(res, webRes);
          }

          if (pathname === '/api/ai') {
            const { handleAi } = await import('./api/_lib/handler');
            const webRes = await handleAi(webReq);
            return sendWebResponse(res, webRes);
          }

          next();
        } catch (err: unknown) {
          console.error('[Vite Local API Error]', err);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ code: 'INTERNAL', message_vi: 'Lỗi xử lý API cục bộ.' }));
        }
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) {
          return next();
        }

        try {
          const webReq = await nodeToWebRequest(req, `localhost:${server.config.preview.port || 8000}`);
          const pathname = new URL(webReq.url).pathname;

          if (pathname === '/api/health') {
            const { handleHealth } = await import('./api/_lib/handler');
            const webRes = await handleHealth(webReq);
            return sendWebResponse(res, webRes);
          }

          if (pathname === '/api/ai') {
            const { handleAi } = await import('./api/_lib/handler');
            const webRes = await handleAi(webReq);
            return sendWebResponse(res, webRes);
          }

          next();
        } catch (err: unknown) {
          console.error('[Vite Preview API Error]', err);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ code: 'INTERNAL', message_vi: 'Lỗi xử lý API cục bộ.' }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), vercelApiSimulationPlugin()],
  server: {
    port: 5173,
  },
  preview: {
    port: 8000,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules/exceljs')) {
            return 'excel-engine';
          }
          if (id.includes('node_modules/fflate')) {
            return 'zip-engine';
          }
        },
      },
    },
  },
  // @ts-expect-error vitest config field
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: ['**/node_modules/**', '**/dist/**', '**/deploy-package/**', '**/backup-before-M3/**'],
  },
});
