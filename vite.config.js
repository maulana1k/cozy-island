import { defineConfig } from 'vite';

// base './' keeps every asset path relative, so the build works from any subfolder (itch.io serves it inside an iframe).
// Only index.html is built; kit.html is a dev-only model viewer and is not part of the build.
export default defineConfig({
  base: './',
  server: { port: 5173 },
});
