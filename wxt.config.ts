import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  /** Dev / build target; web-ext opens this browser on `yarn dev`. */
  browser: 'chrome',
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
