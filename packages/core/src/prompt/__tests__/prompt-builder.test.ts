import { describe, it, expect } from 'vitest'
import { buildChatPrompt, estimateTokens } from '../prompt-builder'
import type { Character, Message } from '@neo-tavern/shared'

const mockCharacter: Character = {
  id: 'char-1',
  name: 'Alice',
  description: 'A friendly AI assistant',
  personality: 'Helpful and cheerful',
  scenario: 'Chatting with a user',
  firstMessage: 'Hello! How can I help you today?',
  exampleDialogues: 'User: Hi\nAlice: Hello there!',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
}

const mockMessages: Message[] = [
  {
    id: 'msg-1',
    chatId: 'chat-1',
    role: 'user',
    content: 'Hi there',
    createdAt: '2024-01-01T00:01:00Z',
  },
  {
    id: 'msg-2',
    chatId: 'chat-1',
    role: 'assistant',
    content: 'Hello! Nice to meet you.',
    createdAt: '2024-01-01T00:01:30Z',
  },
]

describe('buildChatPrompt', () => {
  it('should return a BuiltPrompt with messages array', () => {
    const result = buildChatPrompt({
      character: mockCharacter,
      recentMessages: mockMessages,
      userInput: 'How are you?',
    })

    expect(result).toBeDefined()
    expect(result.messages).toBeInstanceOf(Array)
    expect(result.messages.length).toBeGreaterThan(0)
  })

  it('should include system rules as first message', () => {
    const result = buildChatPrompt({
      character: mockCharacter,
      recentMessages: [],
      userInput: 'Hello',
    })

    expect(result.messages[0].role).toBe('system')
    expect(result.messages[0].content).toContain('扮演')
  })

  it('should include character information in system messages', () => {
    const result = buildChatPrompt({
      character: mockCharacter,
      recentMessages: [],
      userInput: 'Test',
    })

    const systemMessages = result.messages.filter((m) => m.role === 'system')
    const systemContent = systemMessages.map((m) => m.content).join(' ')

    expect(systemContent).toContain('Alice')
    expect(systemContent).toContain('A friendly AI assistant')
    expect(systemContent).toContain('Helpful and cheerful')
    expect(systemContent).toContain('Chatting with a user')
  })

  it('should include example dialogues when provided', () => {
    const result = buildChatPrompt({
      character: mockCharacter,
      recentMessages: [],
      userInput: 'Test',
    })

    const systemContent = result.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join(' ')

    expect(systemContent).toContain('Example Dialogues')
  })

  it('should not include example dialogues section when empty', () => {
    const charWithoutExamples: Character = {
      ...mockCharacter,
      exampleDialogues: undefined,
    }

    const result = buildChatPrompt({
      character: charWithoutExamples,
      recentMessages: [],
      userInput: 'Test',
    })

    const systemContent = result.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join(' ')

    expect(systemContent).not.toContain('Example Dialogues')
  })

  it('should include recent messages', () => {
    const result = buildChatPrompt({
      character: mockCharacter,
      recentMessages: mockMessages,
      userInput: 'How are you?',
    })

    const userMessage = result.messages.find(
      (m) => m.role === 'user' && m.content === 'Hi there'
    )
    const assistantMessage = result.messages.find(
      (m) => m.role === 'assistant' && m.content === 'Hello! Nice to meet you.'
    )

    expect(userMessage).toBeDefined()
    expect(assistantMessage).toBeDefined()
  })

  it('should include user input as last message', () => {
    const result = buildChatPrompt({
      character: mockCharacter,
      recentMessages: [],
      userInput: 'My test message',
    })

    const lastMessage = result.messages[result.messages.length - 1]
    expect(lastMessage.role).toBe('user')
    expect(lastMessage.content).toContain('My test message')
  })

  it('should generate preview text', () => {
    const result = buildChatPrompt({
      character: mockCharacter,
      recentMessages: [],
      userInput: 'Test',
    })

    expect(result.previewText).toBeDefined()
    expect(result.previewText.length).toBeGreaterThan(0)
    expect(result.previewText).toContain('## system')
    expect(result.previewText).toContain('## user')
  })

  it('should estimate token count', () => {
    const result = buildChatPrompt({
      character: mockCharacter,
      recentMessages: mockMessages,
      userInput: 'Hello',
    })

    expect(result.tokenEstimate).toBeGreaterThan(0)
    expect(Number.isInteger(result.tokenEstimate)).toBe(true)
  })

  it('should include context blocks sorted by priority', () => {
    const contextBlocks = [
      { id: 'cb-1', source: 'memory' as const, title: 'Memory 1', content: 'Low priority', priority: 1 },
      { id: 'cb-2', source: 'worldbook' as const, title: 'Worldbook 1', content: 'High priority', priority: 10 },
    ]

    const result = buildChatPrompt({
      character: mockCharacter,
      recentMessages: [],
      userInput: 'Test',
      contextBlocks,
    })

    const blockMessages = result.messages.filter((m) =>
      m.content.includes('[worldbook]') || m.content.includes('[memory]')
    )

    expect(blockMessages).toHaveLength(2)
    expect(blockMessages[0].content).toContain('High priority')
    expect(blockMessages[1].content).toContain('Low priority')
    expect(result.includedContextBlocks).toEqual([
      { id: 'cb-2', source: 'worldbook', title: 'Worldbook 1', content: 'High priority', priority: 10 },
      { id: 'cb-1', source: 'memory', title: 'Memory 1', content: 'Low priority', priority: 1 },
    ])
  })

  it('should include user persona when provided', () => {
    const result = buildChatPrompt({
      character: mockCharacter,
      recentMessages: [],
      userInput: 'Test',
      userPersona: 'A curious explorer',
    })

    const personaMessage = result.messages.find(
      (m) => m.role === 'system' && m.content.includes('User Persona')
    )
    expect(personaMessage).toBeDefined()
    expect(personaMessage!.content).toContain('A curious explorer')
  })

  it('should use custom system rules when provided', () => {
    const customRules = 'Custom roleplay rules here.'

    const result = buildChatPrompt({
      character: mockCharacter,
      recentMessages: [],
      userInput: 'Test',
      systemRules: customRules,
    })

    expect(result.messages[0].content).toContain(customRules)
  })

  it('should inject preset items by injection order', () => {
    const result = buildChatPrompt({
      character: mockCharacter,
      recentMessages: [],
      userInput: 'Test',
      presetItems: [
        { role: 'system', content: 'Third preset card', injectionOrder: 30 },
        { role: 'user', content: 'Second preset card', injectionOrder: 20 },
        { role: 'system', content: 'First preset card', injectionOrder: 10 },
      ],
    })

    const contents = result.messages.map((m) => m.content)
    const firstIndex = contents.indexOf('First preset card')
    const secondIndex = contents.indexOf('Second preset card')
    const thirdIndex = contents.indexOf('Third preset card')

    expect(firstIndex).toBeGreaterThanOrEqual(0)
    expect(firstIndex).toBeLessThan(secondIndex)
    expect(secondIndex).toBeLessThan(thirdIndex)
  })
})

describe('estimateTokens', () => {
  it('should return 0 for empty messages', () => {
    const result = estimateTokens([])
    expect(result).toBe(0)
  })

  it('should estimate approximately 1 token per 4 characters', () => {
    const messages = [
      { role: 'user' as const, content: '12345678' },
    ]
    expect(estimateTokens(messages)).toBe(2)
  })

  it('should round up', () => {
    const messages = [
      { role: 'user' as const, content: '123456789' },
    ]
    expect(estimateTokens(messages)).toBe(3)
  })
})
