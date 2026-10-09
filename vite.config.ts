import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import storyHandler from './api/story'
import ttsHandler from './server/tts-handler'
import vieneuHandler from './api/vieneu'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VIENEU_');
  for (const key of ['VIENEU_BASE_URL', 'VIENEU_API_KEY']) if (!process.env[key] && env[key]) process.env[key] = env[key];
  return {
    worker: { format: 'es' },
    optimizeDeps: { include: ['espeak-ng', '@mintplex-labs/piper-tts-web', 'onnxruntime-web/wasm'] },
    plugins: [react(), tailwindcss(), {
      name: 'story-api',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const path = req.url?.split('?')[0];
          if (path === '/api/story') void storyHandler(req, res);
          else if (path === '/api/tts') void ttsHandler(req, res);
          else if (path === '/api/vieneu') void vieneuHandler(req, res);
          else next();
        });
      },
    }],
  };
})
