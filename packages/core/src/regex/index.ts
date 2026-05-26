import type { RegexRule } from '@neo-tavern/shared'

export interface SideBlock {
  name: string
  content: string
  actions?: string[]
}

export interface DisplayBlock {
  type: 'narration' | 'dialogue'
  content: string
  speaker?: string
}

export interface SplitResult {
  mainContent: string
  promptContent: string
  displayContent: string
  displayBlocks: DisplayBlock[]
  sideBlocks: SideBlock[]
}

function buildDisplayBlocks(content: string, regex: RegExp): DisplayBlock[] {
  const blocks: DisplayBlock[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  const r = new RegExp(regex.source, regex.flags)
  while ((match = r.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const narration = content.slice(lastIndex, match.index).trim()
      if (narration) blocks.push({ type: 'narration', content: narration })
    }
    blocks.push({ type: 'dialogue', speaker: match[1], content: match[2] })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < content.length) {
    const narration = content.slice(lastIndex).trim()
    if (narration) blocks.push({ type: 'narration', content: narration })
  }
  return blocks
}

export function applyRegexRules(content: string, rules: RegexRule[]): SplitResult {
  const enabled = rules.filter((r) => r.enabled)
  const sideBlocks: SideBlock[] = []
  let pendingActions: SideBlock | null = null

  const promptStripRules: RegexRule[] = []
  const unwrapRules: RegexRule[] = []
  const actionRules: RegexRule[] = []
  const dialogueRules: RegexRule[] = []
  const templateRules: RegexRule[] = []

  for (const rule of enabled) {
    if (rule.name.startsWith('💬')) {
      dialogueRules.push(rule)
    } else if (rule.stripFromPrompt) {
      promptStripRules.push(rule)
    } else if (rule.displayTemplate === '$1') {
      unwrapRules.push(rule)
    } else if (rule.displayTemplate === '$actions') {
      actionRules.push(rule)
    } else if (!rule.displayTemplate) {
      promptStripRules.push(rule)
    } else {
      templateRules.push(rule)
    }
  }

  let displayContent = content
  for (const rule of promptStripRules) {
    try { displayContent = displayContent.replace(new RegExp(rule.pattern, 'gs'), '') } catch { continue }
  }

  for (const rule of unwrapRules) {
    try { displayContent = displayContent.replace(new RegExp(rule.pattern, 'gs'), '$1') } catch { continue }
  }

  for (const rule of actionRules) {
    try {
      const regex = new RegExp(rule.pattern, 'gs')
      const matches = [...content.matchAll(regex)]
      if (matches.length === 0) continue
      const actions: string[] = []
      for (const match of matches) {
        for (let i = 1; i < match.length; i++) {
          const block = match[i]
          if (!block) continue
          const lines = block.split('\n').filter(Boolean)
          for (const line of lines) {
            const cleaned = line.replace(/^\s*\d+\.\s*/, '').trim()
            if (cleaned) actions.push(cleaned)
          }
        }
      }
      if (actions.length > 0) {
          pendingActions = { name: rule.name, content: '', actions }
        }
      displayContent = displayContent.replace(regex, '')
    } catch { continue }
  }

  const promptContent = displayContent.trim()

  let displayBlocks: DisplayBlock[] = []
  for (const rule of dialogueRules) {
    try {
      const regex = new RegExp(rule.pattern, 'gs')
      displayBlocks = buildDisplayBlocks(displayContent, regex)
      if (rule.stripFromPrompt) {
        displayContent = displayContent.replace(regex, '')
      }
    } catch { continue }
  }

  displayContent = displayContent.trim()

  let finalDisplayContent = displayBlocks.length > 0
    ? displayBlocks.map((b) => b.type === 'dialogue' ? `**${b.speaker}：**${b.content}` : b.content).join('\n\n')
    : displayContent

  for (const rule of templateRules) {
    try {
      const regex = new RegExp(rule.pattern, 'gs')
      const matches = [...content.matchAll(regex)]
      if (matches.length === 0) continue

      for (const match of matches) {
        let display = rule.displayTemplate
        for (let i = 1; i < match.length; i++) {
          display = display.replace(`$${i}`, match[i] || '')
        }
        sideBlocks.push({ name: rule.name, content: display })
      }

      finalDisplayContent = finalDisplayContent.replace(regex, '')
      for (const block of displayBlocks) {
        block.content = block.content.replace(regex, '')
      }
    } catch { continue }
  }

  if (pendingActions) {
    sideBlocks.push(pendingActions)
  }

  return {
    mainContent: content,
    promptContent,
    displayContent: finalDisplayContent,
    displayBlocks,
    sideBlocks,
  }
}

export function stripPromptContent(content: string, rules: RegexRule[]): string {
  let result = content
  for (const rule of rules) {
    if (!rule.enabled || !rule.stripFromPrompt) continue
    try { result = result.replace(new RegExp(rule.pattern, 'gs'), '') } catch { continue }
  }
  return result.trim()
}
