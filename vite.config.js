import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Two pages: the dashboard and the sign-in form the Worker shows before it.
  build: { rollupOptions: { input: ['index.html', 'login.html'] } },
  // /api is answered by the Worker; run `npx wrangler dev` beside `npm run dev`.
  server: { proxy: { '/api': 'http://localhost:8787' } },
});
