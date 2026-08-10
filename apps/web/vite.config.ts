import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import fs from 'node:fs'
import aiProxyHandler from './api/ai'
import storageHandler from './api/storage'

type DevProxyResponse = {
  setHeader: (name: string, value: string) => void
  status: (code: number) => { json: (payload: unknown) => void }
}

type DevApiHandler = (
  req: {
    method?: string
    body?: unknown
    headers?: Record<string, string | string[] | undefined>
  },
  res: DevProxyResponse,
) => Promise<void> | void

function createWebApiPlugin(): Plugin {
  const handlers: Record<string, DevApiHandler> = {
    '/api/ai': aiProxyHandler as DevApiHandler,
    '/api/storage': storageHandler as DevApiHandler,
  }

  return {
    name: 'openframe-web-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url) {
          next()
          return
        }

        const pathname = req.url.split('?')[0]
        const handler = handlers[pathname]
        if (!handler) {
          next()
          return
        }

        const chunks: Buffer[] = []
        req.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        })

        req.on('end', async () => {
          const raw = Buffer.concat(chunks).toString('utf8')
          let body: unknown = {}
          if (raw.trim()) {
            try {
              body = JSON.parse(raw)
            } catch {
              body = {}
            }
          }

          const responseAdapter: DevProxyResponse = {
            setHeader: (name, value) => {
              res.setHeader(name, value)
            },
            status: (code) => ({
              json: (payload) => {
                res.statusCode = code
                res.setHeader('content-type', 'application/json')
                res.end(JSON.stringify(payload))
              },
            }),
          }

          await handler(
            {
              method: req.method,
              body,
              headers: req.headers,
            },
            responseAdapter,
          )
        })
      })
    },
  }
}

function normalizeVersion(value: string): string {
  const normalized = (value || '').trim().replace(/^v/i, '')
  return normalized || '0.0.0'
}

function resolveBuildVersion(): string {
  const envVersion = process.env.VITE_APP_VERSION
  if (envVersion && envVersion.trim()) return normalizeVersion(envVersion)

  try {
    const rootPackageRaw = fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
    const rootPackage = JSON.parse(rootPackageRaw) as { version?: string }
    return normalizeVersion(rootPackage.version || '')
  } catch {
    return '0.0.0'
  }
}

function createVersionManifestPlugin(): Plugin {
  return {
    name: 'openframe-web-version-manifest',
    apply: 'build',
    generateBundle() {
      const payload = {
        version: resolveBuildVersion(),
        builtAt: new Date().toISOString(),
      }
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify(payload, null, 2),
      })
    },
  }
}

export default defineConfig({
  plugins: [
    tanstackRouter({
      routesDirectory: '../ui/src/routes',
      generatedRouteTree: '../ui/src/routeTree.gen.ts',
    }),
    tailwindcss(),
    react(),
    createWebApiPlugin(),
    createVersionManifestPlugin(),
  ],
  server: {
    port: 5170,
    strictPort: true,
  },
})
