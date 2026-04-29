import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import path from 'path'
import { defineConfig } from 'vite'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import { tanstackSerwistPlugin } from './vite-plugin'

const config = defineConfig({
  resolve: {
    alias: {
      // This tells Vite: when you see "prisma/", look in the local folder, not node_modules
      'prisma/': `${path.resolve(__dirname, 'prisma')}/`,
    },
  },
  plugins: [
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tanstackStart(),
    nitro(),
    devtools(),
    tailwindcss(),
    viteReact(),
    tanstackSerwistPlugin(),
  ],
})

export default config
