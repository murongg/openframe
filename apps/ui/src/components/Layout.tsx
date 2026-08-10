import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import {
  Download,
  FolderOpen,
  Github,
  MessageSquare,
  SwatchBook,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import { driver, type DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'
import SettingsModal from './SettingsModal'

interface MenuItem {
  icon: LucideIcon
  labelKey: string
  to: string
}

const menuItems: MenuItem[] = [
  { to: '/projects', icon: FolderOpen, labelKey: 'menu.projects' },
  { to: '/genres', icon: SwatchBook, labelKey: 'menu.list' },
  { to: '/prompts', icon: MessageSquare, labelKey: 'menu.prompts' },
]
const GITHUB_REPO_URL = 'https://github.com/murongg/openframe'
const GITHUB_RELEASES_API_URL = 'https://api.github.com/repos/murongg/openframe/releases/latest'
const WEB_VERSION_MANIFEST_URL = '/version.json'
const ONBOARDING_VERSION = '5'
const WEB_UPDATE_POLL_INTERVAL_MS = 5 * 60 * 1000

type UpdateNotice = {
  currentVersion: string
  latestVersion: string
  releaseUrl: string
}

function normalizeVersion(value: string): string {
  return (value || '').trim().replace(/^v/i, '')
}

function parseVersionParts(value: string): number[] | null {
  const normalized = normalizeVersion(value)
  if (!normalized) return null
  const core = normalized.split('-')[0]?.split('+')[0] ?? ''
  const parts = core.split('.').map((part) => Number(part))
  if (parts.length === 0 || parts.some((part) => Number.isNaN(part) || part < 0)) return null
  while (parts.length < 3) parts.push(0)
  return parts.slice(0, 3)
}

function isVersionNewer(candidate: string, base: string): boolean {
  const candidateParts = parseVersionParts(candidate)
  const baseParts = parseVersionParts(base)
  if (!candidateParts || !baseParts) return false
  for (let index = 0; index < 3; index += 1) {
    const candidatePart = candidateParts[index] ?? 0
    const basePart = baseParts[index] ?? 0
    if (candidatePart > basePart) return true
    if (candidatePart < basePart) return false
  }
  return false
}

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { location } = useRouterState()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [onboardingPending, setOnboardingPending] = useState(false)
  const [updateNotice, setUpdateNotice] = useState<UpdateNotice | null>(null)
  const isDesktopRuntime = useMemo(
    () => typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent),
    [],
  )
  const isStudioWindow = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return params.get('studio') === '1'
  }, [location.search])

  const handleOpenGithub = useCallback(() => {
    void window.windowAPI.openExternal(GITHUB_REPO_URL)
  }, [])

  const handleDismissUpdate = useCallback(() => {
    if (!updateNotice) return
    void window.settingsAPI.upsert('update_dismissed_version', updateNotice.latestVersion)
    setUpdateNotice(null)
  }, [updateNotice])

  const handleOpenUpdate = useCallback(() => {
    if (!updateNotice) return
    if (!isDesktopRuntime) {
      window.location.reload()
      return
    }
    void window.settingsAPI.upsert('update_dismissed_version', updateNotice.latestVersion)
    void window.windowAPI.openExternal(updateNotice.releaseUrl)
    setUpdateNotice(null)
  }, [isDesktopRuntime, updateNotice])

  const persistOnboardingSeen = useCallback(async () => {
    await Promise.all([
      window.settingsAPI.upsert('onboarding_seen', '1'),
      window.settingsAPI.upsert('onboarding_version', ONBOARDING_VERSION),
    ])
  }, [])

  const markOnboardingSeen = useCallback(() => {
    setOnboardingPending(false)
    void persistOnboardingSeen()
  }, [persistOnboardingSeen])

  useEffect(() => {
    if (isStudioWindow) return
    let active = true
    void window.settingsAPI
      .getAll()
      .then((rows) => {
        if (!active) return
        const seen = rows.find((row) => row.key === 'onboarding_seen')?.value === '1'
        const seenVersion = rows.find((row) => row.key === 'onboarding_version')?.value || ''
        const shouldShow = !seen || seenVersion !== ONBOARDING_VERSION
        setOnboardingPending(shouldShow)
      })
      .catch(() => {
        if (active) setOnboardingPending(true)
      })
    return () => {
      active = false
    }
  }, [isStudioWindow])

  useEffect(() => {
    if (isStudioWindow) return
    let active = true
    let inFlight = false

    async function checkUpdateNotice() {
      if (!active || inFlight) return
      inFlight = true
      try {
        const [currentVersionRaw, rows] = await Promise.all([
          window.windowAPI.getVersion(),
          window.settingsAPI.getAll(),
        ])
        if (!active) return

        const currentVersion = normalizeVersion(currentVersionRaw)
        if (!parseVersionParts(currentVersion)) return
        const dismissedVersion = normalizeVersion(
          rows.find((row) => row.key === 'update_dismissed_version')?.value || '',
        )

        let latestVersion = ''
        let releaseUrl = `${GITHUB_REPO_URL}/releases/latest`
        if (isDesktopRuntime) {
          const response = await fetch(GITHUB_RELEASES_API_URL, {
            headers: {
              accept: 'application/vnd.github+json',
            },
          })
          if (!response.ok) return
          const latest = await response.json() as {
            tag_name?: string
            html_url?: string
          }
          latestVersion = normalizeVersion(latest.tag_name ?? '')
          releaseUrl = latest.html_url || releaseUrl
        } else {
          const response = await fetch(WEB_VERSION_MANIFEST_URL, {
            cache: 'no-store',
            headers: {
              accept: 'application/json',
            },
          })
          if (!response.ok) return
          const latest = await response.json() as { version?: string }
          latestVersion = normalizeVersion(latest.version ?? '')
        }

        if (!latestVersion) return
        if (!isVersionNewer(latestVersion, currentVersion)) return
        if (dismissedVersion && dismissedVersion === latestVersion) return
        if (!active) return

        setUpdateNotice({
          currentVersion,
          latestVersion,
          releaseUrl,
        })
      } finally {
        inFlight = false
      }
    }

    void checkUpdateNotice().catch(() => undefined)
    const pollTimer = !isDesktopRuntime
      ? window.setInterval(() => {
        void checkUpdateNotice().catch(() => undefined)
      }, WEB_UPDATE_POLL_INTERVAL_MS)
      : null

    return () => {
      active = false
      if (pollTimer != null) window.clearInterval(pollTimer)
    }
  }, [isDesktopRuntime, isStudioWindow])

  useEffect(() => {
    if (!onboardingPending || isStudioWindow) return
    let disposed = false

    const styleCreateSelector = '[data-tour="genres-create"]'
    const projectCreateSelector = '[data-tour="projects-create"]'

    function waitForElement(selector: string, callback: () => void) {
      const startedAt = Date.now()
      const check = () => {
        if (disposed) return
        if (document.querySelector(selector)) {
          callback()
          return
        }
        if (Date.now() - startedAt >= 3000) {
          callback()
          return
        }
        window.setTimeout(check, 50)
      }
      check()
    }

    function navigateAndRun(to: '/genres' | '/projects', selector: string, callback: () => void) {
      Promise.resolve(navigate({ to }))
        .catch(() => undefined)
        .then(() => {
          waitForElement(selector, callback)
        })
    }

    const timer = window.setTimeout(() => {
      if (disposed) return

      const steps: DriveStep[] = [
        {
          element: '[data-tour="menu-settings"]',
          popover: {
            title: t('onboarding.stepProviderTitle'),
            description: t('onboarding.stepProviderDesc'),
            side: 'right',
            align: 'end',
          },
        },
        {
          element: styleCreateSelector,
          popover: {
            title: t('onboarding.stepStyleTitle'),
            description: t('onboarding.stepStyleDesc'),
            side: 'right',
            align: 'start',
            onNextClick: (_element, _step, { driver: onboardingDriver }) => {
              navigateAndRun('/projects', projectCreateSelector, () => {
                onboardingDriver.moveNext()
              })
            },
          },
        },
        {
          element: projectCreateSelector,
          popover: {
            title: t('onboarding.stepProjectsTitle'),
            description: t('onboarding.stepProjectsDesc'),
            side: 'left',
            align: 'center',
            onPrevClick: (_element, _step, { driver: onboardingDriver }) => {
              navigateAndRun('/genres', styleCreateSelector, () => {
                onboardingDriver.movePrevious()
              })
            },
          },
        },
        {
          popover: {
            title: t('onboarding.stepStudioTitle'),
            description: t('onboarding.stepStudioDesc'),
          },
        },
      ]

      const settingsAnchor = document.querySelector('[data-tour="menu-settings"]')
      if (!settingsAnchor) {
        markOnboardingSeen()
        return
      }

      const onboardingDriver = driver({
        showProgress: true,
        animate: true,
        allowClose: true,
        overlayClickBehavior: 'close',
        nextBtnText: t('onboarding.next'),
        prevBtnText: t('onboarding.back'),
        doneBtnText: t('onboarding.finish'),
        steps,
        onNextClick: (_element, step, { driver: activeDriver }) => {
          if (step.element === '[data-tour="menu-settings"]') {
            navigateAndRun('/genres', styleCreateSelector, () => {
              activeDriver.moveNext()
            })
            return
          }
          activeDriver.moveNext()
        },
        onDestroyed: () => {
          markOnboardingSeen()
        },
      })

      void persistOnboardingSeen()
        .catch(() => undefined)
        .finally(() => {
          if (!disposed) onboardingDriver.drive()
        })
    }, 120)

    return () => {
      disposed = true
      window.clearTimeout(timer)
    }
  }, [isStudioWindow, markOnboardingSeen, navigate, onboardingPending, persistOnboardingSeen, t])

  if (isStudioWindow) {
    return (
      <>
        {isDesktopRuntime ? (
          <div
            className="h-10 w-full shrink-0 select-none"
            style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
          />
        ) : null}
        <div className="flex-1 overflow-hidden">{children}</div>
      </>
    )
  }

  return (
    <>
      {/* 拖动区域（仅 desktop） */}
      {isDesktopRuntime ? (
        <div
          className="h-10 w-full shrink-0 select-none"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        />
      ) : null}

      <div className="drawer drawer-open flex-1 overflow-hidden">
        <input id="main-drawer" type="checkbox" className="drawer-toggle" />

        {/* 右侧内容区 */}
        <div className="drawer-content flex flex-col overflow-auto">
          {updateNotice ? (
            <div className="px-4 pt-4">
              <div className="alert border border-info/30 bg-info/10 flex items-center gap-3">
                <Download size={16} className="text-info shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {t('common.updateAvailableTitle', { version: updateNotice.latestVersion })}
                  </p>
                  <p className="text-xs text-base-content/70 mt-1">
                    {t('common.updateAvailableDesc', {
                      current: updateNotice.currentVersion,
                      latest: updateNotice.latestVersion,
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button" className="btn btn-xs btn-ghost" onClick={handleDismissUpdate}>
                    {t('common.updateLater')}
                  </button>
                  <button type="button" className="btn btn-xs btn-primary" onClick={handleOpenUpdate}>
                    {t('common.updateNow')}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          {children}
        </div>

        {/* 左侧侧边栏 */}
        <div className="drawer-side border-r border-base-300 h-full">
          <label htmlFor="main-drawer" className="drawer-overlay" />
          <aside className="bg-base-200 w-56 flex flex-col h-full">

            {/* 应用名 */}
            <div className="px-4 py-3 text-xs font-semibold text-base-content/50 uppercase tracking-widest">
              {t('common.appName')}
            </div>

            {/* 菜单 */}
            <ul className="menu bg-base-200 flex-1 px-2 w-full gap-2">
              {menuItems.map(({ to, icon: Icon, labelKey }) => {
                const isActive = location.pathname === to
                return (
                  <li key={to}>
                    <Link
                      to={to}
                      className={`${isActive ? 'menu-active' : ''} py-2`}
                      data-tour={to === '/projects' ? 'menu-projects' : to === '/genres' ? 'menu-genres' : undefined}
                    >
                      <Icon size={16} />
                      {t(labelKey)}
                    </Link>
                  </li>
                )
              })}
            </ul>

            {/* 底部：Settings 弹框触发 */}
            <div className="p-2 border-t border-base-300">
              <button
                className="flex items-center gap-2 w-full rounded-lg px-2 py-2 transition-colors hover:bg-base-300 text-left"
                onClick={() => setSettingsOpen(true)}
                data-tour="menu-settings"
              >
                <Settings size={16} />
                <span className="text-sm">{t('menu.settings')}</span>
              </button>
              <button
                className="flex items-center gap-2 w-full rounded-lg px-2 py-2 transition-colors hover:bg-base-300 text-left"
                onClick={handleOpenGithub}
              >
                <Github size={16} />
                <span className="text-sm">{t('menu.github')}</span>
              </button>
            </div>

            <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

          </aside>
        </div>
      </div>
    </>
  )
}
