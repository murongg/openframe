import i18n from './i18n'
import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import 'react-photo-view/dist/react-photo-view.css'
import { createHashHistory, createRouter, RouterProvider } from '@tanstack/react-router'
import { PhotoProvider } from 'react-photo-view'
import { routeTree } from './routeTree.gen'
import { normalizeLanguage } from './utils/language'

const hashHistory = createHashHistory()
const router = createRouter({ routeTree, history: hashHistory })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

async function init() {
  // 从设置中恢复语言和主题，避免首屏闪烁/错语言
  try {
    const rows = await window.settingsAPI.getAll()
    const rawLanguage = rows.find((r) => r.key === 'language')?.value
    const theme = rows.find((r) => r.key === 'theme')?.value
    const fallbackLanguage = normalizeLanguage(i18n.language, 'en')
    const language = normalizeLanguage(rawLanguage, fallbackLanguage)

    if (i18n.language !== language) {
      await i18n.changeLanguage(language)
    }

    if (rawLanguage && rawLanguage !== language) {
      await window.settingsAPI.upsert('language', language)
    }

    if (theme && theme !== 'system') {
      document.documentElement.setAttribute('data-theme', theme)
    }
  } catch {
    // 设置未就绪时忽略，使用默认语言和系统主题
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <PhotoProvider>
        <RouterProvider router={router} />
      </PhotoProvider>
    </React.StrictMode>,
  )
}

init()
