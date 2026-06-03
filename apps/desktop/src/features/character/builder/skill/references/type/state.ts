export type NeoBuilderState = {
  builderSessionId: string
  status: 'ideating' | 'draft_ready' | 'saved'
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  creationPlan: NeoCreationPlan | null
  personalityPalette: NeoPersonalityPalette | null
  evaluationReport: NeoBuilderEvaluationReport | null
  draft: null | {
    character: NeoCharacterDraft
    worldbookName?: string
    worldbookDescription?: string
    worldbookEntries: NeoWorldbookEntryDraft[]
    notes?: string
  }
  savedCharacterId: string | null
}

export type NeoCreationPlan = {
  project: { name: string; worldbookName?: string; form: 'charactercard' | 'worldbook' }
  entries: Array<{ id: string; name: string; type: string; status: 'planned' | 'in_progress' | 'done' | 'skipped' }>
  yaml: string
  updatedAt: string
}

export type NeoPersonalityPalette = {
  base: string
  main: string[]
  accents: string[]
  derivatives: Array<{ color: string; items: string[] }>
  futureDerivatives?: string[]
  compiledText?: string
}

export type NeoBuilderEvaluationReport = {
  summary: string
  issues: Array<{ severity: 'high' | 'medium' | 'low'; target: string; message: string }>
  suggestions: string[]
  score?: number
}

export type NeoCharacterDraft = {
  name: string
  description: string
  personality: string
  scenario: string
  firstMessage: string
  exampleDialogues?: string
  tags?: string[]
}

export type NeoWorldbookEntryDraft = {
  title: string
  keys: string
  content: string
  priority: number
  type: 'always' | 'trigger'
  position: 'beforeHistory' | 'afterHistory' | 'atDepth'
  triggerMode: 'and' | 'or'
  role: 'system' | 'user' | 'assistant'
  enabled: boolean
}
