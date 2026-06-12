import { describe, expect, it } from 'vitest'
import { applyRegexRules, stripPromptContent } from '../index'
import type { RegexRule } from '@neo-tavern/shared'

const baseRule = {
  id: 'rule',
  presetId: 'preset',
  stripFromPrompt: false,
  enabled: true,
  createdAt: '2024-01-01T00:00:00Z',
}

const innerThoughtRule: RegexRule = {
  ...baseRule,
  id: 'inner',
  name: '💭 Inner Thoughts',
  pattern: '<details><summary>内心-([^<]+)</summary>([\\s\\S]*?)</details>',
  displayTemplate: '<details class="neo-thoughts" open><summary>💭 $1</summary>$2</details>',
}

describe('applyRegexRules', () => {
  it('keeps inner thoughts at their original display position', () => {
    const result = applyRegexRules([
      '第一段。',
      '<details><summary>内心-露娜</summary>她把书页按平。</details>',
      '第二段。',
    ].join('\n'), [innerThoughtRule])

    expect(result.sideBlocks).toHaveLength(0)
    expect(result.displayBlocks.map((block) => block.type)).toEqual(['narration', 'template', 'narration'])
    expect(result.displayBlocks[0].content).toBe('第一段。')
    expect(result.displayBlocks[1].content).toContain('class="neo-thoughts"')
    expect(result.displayBlocks[1].content).toContain('💭 露娜')
    expect(result.displayBlocks[2].content).toBe('第二段。')
  })

  it('does not turn summary blocks into inline thoughts', () => {
    const summaryRule: RegexRule = {
      ...baseRule,
      id: 'summary',
      name: '📋 Summary',
      pattern: '(?<!<details>)\\s*<summary>([\\s\\S]*?)</summary>',
      displayTemplate: '<details class="neo-summary"><summary>剧情摘要</summary>$1</details>',
    }

    const result = applyRegexRules('正文。\n<summary>摘要内容</summary>', [summaryRule])

    expect(result.displayContent).toBe('正文。')
    expect(result.sideBlocks).toHaveLength(1)
    expect(result.sideBlocks[0].content).toContain('neo-summary')
  })

  it('turns image markers into inline image display blocks', () => {
    const result = applyRegexRules('门打开了。\n[image]cinematic library, moonlight[/image]\n她走进房间。', [])

    expect(result.sideBlocks).toHaveLength(0)
    expect(result.displayBlocks.map((block) => block.type)).toEqual(['narration', 'image', 'narration'])
    expect(result.displayBlocks[1].content).toBe('cinematic library, moonlight')
    expect(result.promptContent).toBe('门打开了。\n\n她走进房间。')
  })

  it('turns structured dialogue JSON into dialogue display blocks', () => {
    const result = applyRegexRules([
      '门外的雨声压低了大厅里的回音。',
      '{"type":"dialogue","speaker":"露娜","text":"你好。"}',
      '她把书页合上。',
      '```json',
      '{"type":"dialogue","speaker":"玩家","text":"我想找一本红色封皮的书。"}',
      '```',
    ].join('\n'), [])

    expect(result.displayBlocks.map((block) => block.type)).toEqual(['narration', 'dialogue', 'narration', 'dialogue'])
    expect(result.displayBlocks[1]).toMatchObject({ speaker: '露娜', content: '你好。' })
    expect(result.displayBlocks[3]).toMatchObject({ speaker: '玩家', content: '我想找一本红色封皮的书。' })
    expect(result.displayContent).not.toContain('"type":"dialogue"')
  })

  it('strips image markers from prompt history even without custom rules', () => {
    const result = stripPromptContent('正文前。\n[image]cinematic library, moonlight[/image]\n正文后。', [])

    expect(result).toBe('正文前。\n\n正文后。')
  })

  it('stripPromptContent should ignore disabled rules', () => {
    const rule: RegexRule = {
      ...baseRule,
      id: 'disabled-strip',
      name: 'Disabled Strip',
      pattern: 'REMOVE_ME',
      displayTemplate: '',
      stripFromPrompt: true,
      enabled: false,
    }
    const result = stripPromptContent('KEEP REMOVE_ME', [rule])
    expect(result).toContain('REMOVE_ME')
  })

  it('stripPromptContent should only strip rules with stripFromPrompt', () => {
    const rule: RegexRule = {
      ...baseRule,
      id: 'no-strip',
      name: 'No Strip',
      pattern: 'KEEP_ME',
      displayTemplate: '$1',
      stripFromPrompt: false,
    }
    const result = stripPromptContent('KEEP_ME text', [rule])
    expect(result).toContain('KEEP_ME')
  })
})

describe('applyRegexRules edge cases', () => {
  it('ignores disabled rules', () => {
    const rule: RegexRule = {
      ...baseRule,
      id: 'disabled',
      name: 'Disabled Rule',
      pattern: 'remove',
      displayTemplate: '$1',
      stripFromPrompt: true,
      enabled: false,
    }
    const result = applyRegexRules('do not remove', [rule])
    expect(result.displayContent).toContain('do not remove')
  })

  it('handles empty rules array', () => {
    const result = applyRegexRules('plain text', [])
    expect(result.displayContent).toBe('plain text')
    expect(result.promptContent).toBe('plain text')
    expect(result.displayBlocks).toHaveLength(0)
    expect(result.sideBlocks).toHaveLength(0)
  })

  it('handles empty content', () => {
    const result = applyRegexRules('', [innerThoughtRule])
    expect(result.displayContent).toBe('')
    expect(result.promptContent).toBe('')
  })

  it('strips prompt-strip rules from display content', () => {
    const stripRule: RegexRule = {
      ...baseRule,
      id: 'strip',
      name: 'Strip Me',
      pattern: '\\(OOC:.*?\\)',
      displayTemplate: '',
      stripFromPrompt: true,
    }
    const result = applyRegexRules('Hello (OOC: meta note) world', [stripRule])
    expect(result.displayContent).toBe('Hello  world')
    expect(result.promptContent).toBe('Hello  world')
  })

  it('applies unwrap rules (displayTemplate = $1)', () => {
    const unwrapRule: RegexRule = {
      ...baseRule,
      id: 'unwrap',
      name: 'Unwrap',
      pattern: '\\*\\*(.*?)\\*\\*',
      displayTemplate: '$1',
      stripFromPrompt: false,
    }
    const result = applyRegexRules('Say **hello** loudly', [unwrapRule])
    expect(result.displayContent).toBe('Say hello loudly')
  })

  it('escapes regex special characters safely (graceful error handling)', () => {
    const badRule: RegexRule = {
      ...baseRule,
      id: 'bad',
      name: 'Bad Regex',
      pattern: '[unclosed',
      displayTemplate: '$1',
      stripFromPrompt: false,
    }
    // Should not throw; just skip the malformed rule
    expect(() => applyRegexRules('text', [badRule])).not.toThrow()
    const result = applyRegexRules('text', [badRule])
    expect(result.displayContent).toBe('text')
  })

  it('handles inner thoughts in the middle of text', () => {
    const result = applyRegexRules([
      '开始。',
      '<details><summary>内心-小明</summary>他在想些什么。</details>',
      '结束。',
    ].join('\n'), [innerThoughtRule])
    expect(result.displayBlocks).toHaveLength(3)
    expect(result.displayBlocks[0]).toMatchObject({ type: 'narration', content: '开始。' })
    expect(result.displayBlocks[1]).toMatchObject({ type: 'template', name: '💭 Inner Thoughts' })
    expect(result.displayBlocks[2]).toMatchObject({ type: 'narration', content: '结束。' })
  })

  it('handles multiple image markers', () => {
    const result = applyRegexRules(
      '[image]forest scene[/image] text [image]castle view[/image]',
      []
    )
    expect(result.displayBlocks).toHaveLength(3)
    expect(result.displayBlocks[0]).toMatchObject({ type: 'image', content: 'forest scene' })
    expect(result.displayBlocks[1]).toMatchObject({ type: 'narration', content: 'text' })
    expect(result.displayBlocks[2]).toMatchObject({ type: 'image', content: 'castle view' })
  })

  it('handles structured dialogue in array JSON format', () => {
    const result = applyRegexRules(
      '[{ "type": "dialogue", "speaker": "A", "text": "Hello" }, { "type": "dialogue", "speaker": "B", "text": "Hi" }]',
      []
    )
    expect(result.displayBlocks).toHaveLength(2)
    expect(result.displayBlocks[0]).toMatchObject({ type: 'dialogue', speaker: 'A', content: 'Hello' })
    expect(result.displayBlocks[1]).toMatchObject({ type: 'dialogue', speaker: 'B', content: 'Hi' })
  })

  it('handles invalid JSON gracefully in dialogue tags', () => {
    const result = applyRegexRules(
      '<dialogue>not valid json</dialogue>',
      []
    )
    expect(result.displayContent).toContain('<dialogue>not valid json</dialogue>')
  })

  it('splits content with dialogue rule into narration and dialogue blocks', () => {
    const dialogueRule: RegexRule = {
      ...baseRule,
      id: 'dia',
      name: '💬 Dialogue',
      pattern: '([^\\n：]+)："([^"]*)"',
      displayTemplate: '$1 said $2',
    }
    const result = applyRegexRules('She walks in.\n露娜："你好。"\nShe sits down.', [dialogueRule])
    expect(result.displayBlocks).toHaveLength(3)
    expect(result.displayBlocks[0]).toMatchObject({ type: 'narration' })
    expect(result.displayBlocks[0].content).toContain('She walks in.')
    expect(result.displayBlocks[1]).toMatchObject({ type: 'dialogue', speaker: '露娜', content: '你好。' })
    expect(result.displayBlocks[2]).toMatchObject({ type: 'narration' })
    expect(result.displayBlocks[2].content).toContain('She sits down.')
  })

  it('strips image tags from promptContent', () => {
    const result = applyRegexRules(
      'Start.\n[image]a beautiful sunset[/image]\nEnd.',
      []
    )
    expect(result.promptContent).toBe('Start.\n\nEnd.')
  })

  it('keeps mainContent unchanged', () => {
    const original = 'original content here'
    const result = applyRegexRules(original, [])
    expect(result.mainContent).toBe(original)
  })

  it('handles side template rules by removing from display and adding to sideBlocks', () => {
    const sideRule: RegexRule = {
      ...baseRule,
      id: 'side',
      name: '📋 Side Block',
      pattern: '\\[side\\]([\\s\\S]*?)\\[\\/side\\]',
      displayTemplate: '<side>$1</side>',
    }
    const result = applyRegexRules('Main text [side]hidden note[/side] more text', [sideRule])
    expect(result.displayContent).not.toContain('[side]')
    expect(result.displayContent).toContain('Main text')
    expect(result.displayContent).toContain('more text')
    expect(result.sideBlocks).toHaveLength(1)
    expect(result.sideBlocks[0].content).toContain('<side>')
  })

  it('handles action rules with $actions template', () => {
    const actionRule: RegexRule = {
      ...baseRule,
      id: 'act',
      name: '🎬 Actions',
      pattern: '<actions>([\\s\\S]*?)<\\/actions>',
      displayTemplate: '$actions',
    }
    const result = applyRegexRules(
      'Scene setup.\n<actions>\n1. Open door\n2. Light candle\n</actions>\nStory continues.',
      [actionRule]
    )
    expect(result.sideBlocks).toHaveLength(1)
    expect(result.sideBlocks[0].name).toBe('🎬 Actions')
    expect(result.sideBlocks[0].actions).toEqual(['Open door', 'Light candle'])
    expect(result.displayContent).not.toContain('<actions>')
  })
})
