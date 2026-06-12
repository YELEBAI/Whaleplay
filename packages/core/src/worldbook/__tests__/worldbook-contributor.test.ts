import { describe, expect, it } from 'vitest'
import { WorldbookContributor, getWorldbookEntryInsertPosition, resolveWorldbookEntries } from '../worldbook-contributor'
import type { Character, Message, WorldbookEntry } from '@neo-tavern/shared'

const character: Character = {
  id: 'char-1',
  name: 'Alice',
  description: 'A test character',
  personality: 'Curious',
  scenario: 'Testing world books',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
}

const recentMessages: Message[] = [
  {
    id: 'msg-1',
    chatId: 'chat-1',
    role: 'assistant',
    content: 'The silver key is on the desk.',
    createdAt: '2024-01-01T00:01:00Z',
  },
]

function makeEntry(patch: Partial<WorldbookEntry>): WorldbookEntry {
  return {
    id: patch.id ?? 'entry-1',
    worldbookId: 'worldbook-1',
    title: patch.title ?? 'Entry',
    keys: patch.keys ?? '',
    secondaryKeys: patch.secondaryKeys,
    content: patch.content ?? 'Lore content',
    priority: patch.priority ?? 10,
    type: patch.type ?? 'trigger',
    triggerMode: patch.triggerMode ?? 'or',
    selectiveLogic: patch.selectiveLogic,
    scanDepth: patch.scanDepth,
    caseSensitive: patch.caseSensitive,
    matchWholeWords: patch.matchWholeWords,
    useProbability: patch.useProbability,
    probability: patch.probability,
    position: patch.position,
    depth: patch.depth,
    role: patch.role,
    enabled: patch.enabled ?? true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  }
}

describe('WorldbookContributor', () => {
  it('keeps always entries at their configured position', async () => {
    const entry = makeEntry({
      id: 'always-1',
      title: 'Always lore',
      type: 'always',
      position: 'beforeHistory',
    })
    const contributor = new WorldbookContributor()
    contributor.setEntries([entry])

    const blocks = await contributor.contribute({
      character,
      recentMessages,
      userInput: 'Hello',
    })

    expect(blocks).toHaveLength(1)
    expect(blocks[0].position).toBe('beforeHistory')
    expect(getWorldbookEntryInsertPosition({ ...entry, position: 'atDepth' })).toBe('atDepth')
  })

  it('places triggered keyword entries after history regardless of configured position', async () => {
    const entry = makeEntry({
      id: 'trigger-1',
      title: 'Key lore',
      type: 'trigger',
      keys: 'silver key',
      position: 'beforeHistory',
    })
    const contributor = new WorldbookContributor()
    contributor.setEntries([entry])

    const blocks = await contributor.contribute({
      character,
      recentMessages,
      userInput: 'I pick up the silver key.',
    })

    expect(blocks).toHaveLength(1)
    expect(blocks[0].position).toBe('afterHistory')
    expect(getWorldbookEntryInsertPosition({ ...entry, position: 'atDepth' })).toBe('afterHistory')
  })
})

describe('resolveWorldbookEntries', () => {
  const emptyRecent = ''

  it('filters out disabled entries', () => {
    const entries = [
      makeEntry({ id: 'always-on', type: 'always', enabled: false }),
    ]
    const result = resolveWorldbookEntries(entries, 'test', emptyRecent)
    expect(result.matched).toHaveLength(0)
  })

  it('returns always entries even without keyword match', () => {
    const entries = [
      makeEntry({ id: 'always-1', title: 'Always lore', type: 'always', content: 'Always present' }),
    ]
    const result = resolveWorldbookEntries(entries, 'any text', emptyRecent)
    expect(result.matched).toHaveLength(1)
    expect(result.matched[0].title).toBe('Always lore')
  })

  it('matches trigger entries by keyword (OR mode)', () => {
    const entries = [
      makeEntry({ id: 'trigger-1', title: 'Sword', type: 'trigger', keys: 'sword, blade', triggerMode: 'or' }),
    ]
    const result = resolveWorldbookEntries(entries, 'I draw my blade.', emptyRecent)
    expect(result.matched).toHaveLength(1)
    expect(result.matched[0].title).toBe('Sword')
  })

  it('does not match trigger entries when no keyword is found', () => {
    const entries = [
      makeEntry({ id: 'trigger-1', title: 'Sword', type: 'trigger', keys: 'sword, blade', triggerMode: 'or' }),
    ]
    const result = resolveWorldbookEntries(entries, 'I sit on the chair.', emptyRecent)
    expect(result.matched).toHaveLength(0)
  })

  it('matches trigger entries in AND mode only when all keywords present', () => {
    const entries = [
      makeEntry({ id: 'trigger-and', title: 'Elven Sword', type: 'trigger', keys: 'elf, sword', triggerMode: 'and' }),
    ]
    const partial = resolveWorldbookEntries(entries, 'An elf walks in.', emptyRecent)
    expect(partial.matched).toHaveLength(0)

    const full = resolveWorldbookEntries(entries, 'An elf carries a sword.', emptyRecent)
    expect(full.matched).toHaveLength(1)
    expect(full.matched[0].title).toBe('Elven Sword')
  })

  it('respects case sensitive matching', () => {
    const entries = [
      makeEntry({ id: 'cs-1', title: 'CaseSensitive', type: 'trigger', keys: 'Dragon', triggerMode: 'or', caseSensitive: true }),
    ]
    const match = resolveWorldbookEntries(entries, 'A Dragon appears.', emptyRecent)
    expect(match.matched).toHaveLength(1)

    const noMatch = resolveWorldbookEntries(entries, 'A dragon appears.', emptyRecent)
    expect(noMatch.matched).toHaveLength(0)
  })

  it('matches whole words when enabled for ASCII keywords', () => {
    const entries = [
      makeEntry({ id: 'ww-1', title: 'Cat', type: 'trigger', keys: 'cat', triggerMode: 'or', matchWholeWords: true }),
    ]
    const match = resolveWorldbookEntries(entries, 'A cat sat on the mat.', emptyRecent)
    expect(match.matched).toHaveLength(1)

    const noMatch = resolveWorldbookEntries(entries, 'A category is defined.', emptyRecent)
    expect(noMatch.matched).toHaveLength(0)
  })

  it('filters by secondary keys when provided', () => {
    const entries = [
      makeEntry({
        id: 'sec-1',
        title: 'Elven Forest',
        type: 'trigger',
        keys: 'forest',
        triggerMode: 'or',
        secondaryKeys: 'elf, magic',
        selectiveLogic: 'or',
      }),
    ]
    const match = resolveWorldbookEntries(entries, 'I enter the forest. There is magic here.', emptyRecent)
    expect(match.matched).toHaveLength(1)

    const noMatch = resolveWorldbookEntries(entries, 'I enter the forest.', emptyRecent)
    expect(noMatch.matched).toHaveLength(0)
  })

  it('sorts results by priority descending, then title, then id', () => {
    const entries = [
      makeEntry({ id: 'a', title: 'Beta', type: 'always', priority: 5 }),
      makeEntry({ id: 'b', title: 'Alpha', type: 'always', priority: 10 }),
      makeEntry({ id: 'c', title: 'Alpha', type: 'always', priority: 10 }),
    ]
    const result = resolveWorldbookEntries(entries, 'text', emptyRecent)
    expect(result.matched).toHaveLength(3)
    expect(result.matched[0].priority).toBe(10)
    expect(result.matched[0].id).toBe('b')
    expect(result.matched[1].priority).toBe(10)
    expect(result.matched[1].id).toBe('c')
    expect(result.matched[2].priority).toBe(5)
  })

  it('scans recent messages for keywords', () => {
    const entries = [
      makeEntry({ id: 'rec-1', title: 'Recall', type: 'trigger', keys: 'artifact', triggerMode: 'or' }),
    ]
    const recentMessages: Message[] = [
      { id: 'm1', chatId: 'c1', parentId: null, role: 'assistant', content: 'The artifact glows.', createdAt: '2024-01-01T00:00:00Z' },
    ]
    const result = resolveWorldbookEntries(entries, 'Hello', recentMessages)
    expect(result.matched).toHaveLength(1)
  })

  it('respects scanDepth to limit how many recent messages to scan', () => {
    const entries = [
      makeEntry({ id: 'sd-1', title: 'Shallow', type: 'trigger', keys: 'clue', triggerMode: 'or', scanDepth: 1 }),
    ]
    const recentMessages: Message[] = [
      { id: 'm1', chatId: 'c1', parentId: null, role: 'assistant', content: 'A clue is here.', createdAt: '2024-01-01T00:00:00Z' },
      { id: 'm2', chatId: 'c1', parentId: null, role: 'user', content: 'Nothing relevant.', createdAt: '2024-01-01T00:01:00Z' },
    ]
    // scanDepth 1 means only most recent message (m2) is scanned; 'clue' is only in m1
    const result = resolveWorldbookEntries(entries, 'Proceed', recentMessages)
    expect(result.matched).toHaveLength(0)
  })

  it('handles entry with zero probability as never matching', () => {
    const entries = [
      makeEntry({ id: 'prob-0', title: 'Unlikely', type: 'always', useProbability: true, probability: 0 }),
    ]
    const result = resolveWorldbookEntries(entries, 'test', emptyRecent)
    expect(result.matched).toHaveLength(0)
  })

  it('handles entry with 100 probability as always matching', () => {
    const entries = [
      makeEntry({ id: 'prob-100', title: 'Certain', type: 'always', useProbability: true, probability: 100 }),
    ]
    const result = resolveWorldbookEntries(entries, 'test', emptyRecent)
    expect(result.matched).toHaveLength(1)
  })

  it('handles empty entries array', () => {
    const result = resolveWorldbookEntries([], 'test', emptyRecent)
    expect(result.matched).toHaveLength(0)
  })

  it('uses semicolons as keyword separators', () => {
    const entries = [
      makeEntry({ id: 'semi-1', title: 'Semicolon Test', type: 'trigger', keys: 'apple; banana; cherry', triggerMode: 'or' }),
    ]
    const result = resolveWorldbookEntries(entries, 'I eat a cherry.', emptyRecent)
    expect(result.matched).toHaveLength(1)
  })

  it('uses Chinese commas/semicolons as keyword separators', () => {
    const entries = [
      makeEntry({ id: 'cn-1', title: 'CN Test', type: 'trigger', keys: '剑，盾牌；匕首', triggerMode: 'or' }),
    ]
    const result = resolveWorldbookEntries(entries, '他拔出匕首。', emptyRecent)
    expect(result.matched).toHaveLength(1)
  })

  it('does not match empty keys on trigger entries', () => {
    const entries = [
      makeEntry({ id: 'empty-keys', title: 'Empty Keys', type: 'trigger', keys: '', triggerMode: 'or' }),
    ]
    const result = resolveWorldbookEntries(entries, 'any text', emptyRecent)
    expect(result.matched).toHaveLength(0)
  })

  it('combines always and matched trigger entries sorted by priority', () => {
    const entries = [
      makeEntry({ id: 'always-1', title: 'Always Low', type: 'always', priority: 1 }),
      makeEntry({ id: 'trigger-1', title: 'Trigger High', type: 'trigger', keys: 'dragon', triggerMode: 'or', priority: 10 }),
    ]
    const result = resolveWorldbookEntries(entries, 'A dragon appears.', emptyRecent)
    expect(result.matched).toHaveLength(2)
    expect(result.matched[0].title).toBe('Trigger High')
    expect(result.matched[1].title).toBe('Always Low')
  })
})
