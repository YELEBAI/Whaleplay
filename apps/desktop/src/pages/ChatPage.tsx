import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { Send, ChevronDown, ChevronUp, ArrowLeft, Copy, Pencil, Check, X, ScrollText, RotateCcw, CheckCheck, StopCircle, BarChart3, Trash2, Brain } from 'lucide-react'
import { Button, Input, Card, CardContent, Textarea, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@neo-tavern/ui'
import { useCharacterStore } from '@/features/character/character.store'
import { useChatStore } from '@/features/chat/chat.store'
import { useSendMessage } from '@/features/chat/hooks/useSendMessage'
import { presetRepository } from '@/db/repositories'
import { buildChatPrompt, formatPreview, applyRegexRules, resolveWorldbookEntries } from '@neo-tavern/core'
import type { DisplayBlock, SideBlock } from '@neo-tavern/core'
import { useSettingsStore } from '@/features/settings/settings.store'
import { useWorldbookStore } from '@/features/settings/worldbook.store'
import type { BuiltPrompt, Message } from '@neo-tavern/shared'

function Avatar({ name, src, isUser }: { name: string; src?: string; isUser?: boolean }) {
  const initial = name.charAt(0).toUpperCase()
  const bg = isUser ? 'bg-blue-500' : 'bg-emerald-500'
  if (src) {
    return (
      <img src={src} alt={name} className="w-8 h-8 rounded-full object-cover border border-border/30 shrink-0" />
    )
  }
  return (
    <div className={`w-8 h-8 rounded-full ${bg} flex items-center justify-center shrink-0`}>
      <span className="text-white text-xs font-bold">{initial}</span>
    </div>
  )
}

function toast(type: 'success' | 'error' | 'info', message: string) {
  const fn = (window as any).__toast
  if (fn) fn(type, message)
}

const DEEPSEEK_CONTEXT_LIMIT = 1_000_000

const compactTokenFormatter = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

function formatCompactToken(value: number) {
  return compactTokenFormatter.format(value)
}

function parseSafeDetails(content: string): { className: 'neo-summary' | 'neo-thoughts'; open: boolean; summary: string; body: string } | null {
  const trimmed = content.trim()
  const match = trimmed.match(/^<details([^>]*)><summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>$/)
  if (!match) return null

  const attrs = match[1]
  const className = attrs.match(/\bclass="([^"]*)"/)?.[1]
  const unsupportedAttrs = attrs
    .replace(/\bopen\b/g, '')
    .replace(/\bclass="(?:neo-summary|neo-thoughts)"/g, '')
    .trim()
  if ((className && className !== 'neo-summary' && className !== 'neo-thoughts') || unsupportedAttrs) return null

  return {
    className: className === 'neo-thoughts' ? 'neo-thoughts' : 'neo-summary',
    open: /\bopen\b/.test(attrs),
    summary: match[2],
    body: match[3].trim(),
  }
}

function SideBlockView({ side, fontSize, onAction }: { side: SideBlock; fontSize: number; onAction: (action: string) => void }) {
  if (side.actions) {
    return (
      <div className="flex flex-wrap gap-2 mt-1">
        {side.actions.map((action, ai) => (
          <button
            key={ai}
            onClick={() => onAction(action)}
            className="px-3 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-sm hover:bg-primary/10 hover:border-primary/50 transition-colors cursor-pointer"
            style={{ fontSize: `${fontSize}px` }}
          >
            {action}
          </button>
        ))}
      </div>
    )
  }

  const details = parseSafeDetails(side.content)
  if (details) {
    return (
      <details className={details.className} open={details.open || undefined}>
        <summary>{details.summary}</summary>
        <p className="whitespace-pre-wrap">{details.body}</p>
      </details>
    )
  }

  return (
    <p className="whitespace-pre-wrap text-muted-foreground mt-1">
      {side.content}
    </p>
  )
}

export function ChatPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const lastAiMsgRef = useRef<HTMLDivElement>(null)
  const initRef = useRef<string | null>(null)
  const presetItemsRef = useRef<{ role: 'system' | 'user'; content: string; injectionOrder: number }[]>([])

  const { characters, loadCharacters } = useCharacterStore()
  const { currentChat, messages, loading, error: chatError, loadChat, createOrGetChat, clearError, updateMessage, deleteMessages } = useChatStore()
  const regexPresets = useSettingsStore((s) => s.regexPresets)
  const activeRegexPresetId = useSettingsStore((s) => s.activeRegexPresetId)
  const activeRegexRules = (() => {
    const rules: typeof regexPresets[0]['rules'] = []
    for (const p of regexPresets) {
      if (p.isGlobal) rules.push(...p.rules.filter((r) => r.enabled))
    }
    if (activeRegexPresetId) {
      const preset = regexPresets.find((p) => p.id === activeRegexPresetId)
      if (preset) rules.push(...preset.rules.filter((r) => r.enabled))
    }
    const seen = new Set<string>()
    return rules.filter((r) => { if (seen.has(r.pattern)) return false; seen.add(r.pattern); return true })
  })()

  const [input, setInput] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewText, setPreviewText] = useState('')
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [promptDialogOpen, setPromptDialogOpen] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const personaName = useSettingsStore((s) => s.personaName)
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false)
  const [deleteMsgTarget, setDeleteMsgTarget] = useState<Message | null>(null)
  const [fontSize, setFontSize] = useState(15)
  const [thinkingMsg, setThinkingMsg] = useState<Message | null>(null)

  const characterId = searchParams.get('characterId')
  const character = characters.find((c) => c.id === (currentChat?.characterId ?? characterId))

  const { sendMessage, regenerate, abort, sending, error: sendError, clearError: clearSendError } = useSendMessage({
    character,
    chatId: currentChat?.id,
    onPromptBuilt: (built: BuiltPrompt) => {
      setPreviewText(formatPreview(built))
    },
  })

  useEffect(() => {
    loadCharacters()
  }, [loadCharacters])

  useEffect(() => {
    presetRepository.getActivePresetId().then(async (activeId) => {
      if (activeId) {
        const preset = await presetRepository.getById(activeId)
        if (preset) {
          presetItemsRef.current = preset.items
            .filter((i) => i.enabled)
            .map((i) => ({ role: i.role, content: i.content, injectionOrder: i.injectionOrder }))
        }
      } else {
        presetItemsRef.current = []
      }
    })
  }, [])

  useEffect(() => {
    if (id && id !== 'new') {
      loadChat(id)
      return
    }
    if (!characterId || id !== 'new') return
    if (characters.length === 0) return
    if (initRef.current === characterId) return
    initRef.current = characterId

    const charName = characters.find((c) => c.id === characterId)?.name ?? 'Chat'
    createOrGetChat({ characterId, title: charName }).catch(() => {})
  }, [id, characterId, characters.length])

  useEffect(() => {
    const lastMsg = messages[messages.length - 1]
    if (!lastMsg) return
    if (lastMsg.role === 'assistant' && !sending && lastAiMsgRef.current) {
      const container = messagesContainerRef.current
      if (container) {
        const top = lastAiMsgRef.current.offsetTop - container.offsetTop - 16
        container.scrollTo({ top, behavior: 'smooth' })
      }
    } else if (lastMsg.role === 'user') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' })
    }
  }, [messages.length, sending])

  useEffect(() => {
    if (!character) return
    const settingsState = useSettingsStore.getState()
    const wbState = useWorldbookStore.getState()
    if (character.regexPresetId && character.regexPresetId !== settingsState.activeRegexPresetId) {
      settingsState.setActiveRegexPreset(character.regexPresetId)
    }
    if (character.worldbookId && character.worldbookId !== wbState.activeWorldbookId) {
      wbState.setActiveWorldbook(character.worldbookId)
    }
  }, [character?.id])

  const updatePreview = (userInput: string) => {
    if (!character) return
    const cs = useSettingsStore.getState().contextTokens || 64000
    const wbState = useWorldbookStore.getState()
    let contextBlocks: any[] | undefined
    if (wbState.activeWorldbookId) {
      const wb = wbState.worldbooks.find((w) => w.id === wbState.activeWorldbookId)
      if (wb && wb.entries.length > 0) {
        const recentText = messages.map((m) => m.content).join('\n')
        const { matched } = resolveWorldbookEntries(wb.entries, userInput || '', recentText)
        contextBlocks = matched.map((e) => ({
          id: e.id,
          source: 'worldbook' as const,
          title: e.title,
          content: e.content,
          priority: e.priority,
        }))
      }
    }
    const built = buildChatPrompt({
      character,
      recentMessages: messages,
      userInput: userInput || '(your message)',
      maxTotalTokens: cs,
      presetItems: presetItemsRef.current,
      contextBlocks,
      userName: useSettingsStore.getState().personaName,
    })
    setPreviewText(formatPreview(built))
  }

  const handleSend = async () => {
    if (!input.trim() || sending) return
    const content = input.trim()
    setInput('')
    await sendMessage(content)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value)
    updatePreview(e.target.value)
  }

  const handleCopy = async (content: string, msgId: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedId(msgId)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      toast('error', 'Failed to copy')
    }
  }

  const startEdit = (msg: Message) => {
    setEditingMsgId(msg.id)
    setEditContent(msg.content)
  }

  const cancelEdit = () => {
    setEditingMsgId(null)
    setEditContent('')
  }

  const saveEdit = async () => {
    if (!editingMsgId || !editContent.trim()) return
    try {
      await updateMessage(editingMsgId, editContent.trim())
      setEditingMsgId(null)
      setEditContent('')
      toast('success', 'Message updated')
    } catch {
      toast('error', 'Failed to update')
    }
  }

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault()
      saveEdit()
    }
    if (e.key === 'Escape') {
      cancelEdit()
    }
  }

  const showPromptDialog = () => {
    if (previewText) {
      setPromptDialogOpen(true)
    } else {
      updatePreview(input)
      setPromptDialogOpen(true)
    }
  }

  const displayError = sendError || chatError

  const isLastAi = (msg: Message) => {
    if (msg.role !== 'assistant') return false
    const lastIdx = messages.length - 1
    for (let i = lastIdx; i >= 0; i--) {
      if (messages[i].role === 'assistant') return messages[i].id === msg.id
    }
    return false
  }

  const handleDeleteMessage = async () => {
    if (!deleteMsgTarget) return
    try {
      const ids = [deleteMsgTarget.id]
      if (deleteMsgTarget.role === 'user') {
        const idx = messages.findIndex((m) => m.id === deleteMsgTarget.id)
        const next = idx >= 0 ? messages[idx + 1] : undefined
        if (next?.role === 'assistant') ids.push(next.id)
      }
      await deleteMessages(ids)
      setDeleteMsgTarget(null)
      toast('info', ids.length > 1 ? 'Messages deleted' : 'Message deleted')
    } catch { toast('error', 'Failed to delete') }
  }

  const usageMessages = messages.filter((m) => m.role === 'assistant' && m.usage)
  const totalPrompt = usageMessages.reduce((s, m) => s + (m.usage?.promptTokens || 0), 0)
  const totalCompletion = usageMessages.reduce((s, m) => s + (m.usage?.completionTokens || 0), 0)
  const totalCacheHit = usageMessages.reduce((s, m) => s + (m.usage?.cacheHitTokens || 0), 0)
  const totalCacheMiss = usageMessages.reduce((s, m) => s + (m.usage?.cacheMissTokens || 0), 0)
  const cacheRate = totalPrompt > 0 ? ((totalCacheHit / totalPrompt) * 100).toFixed(1) : '-'
  const latestUsage = usageMessages[usageMessages.length - 1]?.usage
  const currentContextTokens = latestUsage
    ? (latestUsage.totalTokens || ((latestUsage.promptTokens || 0) + (latestUsage.completionTokens || 0)))
    : 0
  const contextUsageRate = currentContextTokens > 0 ? ((currentContextTokens / DEEPSEEK_CONTEXT_LIMIT) * 100).toFixed(1) : '-'
  const contextUsageDisplay = contextUsageRate === '-' ? '-' : `${contextUsageRate}%`
  const contextUsageTone = currentContextTokens >= 900_000
    ? 'text-orange-500'
    : currentContextTokens >= 750_000
      ? 'text-yellow-500'
      : 'text-emerald-500'
  const contextUsageBarTone = currentContextTokens >= 900_000
    ? 'bg-orange-500'
    : currentContextTokens >= 750_000
      ? 'bg-yellow-500'
      : 'bg-emerald-500'
  const contextUsagePercent = currentContextTokens > 0
    ? Math.min((currentContextTokens / DEEPSEEK_CONTEXT_LIMIT) * 100, 100)
    : 0
  const contextUsageTitle = currentContextTokens > 0
    ? `${currentContextTokens.toLocaleString()} / ${DEEPSEEK_CONTEXT_LIMIT.toLocaleString()} current conversation context tokens`
    : 'No context usage data yet'

  return (
    <div className="flex h-full">
      <div className="w-60 border-r p-4 flex flex-col gap-3 overflow-y-auto shrink-0">
        <button onClick={() => navigate('/')} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        {character && (
          <>
            <h2 className="text-lg font-semibold truncate">{character.name}</h2>
            <p className="text-xs text-muted-foreground">{character.description}</p>
            <div className="text-xs text-muted-foreground">
              <p className="font-medium">Personality:</p>
              <p>{character.personality}</p>
            </div>
          </>
        )}
      </div>

      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-end gap-2 px-4 py-2 border-b shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTokenDialogOpen(true)}
            className="text-muted-foreground hover:text-foreground text-xs gap-1"
          >
            <BarChart3 className="h-3.5 w-3.5" />
            {usageMessages.length > 0 ? (
              <span>P:{totalPrompt} C:{totalCompletion} | 🔥 {cacheRate}%</span>
            ) : (
              <span>Token Stats</span>
            )}
          </Button>
          {usageMessages.length > 0 && (
            <button
              type="button"
              onClick={() => setTokenDialogOpen(true)}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              title={contextUsageTitle}
            >
              <span className="text-[10px] font-medium">1M</span>
              <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                <span
                  className={`block h-full rounded-full transition-[width] ${contextUsageBarTone}`}
                  style={{ width: `${contextUsagePercent}%` }}
                />
              </span>
              <span className={`w-10 text-right tabular-nums ${contextUsageTone}`}>{contextUsageDisplay}</span>
            </button>
          )}
        </div>
        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-5 mx-3 my-2 rounded-xl border border-border/40 bg-background/50">
          {loading && <p className="text-sm text-muted-foreground text-center">Loading...</p>}
          {!loading && messages.length === 0 && !sending && (
            <div className="max-w-4xl mx-auto">
              {character ? (
                <div>
                  <div className="flex items-center gap-2 mb-1.5 px-1">
                    <Avatar name={character.name} src={character.avatar} />
                    <span className="text-xs font-medium text-muted-foreground">{character.name}</span>
                  </div>
                  <div className="flex gap-3">
                    <div className="max-w-[75%] min-w-0">
                      <Card>
                        <CardContent className="p-3">
                          <p className="whitespace-pre-wrap" style={{ fontSize: `${fontSize}px` }}>
                            {(character.firstMessage || `Start a conversation with ${character.name}`).replace(/\{\{user\}\}/gi, personaName).replace(/<user>/gi, personaName)}
                          </p>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center mt-8">Select a character to start chatting</p>
              )}
            </div>
          )}
          <div className="max-w-4xl mx-auto space-y-5">
            {messages.map((msg, idx) => {
              const isUser = msg.role === 'user'
              const isFinalAi = !isUser && idx === messages.length - 1
              const aiName = character?.name ?? 'AI'
              const split = !isUser && activeRegexRules.length > 0 ? applyRegexRules(msg.content, activeRegexRules) : null
              const displayContent = split?.displayContent ?? split?.promptContent ?? msg.content

              return (
                <div key={msg.id} ref={isFinalAi ? lastAiMsgRef : undefined}>
                  {!isUser && (
                    <div className="flex items-center justify-between mb-1.5 px-1 group">
                      <div className="flex items-center gap-2">
                        <Avatar name={aiName} src={character?.avatar} />
                        <span className="text-xs font-medium text-muted-foreground">{aiName}</span>
                        {msg.generateDuration != null && (
                          <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                            {msg.generateDuration < 1000
                              ? `${msg.generateDuration}ms`
                              : msg.generateDuration < 60000
                                ? `${(msg.generateDuration / 1000).toFixed(1)}s`
                                : `${Math.floor(msg.generateDuration / 60000)}m ${Math.round((msg.generateDuration % 60000) / 1000)}s`}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          title="Copy"
                          onClick={() => handleCopy(msg.content, msg.id)}
                        >
                          {copiedId === msg.id ? <CheckCheck className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          title="Edit"
                          onClick={() => startEdit(msg)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          title="View full prompt"
                          onClick={showPromptDialog}
                        >
                          <ScrollText className="h-3.5 w-3.5" />
                        </Button>
                        {msg.reasoningContent && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-purple-400"
                            title="View AI thinking"
                            onClick={() => setThinkingMsg(msg)}
                          >
                            <Brain className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {isLastAi(msg) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            title="Regenerate"
                            onClick={() => { if (!sending) regenerate() }}
                            disabled={sending}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          title="Delete"
                          onClick={() => setDeleteMsgTarget(msg)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                    {isUser && <Avatar name="You" isUser />}

                    <div className={`max-w-[75%] min-w-0 ${isUser ? 'items-end' : 'items-start'}`}>
                      {isUser && (
                        <div className="flex items-center justify-end gap-1 mb-1.5 px-1 opacity-0 hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            title="Copy"
                            onClick={() => handleCopy(msg.content, msg.id)}
                          >
                            {copiedId === msg.id ? <CheckCheck className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            title="Delete"
                            onClick={() => setDeleteMsgTarget(msg)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}

                      {editingMsgId === msg.id ? (
                        <div className="w-full">
                          <Textarea
                            value={editContent}
                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditContent(e.target.value)}
                            onKeyDown={handleEditKeyDown}
                            className="min-h-[80px] text-sm font-mono"
                            autoFocus
                          />
                          <div className="flex gap-1 mt-1 justify-end">
                            <Button variant="ghost" size="sm" onClick={cancelEdit}>
                              <X className="h-3.5 w-3.5 mr-1" />Cancel
                            </Button>
                            <Button size="sm" onClick={saveEdit} disabled={!editContent.trim()}>
                              <Check className="h-3.5 w-3.5 mr-1" />Save (Ctrl+Enter)
                            </Button>
                          </div>
                        </div>
                      ) : isUser ? (
                        <Card className="bg-primary text-primary-foreground">
                          <CardContent className="p-3">
                            <p className="whitespace-pre-wrap" style={{ fontSize: `${fontSize}px` }}>{displayContent}</p>
                          </CardContent>
                        </Card>
                      ) : split?.displayBlocks && split.displayBlocks.length > 0 ? (
                        <Card>
                          <CardContent className="p-3 space-y-2">
                            {split.displayBlocks.map((block: DisplayBlock, bi: number) =>
                              block.type === 'dialogue' ? (
                                <div key={bi} className="bg-accent/60 border border-border/50 rounded-lg p-3 relative mt-3 first:mt-0">
                                  <span className="absolute -top-2.5 left-3 bg-primary text-primary-foreground text-[10px] font-semibold px-2 py-0.5 rounded-full">
                                    {block.speaker}
                                  </span>
                                  <p className="whitespace-pre-wrap pt-0.5" style={{ fontSize: `${fontSize}px` }}>{block.content}</p>
                                </div>
                              ) : (
                                <p key={bi} className="whitespace-pre-wrap" style={{ fontSize: `${fontSize}px` }}>{block.content}</p>
                              )
                            )}
                          </CardContent>
                        </Card>
                      ) : (
                        <Card>
                          <CardContent className="p-3">
                            <p className="whitespace-pre-wrap" style={{ fontSize: `${fontSize}px` }}>{displayContent}</p>
                          </CardContent>
                        </Card>
                      )}

                      {split?.sideBlocks.map((side, si) => (
                        <div key={si} style={{ fontSize: `${fontSize}px` }}>
                          <SideBlockView side={side} fontSize={fontSize} onAction={setInput} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
            {sending && (
              <div>
                <div className="flex items-center gap-2 mb-1.5 px-1">
                  <Avatar name={character?.name ?? 'AI'} src={character?.avatar} />
                  <span className="text-xs font-medium text-muted-foreground">{character?.name ?? 'AI'}</span>
                  <span className="text-xs text-muted-foreground animate-pulse ml-1">thinking...</span>
                </div>
                <div className="flex gap-3">
                  <div className="w-8 shrink-0" />
                  <Card className="max-w-[75%]">
                    <CardContent className="p-3">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {displayError && (
          <div className="px-4 py-2 mx-4 mb-2 rounded-lg bg-destructive/10 text-destructive text-sm flex items-center justify-between">
            <span className="truncate">{displayError}</span>
            <div className="flex gap-1 shrink-0">
              <Button variant="ghost" size="sm" onClick={() => { clearSendError(); clearError() }}>Dismiss</Button>
            </div>
          </div>
        )}

        <div className="border-t p-3">
          <div className="max-w-4xl mx-auto flex items-center gap-2">
            <div className="flex-1 flex gap-2">
              <Input
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={character ? `Message ${character.name}...` : 'Type a message...'}
                disabled={sending || !currentChat}
              />
              <Button onClick={handleSend} disabled={!input.trim() || sending || !currentChat} size="icon">
                <Send className="h-4 w-4" />
              </Button>
              {sending && (
                <Button variant="destructive" size="icon" onClick={abort} title="Stop generating">
                  <StopCircle className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPreviewOpen(!previewOpen)
                  if (!previewOpen && input.trim()) updatePreview(input.trim())
                }}
                className="shrink-0"
              >
                {previewOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                Preview
              </Button>
            </div>
            <div className="flex items-center gap-1 shrink-0 px-1">
              <span className="text-[10px] text-muted-foreground leading-none">A</span>
              <input
                type="range"
                min="12"
                max="22"
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="w-12 h-1 accent-primary cursor-pointer"
                title={`Font size: ${fontSize}px`}
              />
              <span className="text-[13px] font-bold text-muted-foreground leading-none">A</span>
            </div>
          </div>
        </div>

        {previewOpen && (
          <div className="border-t p-4 bg-muted/30">
            <div className="max-w-3xl mx-auto">
              <pre className="text-xs whitespace-pre-wrap font-mono text-muted-foreground max-h-64 overflow-auto">{previewText || 'Type a message to see prompt preview'}</pre>
            </div>
          </div>
        )}
      </div>

      <Dialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Full Prompt</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[60vh]">
            <pre className="text-xs whitespace-pre-wrap font-mono text-muted-foreground">{previewText || '(no prompt data)'}</pre>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPromptDialogOpen(false)}>Close</Button>
            <Button variant="outline" onClick={() => { navigator.clipboard.writeText(previewText); toast('success', 'Copied') }}>
              <Copy className="h-3.5 w-3.5 mr-1" />Copy Prompt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={tokenDialogOpen} onOpenChange={setTokenDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Token Usage &amp; Cache Hit
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[60vh]">
            {usageMessages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No usage data yet. Send a message to see stats.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
                  <div className="min-w-0 bg-accent/50 rounded-lg p-3 text-center" title={totalPrompt.toLocaleString()}>
                    <p className="text-lg font-bold tabular-nums leading-tight truncate">{formatCompactToken(totalPrompt)}</p>
                    <p className="text-[10px] text-muted-foreground">Prompt</p>
                  </div>
                  <div className="min-w-0 bg-accent/50 rounded-lg p-3 text-center" title={totalCompletion.toLocaleString()}>
                    <p className="text-lg font-bold tabular-nums leading-tight truncate">{formatCompactToken(totalCompletion)}</p>
                    <p className="text-[10px] text-muted-foreground">Completion</p>
                  </div>
                  <div className="min-w-0 bg-accent/50 rounded-lg p-3 text-center" title={(totalPrompt + totalCompletion).toLocaleString()}>
                    <p className="text-lg font-bold tabular-nums leading-tight truncate">{formatCompactToken(totalPrompt + totalCompletion)}</p>
                    <p className="text-[10px] text-muted-foreground">Total</p>
                  </div>
                  <div className="min-w-0 bg-emerald-500/10 rounded-lg p-3 text-center" title={totalCacheHit.toLocaleString()}>
                    <p className="text-lg font-bold tabular-nums leading-tight truncate text-emerald-600">{formatCompactToken(totalCacheHit)}</p>
                    <p className="text-[10px] text-muted-foreground">Cache Hit</p>
                  </div>
                  <div className="min-w-0 bg-blue-500/10 rounded-lg p-3 text-center" title={`${cacheRate}%`}>
                    <p className="text-lg font-bold tabular-nums leading-tight truncate text-blue-600">{cacheRate}%</p>
                    <p className="text-[10px] text-muted-foreground">Hit Rate</p>
                  </div>
                  <div className="min-w-0 bg-purple-500/10 rounded-lg p-3 text-center" title={contextUsageTitle}>
                    <p className={`text-lg font-bold tabular-nums leading-tight truncate ${contextUsageTone}`}>{contextUsageDisplay}</p>
                    <p className="text-[10px] text-muted-foreground">1M Context</p>
                  </div>
                </div>
                {cacheRate === '-' && (
                  <p className="text-xs text-muted-foreground mb-2 px-1">
                    ⚠ Cache hit data unavailable — your API may not support prompt caching (Ollama/vLLM most instances do not). Supported by DeepSeek, OpenAI recent models, Anthropic.
                  </p>
                )}
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted">
                        <th className="text-left p-2">#</th>
                        <th className="text-right p-2">Prompt</th>
                        <th className="text-right p-2">Completion</th>
                        <th className="text-right p-2">Total</th>
                        <th className="text-right p-2">🔥 Hit</th>
                        <th className="text-right p-2">📉 Miss</th>
                        <th className="text-right p-2">Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usageMessages.map((m, i) => {
                        const p = m.usage?.promptTokens || 0
                        const c = m.usage?.completionTokens || 0
                        const t = m.usage?.totalTokens || 0
                        const h = m.usage?.cacheHitTokens || 0
                        const ms = m.usage?.cacheMissTokens ?? (p - h)
                        const r = p > 0 ? ((h / p) * 100).toFixed(1) : '-'
                        return (
                          <tr key={m.id} className="border-t">
                            <td className="p-2 text-muted-foreground">{i + 1}</td>
                            <td className="p-2 text-right">{p.toLocaleString()}</td>
                            <td className="p-2 text-right">{c.toLocaleString()}</td>
                            <td className="p-2 text-right">{t.toLocaleString()}</td>
                            <td className="p-2 text-right text-emerald-600">{h > 0 ? h.toLocaleString() : '-'}</td>
                            <td className="p-2 text-right text-orange-500">{ms > 0 ? ms.toLocaleString() : '-'}</td>
                            <td className="p-2 text-right">{r}{r !== '-' ? '%' : ''}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTokenDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteMsgTarget} onOpenChange={() => setDeleteMsgTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Message</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Delete this message? If it's a user message followed by an AI reply, the AI reply will also be deleted.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteMsgTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteMessage}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!thinkingMsg} onOpenChange={() => setThinkingMsg(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-purple-400" />
              AI Thinking
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[60vh]">
            <pre className="text-xs whitespace-pre-wrap font-mono text-muted-foreground bg-muted/40 p-4 rounded-lg">{thinkingMsg?.reasoningContent || '(no thinking data)'}</pre>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setThinkingMsg(null)}>Close</Button>
            <Button variant="outline" onClick={() => { navigator.clipboard.writeText(thinkingMsg?.reasoningContent || ''); toast('success', 'Copied') }}>
              <Copy className="h-3.5 w-3.5 mr-1" />Copy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
