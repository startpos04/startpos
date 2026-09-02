import { execSync } from 'node:child_process'
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
      // Skip service worker build entirely in development to prevent module resolution issues
      // Service worker will only be built and active in production
      if (!isProduction) {
        console.log('[SERWIST] Skipping service worker build in development mode')
        return
      }
      if (!isBuilding) {
        isBuilding = true
        await buildServiceWorker(rootDir, false)
        isBuilding = false
      }
    },
    async closeBundle() {
      if (isProduction && !isBuilding) {
        isBuilding = true
        await buildServiceWorker(rootDir, true)
        isBuilding = false
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Deployment-specific build identifier — fully automatic, no manual step.
//
// Priority:
//   1. VERCEL_DEPLOYMENT_ID — unique per Vercel deployment, even for repeat
//      deploys of the same commit (e.g. "redeploy" / promote-to-production).
//      This is what "recache on every deploy" actually requires — commit SHA
//      alone does NOT change on a redeploy of unchanged code.
//   2. VERCEL_GIT_COMMIT_SHA — fallback if deployment ID is unavailable for
//      some reason, still correct for the common case of one deploy per commit.
//   3. `git rev-parse HEAD` — local builds outside Vercel.
//   4. Date.now() — last resort if git isn't available (e.g. shallow checkout).
// ---------------------------------------------------------------------------
function resolveBuildId(): string {
  if (process.env['VERCEL_DEPLOYMENT_ID']) {
    return process.env['VERCEL_DEPLOYMENT_ID']
  }
  if (process.env['VERCEL_GIT_COMMIT_SHA']) {
    return process.env['VERCEL_GIT_COMMIT_SHA']
  }
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim()
  } catch {
    return Date.now().toString()
  }
}

async function buildServiceWorker(rootDir: string, production: boolean) {
  const outName = 'sw.js'
  const outDir = production ? path.resolve(rootDir, '.output', 'public') : path.resolve(rootDir, 'public')

  const swSrc = path.resolve(rootDir, 'src', 'sw.ts')
  const swDest = path.resolve(outDir, outName)

  const buildId = production ? resolveBuildId() : 'dev'

  try {
    await build({
      root: rootDir,
      configFile: false,
      define: {
        'process.env.NODE_ENV': JSON.stringify(production ? 'production' : 'development'),
        'process.env': JSON.stringify({
          NODE_ENV: production ? 'production' : 'development',
          BUILD_ID: buildId,
        }),
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

    if (production) {
      const shellResult = await injectManifest({
        swSrc: swDest,
        swDest,
        globDirectory: outDir,
        globPatterns: ['**/*.{html,webmanifest,ico,png,svg,woff,woff2}'],
        injectionPoint: 'self.__SW_MANIFEST',
      })

      const lazyResult = await injectManifest({
        swSrc: swDest,
        swDest,
        globDirectory: outDir,
        globPatterns: ['**/*.{js,css}'],
        globIgnores: ['**/opfs-worker*.js'],
        injectionPoint: 'self.__SW_LAZY_MANIFEST',
      })

      console.info(`✅ [SERWIST] Build ${buildId} — precached ${shellResult.count} shell files, queued ${lazyResult.count} for background caching`)
    }
  } catch (error) {
    console.error('❌ [SERWIST] Build failed:', error)
  }
}
