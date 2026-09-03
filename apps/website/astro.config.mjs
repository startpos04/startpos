import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  output: 'static',
  site: 'https://rrlopez.github.io',
  base: '/start-pos-website',
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
})
