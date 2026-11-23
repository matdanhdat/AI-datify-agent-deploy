import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

async function run() {
  process.env.GEMINI_API_KEY_1 = ' ';
  process.env.GEMINI_API_KEY_2 = ' ';
  
  const server = await preview({
    root: ROOT,
    configFile: path.resolve(ROOT, 'vite.config.ts'),
    build: {
      outDir: path.resolve(ROOT, 'dist'),
    },
    preview: {
      port: 8089,
      host: '0.0.0.0',
    },
  });

  console.log(`PREVIEW_SERVER_READY_8089 PID:${process.pid}`);
  setInterval(() => {}, 60000);
}

run().catch((err) => {
  console.error('Failed to start preview server:', err);
  process.exit(1);
});
