import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'FastDoc - Your AI Scribe',
    description: 'AI-assisted clinical documentation and EMR workflow.',
    permissions: ['sidePanel', 'microphone'],
    host_permissions: ['https://api.deepgram.com/*'],
  },
  /** Dev / build target; web-ext opens this browser on `yarn dev`. */
  browser: 'chrome',
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
