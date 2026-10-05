import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import storyHandler from './api/story'
import ttsHandler from './api/tts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), {
    name: 'story-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0];
        if (path === '/api/story') void storyHandler(req, res);
        else if (path === '/api/tts') void ttsHandler(req, res);
        else next();
      });
    },
  }],
})
