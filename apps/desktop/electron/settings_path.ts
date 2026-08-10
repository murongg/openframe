import path from 'node:path'

export function resolveSettingsDirectory(appDataDirectory: string): string {
  return path.join(appDataDirectory, 'openframe')
}

export function resolveLegacySettingsFiles(appDataDirectory: string): string[] {
  return [
    path.join(appDataDirectory, '@openframe', 'desktop', 'settings.json'),
    path.join(appDataDirectory, 'Openframe', 'settings.json'),
  ]
}
