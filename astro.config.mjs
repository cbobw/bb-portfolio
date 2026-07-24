// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://cbobw.github.io',
  base: '/bb-portfolio/',
  /** 本機固定網址：http://127.0.0.1:4321/bb-portfolio/ */
  server: {
    host: '127.0.0.1',
    port: 4321,
    strictPort: true,
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
