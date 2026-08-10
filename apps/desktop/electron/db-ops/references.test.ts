import { describe, expect, it, vi } from 'vitest'

import { pruneShotReferences, removeSerializedIds } from './references'

describe('removeSerializedIds', () => {
  it('removes deleted entity ids and deduplicates retained ids', () => {
    expect(removeSerializedIds('["character-1","character-2","character-2"]', new Set(['character-1']))).toBe(
      '["character-2"]',
    )
  })

  it('normalizes malformed persisted values to an empty list', () => {
    expect(removeSerializedIds('not-json', new Set(['character-1']))).toBe('[]')
  })
})

describe('pruneShotReferences', () => {
  it('updates only shots that contain removed entity ids', () => {
    const all = vi.fn().mockReturnValue([
      { id: 'shot-1', references: '["character-1","character-2"]' },
      { id: 'shot-2', references: '["character-2"]' },
    ])
    const run = vi.fn()
    const prepare = vi.fn().mockImplementation((sql: string) => (
      sql.startsWith('SELECT') ? { all } : { run }
    ))

    pruneShotReferences(
      { prepare },
      'character_ids',
      new Set(['character-1']),
      'project-1',
    )

    expect(all).toHaveBeenCalledWith('project-1')
    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledWith('["character-2"]', 'shot-1')
  })
})
