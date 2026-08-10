import { app, BrowserWindow, ipcMain, nativeImage, protocol, screen, shell } from 'electron'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import fsSync from 'node:fs'
import fs from 'node:fs/promises'
import { closeDb } from './db'
import { registerSettingsHandlers } from './handlers/settings'
import { registerThumbnailsHandlers } from './handlers/thumbnails'
import { registerAIHandlers } from './handlers/ai'
import { registerMediaHandlers } from './handlers/media'
import { getDataDir } from './data_dir'
import { registerDatabaseHandlers } from './db-ops/register/handlers'
import { isAllowedExternalUrl, isTrustedRendererUrl } from './security'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

let win: BrowserWindow | null
const APP_DISPLAY_NAME = 'Openframe'

function resolveAppIconPath(): string | null {
  const candidates = [
    path.join(process.env.APP_ROOT, 'public', 'logo.png'),
    path.join(process.env.APP_ROOT, 'public', 'logo.ico'),
    path.join(process.env.APP_ROOT, 'public', 'logo.icns'),
    path.join(process.env.APP_ROOT, 'public', 'logo.svg'),
    path.join(process.env.APP_ROOT, 'build', 'logo.png'),
    path.join(process.env.APP_ROOT, 'build', 'logo.icns'),
  ]

  for (const candidate of candidates) {
    if (fsSync.existsSync(candidate)) return candidate
  }

  return null
}

function contentTypeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.bmp') return 'image/bmp'
  if (ext === '.svg') return 'image/svg+xml'
  if (ext === '.avif') return 'image/avif'
  if (ext === '.mp4') return 'video/mp4'
  if (ext === '.webm') return 'video/webm'
  if (ext === '.mov') return 'video/quicktime'
  return 'application/octet-stream'
}

function getRendererEntryUrl(): string {
  return VITE_DEV_SERVER_URL || pathToFileURL(path.join(RENDERER_DIST, 'index.html')).toString()
}

function secureWindowNavigation(window: BrowserWindow, rendererUrl: string): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (isTrustedRendererUrl(url, rendererUrl)) return
    event.preventDefault()
    if (isAllowedExternalUrl(url)) void shell.openExternal(url)
  })
  window.webContents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })
}

function createWindow() {
  const iconPath = resolveAppIconPath()
  win = new BrowserWindow({
    icon: iconPath ?? undefined,
    title: 'Openframe',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
    width: 1440,
    height: 900,
  })

  const rendererUrl = getRendererEntryUrl()
  secureWindowNavigation(win, rendererUrl)

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(rendererUrl)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

function createStudioWindow(projectId: string, seriesId: string) {
  const display = screen.getPrimaryDisplay()
  const { x, y, width, height } = display.workArea
  const iconPath = resolveAppIconPath()

  const studioWin = new BrowserWindow({
    icon: iconPath ?? undefined,
    title: 'Openframe',
    titleBarStyle: 'hiddenInset',
    x,
    y,
    width,
    height,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })

  const studioHashPath = `/projects/${encodeURIComponent(projectId)}?studio=1&projectId=${encodeURIComponent(projectId)}&seriesId=${encodeURIComponent(seriesId)}`

  const rendererUrl = getRendererEntryUrl()
  secureWindowNavigation(studioWin, rendererUrl)
  studioWin.loadURL(`${rendererUrl}#${studioHashPath}`)
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.on('before-quit', closeDb)

app.whenReady().then(() => {
  app.setName(APP_DISPLAY_NAME)

  const aboutOptions: Parameters<typeof app.setAboutPanelOptions>[0] = {
    applicationName: APP_DISPLAY_NAME,
    applicationVersion: app.getVersion(),
    version: app.getVersion(),
  }

  const aboutIconPath = resolveAppIconPath()
  if (aboutIconPath) {
    aboutOptions.iconPath = aboutIconPath
  }
  app.setAboutPanelOptions(aboutOptions)

  if (process.platform === 'darwin') {
    const dockIconPath = resolveAppIconPath()
    if (dockIconPath) {
      const dockIcon = nativeImage.createFromPath(dockIconPath)
      if (!dockIcon.isEmpty()) {
        app.dock?.setIcon(dockIcon)
      }
    }
  }

  protocol.handle('openframe-thumb', async (request) => {
    try {
      const url = new URL(request.url)
      const raw = url.searchParams.get('path')
      if (!raw) return new Response('Missing path', { status: 400 })

      const requestedPath = path.resolve(decodeURIComponent(raw))
      const thumbsDir = path.resolve(path.join(getDataDir(), 'thumbnails')) + path.sep
      const videosDir = path.resolve(path.join(getDataDir(), 'videos')) + path.sep
      if (!requestedPath.startsWith(thumbsDir) && !requestedPath.startsWith(videosDir)) {
        return new Response('Forbidden', { status: 403 })
      }

      const stat = await fs.stat(requestedPath)
      const totalSize = stat.size
      const contentType = contentTypeFromPath(requestedPath)

      const rangeHeader = request.headers.get('range')
      if (rangeHeader) {
        const range = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim())
        if (!range) {
          return new Response('Invalid Range', {
            status: 416,
            headers: {
              'accept-ranges': 'bytes',
              'content-range': `bytes */${totalSize}`,
            },
          })
        }

        const start = range[1] ? Number(range[1]) : 0
        const end = range[2] ? Number(range[2]) : totalSize - 1
        if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= totalSize) {
          return new Response('Range Not Satisfiable', {
            status: 416,
            headers: {
              'accept-ranges': 'bytes',
              'content-range': `bytes */${totalSize}`,
            },
          })
        }

        const safeEnd = Math.min(end, totalSize - 1)
        const chunkSize = safeEnd - start + 1
        const file = await fs.open(requestedPath, 'r')
        try {
          const chunk = Buffer.alloc(chunkSize)
          await file.read(chunk, 0, chunkSize, start)
          return new Response(new Uint8Array(chunk), {
            status: 206,
            headers: {
              'content-type': contentType,
              'accept-ranges': 'bytes',
              'content-length': String(chunkSize),
              'content-range': `bytes ${start}-${safeEnd}/${totalSize}`,
              'cache-control': 'no-cache',
            },
          })
        } finally {
          await file.close()
        }
      }

      const data = await fs.readFile(requestedPath)
      return new Response(new Uint8Array(data), {
        status: 200,
        headers: {
          'content-type': contentType,
          'accept-ranges': 'bytes',
          'content-length': String(totalSize),
          'cache-control': 'no-cache',
        },
      })
    } catch {
      return new Response('Not Found', { status: 404 })
    }
  })

  registerDatabaseHandlers()
  registerSettingsHandlers()
  registerThumbnailsHandlers()
  registerAIHandlers()
  registerMediaHandlers()

  ipcMain.handle('window:openStudio', (_event, payload: { projectId: string; seriesId: string }) => {
    createStudioWindow(payload.projectId, payload.seriesId)
  })

  ipcMain.handle('window:openExternal', async (_event, url: string) => {
    if (!isAllowedExternalUrl(url)) {
      throw new Error('Invalid external URL')
    }
    await shell.openExternal(url)
  })

  ipcMain.handle('window:getVersion', () => app.getVersion())

  createWindow()
})
