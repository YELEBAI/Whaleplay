import { describe, it, expect } from 'vitest'
import { formatPreview } from '../prompt-preview'
import type { BuiltPrompt, GenerateMessage, ContextBlock } from '@neo-tavern/shared'

function makeBlock(overrides: Partial<ContextBlock> = {}): ContextBlock {
  return {
    id: 'cb-1',
    source: 'worldbook',
    title: 'Test Block',
    content: 'Test content',
    priority: 10,
    ...overrides,
  }
}

describe('formatPreview', () => {
  const messages: GenerateMessage[] = [
    { role: 'system', content: 'System instructions here.' },
    { role: 'assistant', content: 'Hello there.' },
    { role: 'user', content: 'Hi!' },
  ]

  it('should include header and token estimate', () => {
    const built: BuiltPrompt = {
      messages,
      previewText: 'Preview text',
      tokenEstimate: 42,
      includedContextBlocks: [],
    }

    const result = formatPreview(built)

    expect(result).toContain('# Prompt Preview')
    expect(result).toContain('**Token Estimate:** ~42 tokens')
  })

  it('should include message count', () => {
    const built: BuiltPrompt = {
      messages,
      previewText: 'Preview',
      tokenEstimate: 10,
      includedContextBlocks: [],
    }

    const result = formatPreview(built)

    expect(result).toContain('**Messages:** 3')
  })

  it('should include the preview text', () => {
    const built: BuiltPrompt = {
      messages,
      previewText: '## system\nRules\n\n---\n\n## user\nQuestion',
      tokenEstimate: 5,
      includedContextBlocks: [],
    }

    const result = formatPreview(built)

    expect(result).toContain('## system')
    expect(result).toContain('Rules')
    expect(result).toContain('## user')
    expect(result).toContain('Question')
  })

  it('should list context blocks when present', () => {
    const built: BuiltPrompt = {
      messages,
      previewText: 'Preview',
      tokenEstimate: 10,
      includedContextBlocks: [
        makeBlock({ id: 'wb-1', source: 'worldbook', title: 'Lore Entry', priority: 5 }),
        makeBlock({ id: 'mem-1', source: 'memory', title: 'Memory Entry', priority: 10 }),
      ],
    }

    const result = formatPreview(built)

    expect(result).toContain('## Included Context Blocks')
    expect(result).toContain('- [worldbook] Lore Entry (priority: 5)')
    expect(result).toContain('- [memory] Memory Entry (priority: 10)')
  })

  it('should not show context blocks section when empty', () => {
    const built: BuiltPrompt = {
      messages,
      previewText: 'Preview',
      tokenEstimate: 10,
      includedContextBlocks: [],
    }

    const result = formatPreview(built)

    expect(result).not.toContain('## Included Context Blocks')
  })

  it('should handle zero token estimate', () => {
    const built: BuiltPrompt = {
      messages: [],
      previewText: '',
      tokenEstimate: 0,
      includedContextBlocks: [],
    }

    const result = formatPreview(built)

    expect(result).toContain('**Token Estimate:** ~0 tokens')
    expect(result).toContain('**Messages:** 0')
  })

  it('should handle empty messages and preview text cleanly', () => {
    const built: BuiltPrompt = {
      messages: [],
      previewText: '',
      tokenEstimate: 0,
      includedContextBlocks: [],
    }

    const result = formatPreview(built)

    expect(result).toBeDefined()
    expect(result.length).toBeGreaterThan(0)
  })
})
