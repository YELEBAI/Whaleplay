import type { BuildPromptInput, BuiltPrompt, GenerateMessage, ContextBlock } from '@neo-tavern/shared'

const DEFAULT_SYSTEM_RULES = [
  '你正在扮演所选角色。',
  '始终与角色设定和场景保持一致。',
  '除非用户明确要求，否则不要替用户说话或行动。',
  '保持与最近的对话消息一致。',
  '遵守适用的安全规则，避免不当内容。',
].join('\n')

const DIALOGUE_FORMAT_RULES = [
  '',
  '对话格式要求：',
  '当角色说话时，在每句对话前加上角色名和冒号，格式如：角色名："对话内容"',
  '每句对话独占一行，与叙述文字分开。',
  '此格式仅用于实际说出声的对话。叙述和内心活动保持普通文本格式。',
].join('\n')

function estTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export function trimMessagesByTokens(messages: { role: string; content: string }[], maxTokens: number): { role: string; content: string }[] {
  if (messages.length === 0) return []
  if (maxTokens <= 0) return [...messages]
  let total = 0
  const kept: (typeof messages) = []
  for (let i = messages.length - 1; i >= 0; i--) {
    const tokens = Math.ceil(messages[i].content.length / 4)
    if (total + tokens > maxTokens && kept.length > 0) break
    kept.unshift(messages[i])
    total += tokens
  }
  return kept
}

export function buildChatPrompt(input: BuildPromptInput): BuiltPrompt {
  const messages: GenerateMessage[] = []
  const uname = input.userName || 'User'

  const safeReplace = (s: string) => s.replace(/\{\{user\}\}/gi, uname).replace(/<user>/gi, uname)

  const systemRules = input.systemRules ?? DEFAULT_SYSTEM_RULES
  const characterBlock = safeReplace([
    `Character Name: ${input.character.name}`,
    `Description: ${input.character.description}`,
    `Personality: ${input.character.personality}`,
    `Scenario: ${input.character.scenario}`,
    input.character.exampleDialogues
      ? `Example Dialogues:\n${input.character.exampleDialogues}`
      : '',
  ].filter(Boolean).join('\n\n'))

  const sortedPresetItems = (input.presetItems ?? [])
    .slice()
    .sort((a, b) => a.injectionOrder - b.injectionOrder)

  const hasSystemPreset = sortedPresetItems.some(p => p.role === 'system')

  const sortedContextBlocks = [...(input.contextBlocks ?? [])].sort(
    (a, b) => b.priority - a.priority
  )

  if (!hasSystemPreset) {
    messages.push({
      role: 'system',
      content: safeReplace(systemRules + DIALOGUE_FORMAT_RULES),
    })
  }

  for (const item of sortedPresetItems) {
    messages.push({ role: item.role, content: safeReplace(item.content) })
  }

  messages.push({ role: 'system', content: characterBlock })

  if (input.userPersona) {
    messages.push({ role: 'system', content: safeReplace(`User Persona:\n${input.userPersona}`) })
  }

  const userInputMsg: GenerateMessage = { role: 'user', content: input.userInput }

  const maxTokens = input.maxTotalTokens && input.maxTotalTokens > 0 ? input.maxTotalTokens : 0
  if (maxTokens > 0) {
    let overhead = estTokens(DIALOGUE_FORMAT_RULES)
    if (!hasSystemPreset) overhead += estTokens(safeReplace(systemRules))
    for (const item of sortedPresetItems) overhead += estTokens(safeReplace(item.content))
    overhead += estTokens(characterBlock)
    if (input.userPersona) overhead += estTokens(safeReplace(`User Persona:\n${input.userPersona}`))
    overhead += estTokens(input.userInput)

    const historyBudget = maxTokens - overhead - 100
    const trimmed = historyBudget > 0
      ? trimMessagesByTokens(input.recentMessages, historyBudget)
      : input.recentMessages.slice(-2)

    for (const message of trimmed) {
      messages.push({ role: message.role as 'user' | 'assistant' | 'system', content: message.content })
    }
  } else {
    for (const message of input.recentMessages) {
      messages.push({ role: message.role as 'user' | 'assistant' | 'system', content: message.content })
    }
  }

  if (input.character.firstMessage && input.recentMessages.length === 0) {
    messages.push({ role: 'assistant', content: safeReplace(input.character.firstMessage) })
  }

  for (const block of sortedContextBlocks) {
    messages.push({ role: 'system', content: safeReplace(`[${block.source}] ${block.title}\n${block.content}`) })
  }

  messages.push({
    role: 'system',
    content: [
      '【关键格式规则 — 必须遵守】',
      '1. 角色说话时必须使用：角色名："对话内容"',
      '2. 叙述与描述保持普通文本，只有对话内容放在双引号里跟在角色名后',
      '3. 每句对话独占一行',
      '4. 内心活动与叙述描述绝对不要加角色名前缀',
    ].join('\n'),
  })

  messages.push({
    role: 'system',
    content: [
      '在撰写回复之前，请重新回顾上述所有系统指令。',
      '重点检查：角色设定、写作规则、禁用词汇、输出格式要求。',
      '如果任何系统规则与你将要写的内容冲突，以系统规则为准。',
      '',
      '[推理强度：绝对最大化，不允许任何走捷径。',
      '你必须极其彻底地思考，全面拆解问题以解决根源，严格对照所有可能的路径、边缘情况和对抗性场景来检验你的逻辑。',
      '完整写出你的整套思考过程，记录每一个中间步骤、考虑过的替代方案和被否决的假设，确保绝对没有任何假设未经审查。]',
    ].join('\n'),
  })

  messages.push(userInputMsg)

  const previewText = messages
    .map((message) => `## ${message.role}\n${message.content}`)
    .join('\n\n---\n\n')

  const tokenEstimate = estimateTokens(messages)

  return {
    messages,
    previewText,
    tokenEstimate,
    includedContextBlocks: sortedContextBlocks,
  }
}

export function estimateTokens(messages: GenerateMessage[]): number {
  const text = messages.map((m) => m.content).join('\n')
  return Math.ceil(text.length / 4)
}

export { DEFAULT_SYSTEM_RULES, DIALOGUE_FORMAT_RULES }
