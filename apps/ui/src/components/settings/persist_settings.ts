type PersistSettingsOptions<AIConfig> = {
  settings: Record<string, string>
  aiConfig: AIConfig
  upsertSetting: (key: string, value: string) => Promise<void>
  saveAIConfig: (config: AIConfig) => Promise<void>
}

export async function persistSettings<AIConfig>({
  settings,
  aiConfig,
  upsertSetting,
  saveAIConfig,
}: PersistSettingsOptions<AIConfig>): Promise<void> {
  await Promise.all([
    ...Object.entries(settings).map(([key, value]) => upsertSetting(key, value)),
    saveAIConfig(aiConfig),
  ])
}
