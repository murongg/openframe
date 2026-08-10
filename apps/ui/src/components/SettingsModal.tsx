import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { X, Settings, Bot, HardDrive, SlidersHorizontal } from 'lucide-react'
import { useLiveQuery } from '@tanstack/react-db'
import { settingsCollection } from '../db/settings_collection'
import { type AIConfig, DEFAULT_AI_CONFIG } from '@openframe/providers'
import { GeneralSettingsPanel, type Theme } from './settings/GeneralSettingsPanel'
import { AISettingsPanel, MediaConcurrencyPanel } from './settings/AISettingsPanel'
import { DataSettingsPanel } from './settings/DataSettingsPanel'
import { normalizeLanguage, type UILanguage } from '../utils/language'
import {
  DEFAULT_OBJECT_STORAGE_CONFIG,
  parseObjectStorageConfigFromSetting,
  stringifyObjectStorageConfigForSetting,
  type ObjectStorageConfig,
} from '../utils/storage_config'
import { persistSettings } from './settings/persist_settings'

type Category = 'general' | 'provider' | 'concurrency' | 'data'

interface SettingsModalProps {
  open: boolean
  onClose: () => void
}

const categories: { id: Category; labelKey: string; icon: React.ReactNode }[] = [
  { id: 'general',   labelKey: 'settings.general',   icon: <Settings size={16} /> },
  { id: 'provider',  labelKey: 'settings.provider',  icon: <Bot size={16} /> },
  { id: 'concurrency', labelKey: 'settings.concurrency', icon: <SlidersHorizontal size={16} /> },
  { id: 'data',      labelKey: 'settings.data',      icon: <HardDrive size={16} /> },
]

function applyTheme(theme: Theme) {
  const html = document.documentElement
  if (theme === 'system') {
    html.removeAttribute('data-theme')
  } else {
    html.setAttribute('data-theme', theme)
  }
}

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { t, i18n } = useTranslation()
  const [activeCategory, setActiveCategory] = useState<Category>('provider')
  const fallbackLanguage = normalizeLanguage(i18n.language, 'en')

  const [pendingLang,  setPendingLang]  = useState<UILanguage>(fallbackLanguage)
  const [pendingTheme, setPendingTheme] = useState<Theme>('system')
  const [pendingAI,    setPendingAI]    = useState<AIConfig>(DEFAULT_AI_CONFIG)
  const [pendingStorage, setPendingStorage] = useState<ObjectStorageConfig>(DEFAULT_OBJECT_STORAGE_CONFIG)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const { data: settingsList } = useLiveQuery(settingsCollection)

  const settingsMap = useMemo(
    () => Object.fromEntries((settingsList ?? []).map((s) => [s.id, s.value])),
    [settingsList],
  )

  useEffect(() => {
    if (!open) return
    setPendingLang(normalizeLanguage(settingsMap.language, fallbackLanguage))
    setPendingTheme((settingsMap.theme as Theme) ?? 'system')
    setPendingStorage(parseObjectStorageConfigFromSetting(settingsMap.storage_config))
    window.aiAPI.getConfig().then((cfg) => setPendingAI((cfg as AIConfig) ?? DEFAULT_AI_CONFIG))
  }, [open, settingsMap.language, settingsMap.theme, settingsMap.storage_config, fallbackLanguage])

  async function upsertSetting(key: string, value: string): Promise<void> {
    const transaction = settingsList?.some((s) => s.id === key)
      ? settingsCollection.update(key, (draft) => { draft.value = value })
      : settingsCollection.insert({ id: key, value })
    await transaction.isPersisted.promise
  }

  async function handleSave() {
    if (saving) return
    const nextLang = normalizeLanguage(pendingLang, fallbackLanguage)
    setSaving(true)
    setSaveError('')
    try {
      await persistSettings({
        settings: {
          theme: pendingTheme,
          language: nextLang,
          storage_config: stringifyObjectStorageConfigForSetting(pendingStorage),
        },
        aiConfig: pendingAI,
        upsertSetting,
        saveAIConfig: (config) => window.aiAPI.saveConfig(config),
      })
      await i18n.changeLanguage(nextLang)
      applyTheme(pendingTheme)
      onClose()
    } catch {
      setSaveError(t('settings.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setPendingLang(normalizeLanguage(settingsMap.language, fallbackLanguage))
    setPendingTheme((settingsMap.theme as Theme) ?? 'system')
    setPendingStorage(parseObjectStorageConfigFromSetting(settingsMap.storage_config))
    window.aiAPI.getConfig().then((cfg) => setPendingAI((cfg as AIConfig) ?? DEFAULT_AI_CONFIG))
    onClose()
  }

  return createPortal(
    <dialog className={`modal ${open ? 'modal-open' : ''}`}>
      <div className="modal-box p-0 max-w-4xl w-full h-[600px] flex flex-col overflow-hidden">
        <div className="flex flex-1 overflow-hidden">

          {/* ── Category Sidebar ── */}
          <aside className="w-52 shrink-0 bg-base-200 flex flex-col p-4 gap-1">
            <h2 className="text-base font-semibold mb-2">{t('menu.settings')}</h2>
            <ul className="menu bg-base-200 p-0 w-full gap-1">
              {categories.map(({ id, labelKey, icon }) => (
                <li key={id}>
                  <a
                    className={activeCategory === id ? 'menu-active' : ''}
                    onClick={() => setActiveCategory(id)}
                  >
                    {icon}
                    {t(labelKey)}
                  </a>
                </li>
              ))}
            </ul>
          </aside>

          {/* ── Content ── */}
          <div className="flex-1 flex flex-col overflow-hidden border-l border-base-300">

            {/* Title bar */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-base-300 shrink-0">
              <h3 className="text-base font-semibold">{t(`settings.${activeCategory}`)}</h3>
              <button className="btn btn-ghost btn-circle" onClick={handleCancel}>
                <X size={16} />
              </button>
            </div>

            {/* Settings body */}
            {activeCategory === 'provider' ? (
              <div className="flex-1 overflow-hidden">
                <AISettingsPanel config={pendingAI} onChange={setPendingAI} />
              </div>
            ) : activeCategory === 'concurrency' ? (
              <div className="flex-1 overflow-hidden">
                <MediaConcurrencyPanel config={pendingAI} onChange={setPendingAI} />
              </div>
            ) : activeCategory === 'data' ? (
              <div className="flex-1 overflow-hidden">
                <DataSettingsPanel
                  storageConfig={pendingStorage}
                  onStorageConfigChange={setPendingStorage}
                />
              </div>
            ) : (
              <div className="flex-1 overflow-auto px-6 py-5 flex flex-col gap-7">
                <GeneralSettingsPanel
                  pendingLang={pendingLang}
                  setPendingLang={setPendingLang}
                  pendingTheme={pendingTheme}
                  setPendingTheme={setPendingTheme}
                />
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-base-300 shrink-0">
              <p className="text-xs text-error" role="alert">{saveError}</p>
              <div className="flex justify-end gap-2">
                <button className="btn btn-ghost" onClick={handleCancel} disabled={saving}>
                  {t('settings.cancel')}
                </button>
                <button className="btn btn-primary" onClick={() => void handleSave()} disabled={saving}>
                  {saving ? <span className="loading loading-spinner loading-xs" /> : null}
                  {saving ? t('settings.saving') : t('settings.save')}
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
      <div className="modal-backdrop" onClick={() => { if (!saving) handleCancel() }} />
    </dialog>,
    document.body
  )
}
