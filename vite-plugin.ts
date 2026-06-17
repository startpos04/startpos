import path from 'node:path'
import { injectManifest } from '@serwist/build'
import type { Plugin } from 'vite'
import { build } from 'vite'

export function tanstackSerwistPlugin(): Plugin {
  let rootDir: string
  let isProduction: boolean
  let isBuilding = false

  return {
    name: 'tanstack-serwist',
    configResolved(config) {
      rootDir = config.root
      isProduction = config.command === 'build'
    },
    async buildStart() {
      // Build SW in dev mode so the file exists for the browser
      if (!isProduction && !isBuilding) {
        isBuilding = true
        await buildServiceWorker(rootDir, false)
        isBuilding = false
      }
    },
    async closeBundle() {
      // In production, wait until the app is bundled to inject hashed assets
      if (isProduction && !isBuilding) {
        isBuilding = true
        await buildServiceWorker(rootDir, true)
        isBuilding = false
      }
    },
  }
}

async function buildServiceWorker(rootDir: string, production: boolean) {
  const outName = 'sw.js'
  const outDir = production ? path.resolve(rootDir, '.output', 'public') : path.resolve(rootDir, 'public')

  const swSrc = path.resolve(rootDir, 'src', 'sw.ts')
  const swDest = path.resolve(outDir, outName)

  try {
    // Step 1: Bundle SW with Vite
    await build({
      root: rootDir,
      configFile: false,
      define: {
        'process.env.NODE_ENV': JSON.stringify(production ? 'production' : 'development'),
        'process.env': JSON.stringify({ NODE_ENV: production ? 'production' : 'development' }),
      },
      build: {
        lib: {
          entry: swSrc,
          formats: ['es'],
          fileName: () => outName,
        },
        outDir,
        emptyOutDir: false,
        minify: production,
        rollupOptions: {
          output: { entryFileNames: outName },
        },
      },
      logLevel: 'error',
    })

    // Step 2: Inject Manifest (Production Only)
    if (production) {
      const result = await injectManifest({
        swSrc: swDest,
        swDest,
        globDirectory: outDir,
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest,json,woff,woff2}'],
        injectionPoint: 'self.__SW_MANIFEST',
      })
      console.info(`✅ [SERWIST] Precached ${result.count} files`)
    }
  } catch (error) {
    console.error('❌ [SERWIST] Build failed:', error)
  }
}
