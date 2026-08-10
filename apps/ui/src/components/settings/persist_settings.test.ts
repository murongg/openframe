import { describe, expect, it, vi } from 'vitest'

import { persistSettings } from './persist_settings'

describe('persistSettings', () => {
  it('waits for every setting and the AI config before resolving', async () => {
    let finishAIWrite: (() => void) | undefined
    let finishSettingWrite: (() => void) | undefined
    const aiWrite = new Promise<void>((resolve) => {
      finishAIWrite = resolve
    })
    const settingWrite = new Promise<void>((resolve) => {
      finishSettingWrite = resolve
    })
    const upsertSetting = vi.fn()
      .mockReturnValueOnce(settingWrite)
      .mockResolvedValue(undefined)
    const saveAIConfig = vi.fn().mockReturnValue(aiWrite)
    let resolved = false

    const pending = persistSettings({
      settings: { language: 'zh', theme: 'dark' },
      aiConfig: { providers: {} },
      upsertSetting,
      saveAIConfig,
    }).then(() => {
      resolved = true
    })

    await Promise.resolve()
    expect(resolved).toBe(false)
    expect(upsertSetting).toHaveBeenCalledTimes(2)

    finishAIWrite?.()
    await Promise.resolve()
    expect(resolved).toBe(false)

    finishSettingWrite?.()
    await pending
    expect(resolved).toBe(true)
  })
})
