import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderOpen, FolderInput, RotateCcw, RefreshCw, CheckCircle, Loader, XCircle } from 'lucide-react'
import type { ObjectStorageConfig, ObjectStorageProvider } from '../../utils/storage_config'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

interface DataSettingsPanelProps {
  storageConfig: ObjectStorageConfig
  onStorageConfigChange: (next: ObjectStorageConfig) => void
}

type TestState = 'idle' | 'testing' | 'ok' | 'error'

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return typeof err === 'string' ? err : 'Unknown error'
}

export function DataSettingsPanel({ storageConfig, onStorageConfigChange }: DataSettingsPanelProps) {
  const { t } = useTranslation()
  const isDesktopRuntime = useMemo(
    () => typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent),
    [],
  )
  const [info, setInfo] = useState<{
    defaultDir: string
    currentDir: string
    pendingDir: string
    dbSize: number
    thumbsSize: number
    videosSize: number
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [cleaning, setCleaning] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [migrationError, setMigrationError] = useState('')
  const [cleanupConfirmOpen, setCleanupConfirmOpen] = useState(false)
  const [cleanupResult, setCleanupResult] = useState<{
    removedImages: number
    removedVideos: number
    freedBytes: number
  } | null>(null)
  const [objectStorageTestState, setObjectStorageTestState] = useState<TestState>('idle')
  const [objectStorageTestError, setObjectStorageTestError] = useState('')

  function load() {
    setLoading(true)
    window.dataAPI.getInfo()
      .then((data) => {
        setInfo(data)
      })
      .finally(() => {
        setLoading(false)
      })
  }

  useEffect(() => { load() }, [])

  async function handleChange() {
    const dir = await window.dataAPI.selectDirectory()
    if (!dir) return
    await window.dataAPI.setDirectory(dir)
    setMigrationError('')
    load()
  }

  async function handleReset() {
    await window.dataAPI.resetDirectory()
    setMigrationError('')
    load()
  }

  async function handleRestart() {
    setMigrating(true)
    setMigrationError('')
    try {
      await window.dataAPI.restart()
    } catch (error: unknown) {
      setMigrationError(toErrorMessage(error))
      setMigrating(false)
      load()
    }
  }

  async function handleCleanup() {
    setCleaning(true)
    try {
      const result = await window.dataAPI.cleanupUnusedMedia()
      setCleanupResult(result)
      load()
    } finally {
      setCleaning(false)
    }
  }

  const hasPending = info && info.pendingDir !== '' && info.pendingDir !== info.currentDir
  const usingObjectStorage = storageConfig.provider !== 'local'
  const canTestObjectStorage = usingObjectStorage
    && Boolean(storageConfig.endpoint.trim())
    && Boolean(storageConfig.bucket.trim())
    && Boolean(storageConfig.accessKeyId.trim())
    && Boolean(storageConfig.secretAccessKey.trim())

  function updateStorageConfig<Key extends keyof ObjectStorageConfig>(key: Key, value: ObjectStorageConfig[Key]) {
    setObjectStorageTestState('idle')
    setObjectStorageTestError('')
    onStorageConfigChange({
      ...storageConfig,
      [key]: value,
    })
  }

  async function handleTestObjectStorage() {
    setObjectStorageTestState('testing')
    setObjectStorageTestError('')
    try {
      const testObjectStorage = (
        window.dataAPI as Window['dataAPI'] & {
          testObjectStorage?: (config: ObjectStorageConfig) => Promise<{ ok: boolean; error?: string; url?: string }>
        }
      ).testObjectStorage

      if (!testObjectStorage) {
        setObjectStorageTestState('error')
        setObjectStorageTestError(t('settings.objectStorageTestUnavailable'))
        return
      }

      const result = await testObjectStorage(storageConfig)
      if (result.ok) {
        setObjectStorageTestState('ok')
        return
      }
      setObjectStorageTestState('error')
      setObjectStorageTestError(result.error ?? '')
    } catch (err: unknown) {
      setObjectStorageTestState('error')
      setObjectStorageTestError(toErrorMessage(err))
    }
  }

  return (
    <div className="h-full overflow-auto px-6 py-5 flex flex-col gap-6">
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <span className="loading loading-spinner loading-md" />
        </div>
      ) : info && (
        <>
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold">{t('settings.objectStorage')}</h4>
              <span className="badge badge-sm badge-outline uppercase">{storageConfig.provider}</span>
            </div>
            <p className="text-xs text-base-content/60">{t('settings.objectStorageHint')}</p>

            <label className="form-control">
              <span className="label-text text-xs text-base-content/60">{t('settings.objectStorageProvider')}</span>
              <select
                className="select select-bordered select-sm w-full mt-1"
                value={storageConfig.provider}
                onChange={(event) => updateStorageConfig('provider', event.target.value as ObjectStorageProvider)}
              >
                <option value="local">{t('settings.objectStorageProviderLocal')}</option>
                <option value="s3">{t('settings.objectStorageProviderS3')}</option>
                <option value="oss">{t('settings.objectStorageProviderOss')}</option>
                <option value="cos">{t('settings.objectStorageProviderCos')}</option>
              </select>
            </label>

            {usingObjectStorage ? (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="form-control">
                    <span className="label-text text-xs text-base-content/60">{t('settings.objectStorageEndpoint')}</span>
                    <input
                      className="input input-bordered input-sm mt-1"
                      value={storageConfig.endpoint}
                      onChange={(event) => updateStorageConfig('endpoint', event.target.value)}
                      placeholder={t('settings.objectStorageEndpointPlaceholder')}
                    />
                  </label>

                  <label className="form-control">
                    <span className="label-text text-xs text-base-content/60">{t('settings.objectStorageRegion')}</span>
                    <input
                      className="input input-bordered input-sm mt-1"
                      value={storageConfig.region}
                      onChange={(event) => updateStorageConfig('region', event.target.value)}
                      placeholder={t('settings.objectStorageRegionPlaceholder')}
                    />
                  </label>

                  <label className="form-control">
                    <span className="label-text text-xs text-base-content/60">{t('settings.objectStorageBucket')}</span>
                    <input
                      className="input input-bordered input-sm mt-1"
                      value={storageConfig.bucket}
                      onChange={(event) => updateStorageConfig('bucket', event.target.value)}
                      placeholder={t('settings.objectStorageBucketPlaceholder')}
                    />
                  </label>

                  <label className="form-control">
                    <span className="label-text text-xs text-base-content/60">{t('settings.objectStoragePrefix')}</span>
                    <input
                      className="input input-bordered input-sm mt-1"
                      value={storageConfig.pathPrefix}
                      onChange={(event) => updateStorageConfig('pathPrefix', event.target.value)}
                      placeholder={t('settings.objectStoragePrefixPlaceholder')}
                    />
                  </label>

                  <label className="form-control">
                    <span className="label-text text-xs text-base-content/60">{t('settings.objectStorageAccessKeyId')}</span>
                    <input
                      className="input input-bordered input-sm mt-1"
                      value={storageConfig.accessKeyId}
                      onChange={(event) => updateStorageConfig('accessKeyId', event.target.value)}
                      placeholder={t('settings.objectStorageAccessKeyIdPlaceholder')}
                    />
                  </label>

                  <label className="form-control">
                    <span className="label-text text-xs text-base-content/60">{t('settings.objectStorageSecretAccessKey')}</span>
                    <input
                      className="input input-bordered input-sm mt-1"
                      type="password"
                      value={storageConfig.secretAccessKey}
                      onChange={(event) => updateStorageConfig('secretAccessKey', event.target.value)}
                      placeholder={t('settings.objectStorageSecretAccessKeyPlaceholder')}
                    />
                  </label>
                </div>

                <label className="form-control flex flex-col">
                  <span className="label-text text-xs text-base-content/60">{t('settings.objectStoragePublicBaseUrl')}</span>
                  <input
                    className="input input-bordered input-sm mt-1"
                    value={storageConfig.publicBaseUrl}
                    onChange={(event) => updateStorageConfig('publicBaseUrl', event.target.value)}
                    placeholder={t('settings.objectStoragePublicBaseUrlPlaceholder')}
                  />
                </label>

                {storageConfig.provider === 's3' ? (
                  <label className="label cursor-pointer justify-start gap-2 rounded-lg border border-base-300 px-3 py-2">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm"
                      checked={storageConfig.forcePathStyle}
                      onChange={(event) => updateStorageConfig('forcePathStyle', event.target.checked)}
                    />
                    <span className="label-text">{t('settings.objectStorageForcePathStyle')}</span>
                  </label>
                ) : null}

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-base-content/60 uppercase tracking-wide">
                    {t('settings.objectStorageTestConnection')}
                  </label>
                  <div className="flex gap-1.5">
                    <button
                      className="btn btn-outline shrink-0"
                      disabled={objectStorageTestState === 'testing' || !canTestObjectStorage}
                      onClick={() => void handleTestObjectStorage()}
                    >
                      {objectStorageTestState === 'testing' ? (
                        <Loader size={14} className="animate-spin" />
                      ) : objectStorageTestState === 'ok' ? (
                        <CheckCircle size={14} className="text-success" />
                      ) : objectStorageTestState === 'error' ? (
                        <XCircle size={14} className="text-error" />
                      ) : null}
                      {t('settings.objectStorageTestConnection')}
                    </button>
                  </div>
                  {!canTestObjectStorage && (
                    <p className="text-xs text-base-content/60">
                      {t('settings.objectStorageTestMissingConfig')}
                    </p>
                  )}
                  {objectStorageTestState === 'error' && objectStorageTestError && (
                    <p className="text-xs text-error">{objectStorageTestError}</p>
                  )}
                  {objectStorageTestState === 'ok' && (
                    <p className="text-xs text-success">{t('settings.objectStorageTestSuccess')}</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-xs text-base-content/60 rounded-lg border border-base-300 bg-base-200 px-3 py-2">
                {t('settings.objectStorageLocalHint')}
              </div>
            )}
          </section>

          {/* Storage location */}
          <section className="flex flex-col gap-3">
            <h4 className="text-sm font-semibold">{t('settings.dataStorage')}</h4>

            <div className="bg-base-200 rounded-lg p-4 flex flex-col gap-1">
              <span className="text-xs text-base-content/50">{t('settings.dataCurrentDir')}</span>
              <span className="text-sm font-mono break-all">{info.currentDir}</span>
            </div>

            {isDesktopRuntime && (
              <div className="flex gap-2">
                <button className="btn btn-sm btn-ghost gap-1" onClick={() => window.dataAPI.openDirectory()}>
                  <FolderOpen size={14} />
                  {t('settings.dataOpenDir')}
                </button>
                <button className="btn btn-sm btn-ghost gap-1" onClick={handleChange}>
                  <FolderInput size={14} />
                  {t('settings.dataChangeDir')}
                </button>
                {info.currentDir !== info.defaultDir && (
                  <button className="btn btn-sm btn-ghost gap-1" onClick={handleReset}>
                    <RotateCcw size={14} />
                    {t('settings.dataResetDir')}
                  </button>
                )}
              </div>
            )}
          </section>

          {/* Pending restart banner */}
          {hasPending && (
            <div className="alert alert-warning flex flex-col items-start gap-2">
              <div>
                <p className="font-semibold text-sm">{t('settings.dataRestartRequired')}</p>
                <p className="text-xs opacity-80">{t('settings.dataRestartHint')}</p>
                <p className="text-xs font-mono mt-1 break-all">{info.pendingDir}</p>
                {migrationError && (
                  <p className="text-xs text-error mt-1">{t('settings.dataMigrationFailed', { error: migrationError })}</p>
                )}
              </div>
              <button
                className="btn btn-sm btn-warning gap-1"
                disabled={migrating}
                onClick={() => void handleRestart()}
              >
                <RefreshCw size={14} className={migrating ? 'animate-spin' : ''} />
                {migrating ? t('settings.dataMigrating') : t('settings.dataRestart')}
              </button>
            </div>
          )}

          {/* Storage usage */}
          <section className="flex flex-col gap-3">
            <h4 className="text-sm font-semibold">{t('settings.dataUsage')}</h4>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between py-2 border-b border-base-200">
                <span className="text-sm">{t('settings.dataDbSize')}</span>
                <span className="text-sm font-mono text-base-content/60">{formatBytes(info.dbSize)}</span>
              </div>
              {isDesktopRuntime && (
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm">{t('settings.dataThumbsSize')}</span>
                  <span className="text-sm font-mono text-base-content/60">{formatBytes(info.thumbsSize)}</span>
                </div>
              )}
              {isDesktopRuntime && (
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm">{t('settings.dataVideosSize')}</span>
                  <span className="text-sm font-mono text-base-content/60">{formatBytes(info.videosSize)}</span>
                </div>
              )}
            </div>
          </section>

          {isDesktopRuntime && (
            <section className="flex flex-col gap-2">
              <h4 className="text-sm font-semibold">{t('settings.dataCleanup')}</h4>
              <p className="text-xs text-base-content/60">{t('settings.dataCleanupHint')}</p>
              <div>
                <button
                  className="btn btn-sm btn-outline"
                  onClick={() => setCleanupConfirmOpen(true)}
                  disabled={cleaning}
                >
                  {cleaning ? t('settings.dataCleanupRunning') : t('settings.dataCleanupButton')}
                </button>
              </div>
              {cleanupResult && (
                <p className="text-xs text-base-content/60">
                  {t('settings.dataCleanupResult', {
                    images: cleanupResult.removedImages,
                    videos: cleanupResult.removedVideos,
                    size: formatBytes(cleanupResult.freedBytes),
                  })}
                </p>
              )}
            </section>
          )}

          {isDesktopRuntime && cleanupConfirmOpen && (
            <dialog className="modal modal-open">
              <div className="modal-box max-w-sm">
                <h3 className="font-bold mb-3">{t('settings.dataCleanup')}</h3>
                <p className="text-sm text-base-content/70">{t('settings.dataCleanupConfirm')}</p>
                <div className="modal-action">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setCleanupConfirmOpen(false)}
                  >
                    {t('settings.cancel')}
                  </button>
                  <button
                    className="btn btn-warning btn-sm"
                    onClick={() => {
                      setCleanupConfirmOpen(false)
                      void handleCleanup()
                    }}
                  >
                    {t('settings.dataCleanupButton')}
                  </button>
                </div>
              </div>
              <div className="modal-backdrop" onClick={() => setCleanupConfirmOpen(false)} />
            </dialog>
          )}
        </>
      )}
    </div>
  )
}
