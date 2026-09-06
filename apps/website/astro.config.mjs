import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

export default defineConfig({
  output: 'static',
  site: 'https://startpos04.github.io',
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
})
