import { describe, expect, it } from 'vitest'

import { removeIds } from './runtime_db'

describe('removeIds', () => {
  it('removes deleted ids while preserving order and uniqueness', () => {
    expect(removeIds(
      ['prop-1', 'prop-2', 'prop-2'],
      new Set(['prop-1']),
    )).toEqual(['prop-2'])
  })
})
