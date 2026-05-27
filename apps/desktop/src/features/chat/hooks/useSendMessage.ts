import { useState, useCallback } from 'react'
import { useChatStore } from '../chat.store'
import { useSettingsStore } from '@/features/settings/settings.store'
import { presetRepository } from '@/db/repositories'
import { buildChatPrompt, createModelProvider, stripPromptContent, WorldbookContributor } from '@neo-tavern/core'
import type { Character, BuiltPrompt, Message } from '@neo-tavern/shared'
import type { GenerationPhase } from '../chat.types'
import { useWorldbookStore } from '@/features/settings/worldbook.store'

interface UseSendMessageOptions {
  character: Character | undefined
  chatId: string | undefined
  onPromptBuilt?: (built: BuiltPrompt) => void
}

interface SendMessageOptions {
  hiddenUserMessage?: boolean
}

interface UseSendMessageReturn {
  sendMessage: (content: string, options?: SendMessageOptions) => Promise<void>
  regenerate: () => Promise<void>
  abort: () => void
  sending: boolean
  sendingChatId: string | null
  streamingMessageId: string | null
  generationPhase: GenerationPhase | null
  error: string | null
  clearError: () => void
}

let activeAbortController: AbortController | null = null
let activeGenerationId: string | null = null

export function useSendMessage({ character, chatId, onPromptBuilt }: UseSendMessageOptions): UseSendMessageReturn {
  const [error, setError] = useState<string | null>(null)
  const addMessage = useChatStore((s) => s.addMessage)
  const patchMessage = useChatStore((s) => s.patchMessage)
  const deleteMessage = useChatStore((s) => s.deleteMessage)
  const sending = useChatStore((s) => s.sending)
  const sendingChatId = useChatStore((s) => s.sendingChatId)
  const streamingMessageId = useChatStore((s) => s.streamingMessageId)
  const generationPhase = useChatStore((s) => s.generationPhase)
  const beginSending = useChatStore((s) => s.beginSending)
  const setStreamingMessageId = useChatStore((s) => s.setStreamingMessageId)
  const setGenerationPhase = useChatStore((s) => s.setGenerationPhase)
  const finishSending = useChatStore((s) => s.finishSending)

  const beginGeneration = (nextChatId: string, controller: AbortController) => {
    const generationId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    activeAbortController = controller
    activeGenerationId = generationId
    beginSending(nextChatId)
    setError(null)
    return generationId
  }

  const finishGeneration = (generationId: string | null, finishedChatId?: string) => {
    if (activeGenerationId && generationId && activeGenerationId !== generationId) return
    activeAbortController = null
    activeGenerationId = null
    finishSending(finishedChatId)
  }

  const abort = useCallback(() => {
    if (activeAbortController) {
      activeAbortController.abort()
      activeAbortController = null
    }
  }, [])

  const stripMessages = (msgs: Message[]): Message[] => {
    const rules = useSettingsStore.getState().getActiveRegexRules()
    if (!rules || rules.length === 0) return msgs
    return msgs.map((m) =>
      m.role === 'assistant'
        ? { ...m, content: stripPromptContent(m.content, rules) }
        : m
    )
  }

  const removeEmptyStreamingDraft = async () => {
    const draftId = useChatStore.getState().streamingMessageId
    if (!draftId) return
    const draft = useChatStore.getState().messages.find((m) => m.id === draftId)
    if (draft && !draft.content.trim() && !draft.reasoningContent?.trim()) {
      await deleteMessage(draftId)
    }
  }

  const getWorldbookContextBlocks = async (userInput: string, recentMessages: Message[]) => {
    const { worldbooks, activeWorldbookId } = useWorldbookStore.getState()
    if (!activeWorldbookId || !character) return []
    const wb = worldbooks.find((w) => w.id === activeWorldbookId)
    if (!wb || wb.entries.length === 0) return []
    const contributor = new WorldbookContributor()
    contributor.setEntries(wb.entries)
    return contributor.contribute({
      character,
      recentMessages,
      userInput,
    })
  }

  const sendMessage = useCallback(async (content: string, options: SendMessageOptions = {}) => {
    const trimmedContent = content.trim()
    if (!trimmedContent || !chatId || !character) return

    const controller = new AbortController()
    const generationId = beginGeneration(chatId, controller)

    try {
      if (!options.hiddenUserMessage) {
        await addMessage({
          chatId,
          role: 'user',
          content: trimmedContent,
        })
      }

      const { messages: recentMessages } = useChatStore.getState()
      const contextTokens = useSettingsStore.getState().contextTokens || 64000

      const activePresetId = await presetRepository.getActivePresetId()
      let presetItems: { role: 'system' | 'user'; content: string; injectionOrder: number }[] | undefined
      if (activePresetId) {
        const preset = await presetRepository.getById(activePresetId)
        if (preset) {
          presetItems = preset.items
            .filter((i) => i.enabled)
            .map((i) => ({
              role: i.role,
              content: i.content,
              injectionOrder: i.injectionOrder,
            }))
        }
      }

      const historyMessages = options.hiddenUserMessage ? recentMessages : recentMessages.slice(0, -1)

      const built = buildChatPrompt({
        character,
        recentMessages: stripMessages(historyMessages) as Message[],
        userInput: trimmedContent,
        maxTotalTokens: contextTokens,
        presetItems,
        contextBlocks: await getWorldbookContextBlocks(trimmedContent, recentMessages),
        userName: useSettingsStore.getState().personaName,
      })

      if (onPromptBuilt) {
        onPromptBuilt(built)
      }

      const modelConfig = useSettingsStore.getState().modelConfig
      if (!modelConfig) {
        throw new Error('Model not configured. Please set up API settings first.')
      }

      const provider = createModelProvider(modelConfig)
      const genStart = Date.now()
      const assistant = await addMessage({
        chatId,
        role: 'assistant',
        content: '',
      })
      setStreamingMessageId(assistant.id)

      let nextContent = ''
      let nextReasoningContent = ''
      let nextUsage: Awaited<ReturnType<typeof provider.generate>>['usage'] | undefined
      let thinkingDuration: number | undefined
      const showLiveText = modelConfig.streamingEnabled !== false

      if (provider.streamGenerate) {
        for await (const chunk of provider.streamGenerate({
          messages: built.messages,
          model: modelConfig.model,
          temperature: modelConfig.temperature,
          maxTokens: modelConfig.maxTokens,
          reasoningEffort: modelConfig.reasoningEffort || undefined,
          signal: controller.signal,
        })) {
          if (activeGenerationId !== generationId) break
          if (chunk.reasoningContentDelta) {
            nextReasoningContent += chunk.reasoningContentDelta
            if (useChatStore.getState().generationPhase !== 'writing') {
              setGenerationPhase('thinking')
            }
          }
          if (chunk.contentDelta) {
            thinkingDuration ??= Date.now() - genStart
            nextContent += chunk.contentDelta
            setGenerationPhase('writing')
          }
          if (chunk.usage) nextUsage = chunk.usage
          if (chunk.reasoningContentDelta || chunk.contentDelta || chunk.usage) {
            await patchMessage(assistant.id, {
              content: showLiveText ? nextContent : '',
              reasoningContent: nextReasoningContent || undefined,
              thinkingDuration,
              usage: nextUsage,
            }, { persist: false })
          }
        }
      } else {
        const result = await provider.generate({
          messages: built.messages,
          model: modelConfig.model,
          temperature: modelConfig.temperature,
          maxTokens: modelConfig.maxTokens,
          reasoningEffort: modelConfig.reasoningEffort || undefined,
          signal: controller.signal,
        })
        thinkingDuration = Date.now() - genStart
        setGenerationPhase('writing')
        await patchMessage(assistant.id, {
          content: '',
          reasoningContent: result.reasoningContent || undefined,
          thinkingDuration,
          usage: result.usage,
        }, { persist: false })
        nextContent = result.content
        nextReasoningContent = result.reasoningContent ?? ''
        nextUsage = result.usage
      }
      thinkingDuration ??= Date.now() - genStart

      await patchMessage(assistant.id, {
        content: nextContent,
        reasoningContent: nextReasoningContent || undefined,
        generateDuration: Date.now() - genStart,
        thinkingDuration,
        usage: nextUsage,
      })
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setError('Generation stopped')
      } else {
        setError((err as Error).message || 'Failed to send message')
      }
      await removeEmptyStreamingDraft()
    } finally {
      finishGeneration(generationId, chatId)
    }
  }, [character, chatId, addMessage, patchMessage, deleteMessage, onPromptBuilt])

  const clearError = useCallback(() => setError(null), [])

  const regenerate = useCallback(async () => {
    if (!chatId || !character) return

    const controller = new AbortController()
    const generationId = beginGeneration(chatId, controller)

    try {
      const { messages: allMessages } = useChatStore.getState()

      let lastAssistantIdx = -1
      for (let i = allMessages.length - 1; i >= 0; i--) {
        if (allMessages[i].role === 'assistant') {
          lastAssistantIdx = i
          break
        }
      }
      if (lastAssistantIdx < 0) {
        setError('No AI response to regenerate')
        return
      }

      const lastAssistantMsg = allMessages[lastAssistantIdx]
      await deleteMessage(lastAssistantMsg.id)

      let lastUserIdx = lastAssistantIdx - 1
      while (lastUserIdx >= 0 && allMessages[lastUserIdx].role !== 'user') lastUserIdx--
      if (lastUserIdx < 0) {
        setError('No user message found to regenerate from')
        return
      }
      const userContent = allMessages[lastUserIdx].content

      const afterDelete = useChatStore.getState().messages
      const contextTokens = useSettingsStore.getState().contextTokens || 64000

      const activePresetId = await presetRepository.getActivePresetId()
      let presetItems: { role: 'system' | 'user'; content: string; injectionOrder: number }[] | undefined
      if (activePresetId) {
        const preset = await presetRepository.getById(activePresetId)
        if (preset) {
          presetItems = preset.items
            .filter((i) => i.enabled)
            .map((i) => ({ role: i.role, content: i.content, injectionOrder: i.injectionOrder }))
        }
      }

      const historyMessages = afterDelete.slice(0, -1)

      const built = buildChatPrompt({
        character,
        recentMessages: stripMessages(historyMessages) as Message[],
        userInput: userContent,
        maxTotalTokens: contextTokens,
        presetItems,
        contextBlocks: await getWorldbookContextBlocks(userContent, afterDelete),
        userName: useSettingsStore.getState().personaName,
      })

      if (onPromptBuilt) onPromptBuilt(built)

      const modelConfig = useSettingsStore.getState().modelConfig
      if (!modelConfig) throw new Error('Model not configured. Please set up API settings first.')

      const provider = createModelProvider(modelConfig)
      const genStart = Date.now()
      const assistant = await addMessage({
        chatId,
        role: 'assistant',
        content: '',
      })
      setStreamingMessageId(assistant.id)

      let nextContent = ''
      let nextReasoningContent = ''
      let nextUsage: Awaited<ReturnType<typeof provider.generate>>['usage'] | undefined
      let thinkingDuration: number | undefined
      const showLiveText = modelConfig.streamingEnabled !== false

      if (provider.streamGenerate) {
        for await (const chunk of provider.streamGenerate({
          messages: built.messages,
          model: modelConfig.model,
          temperature: modelConfig.temperature,
          maxTokens: modelConfig.maxTokens,
          reasoningEffort: modelConfig.reasoningEffort || undefined,
          signal: controller.signal,
        })) {
          if (activeGenerationId !== generationId) break
          if (chunk.reasoningContentDelta) {
            nextReasoningContent += chunk.reasoningContentDelta
            if (useChatStore.getState().generationPhase !== 'writing') {
              setGenerationPhase('thinking')
            }
          }
          if (chunk.contentDelta) {
            thinkingDuration ??= Date.now() - genStart
            nextContent += chunk.contentDelta
            setGenerationPhase('writing')
          }
          if (chunk.usage) nextUsage = chunk.usage
          if (chunk.reasoningContentDelta || chunk.contentDelta || chunk.usage) {
            await patchMessage(assistant.id, {
              content: showLiveText ? nextContent : '',
              reasoningContent: nextReasoningContent || undefined,
              thinkingDuration,
              usage: nextUsage,
            }, { persist: false })
          }
        }
      } else {
        const result = await provider.generate({
          messages: built.messages,
          model: modelConfig.model,
          temperature: modelConfig.temperature,
          maxTokens: modelConfig.maxTokens,
          reasoningEffort: modelConfig.reasoningEffort || undefined,
          signal: controller.signal,
        })
        thinkingDuration = Date.now() - genStart
        setGenerationPhase('writing')
        await patchMessage(assistant.id, {
          content: '',
          reasoningContent: result.reasoningContent || undefined,
          thinkingDuration,
          usage: result.usage,
        }, { persist: false })
        nextContent = result.content
        nextReasoningContent = result.reasoningContent ?? ''
        nextUsage = result.usage
      }
      thinkingDuration ??= Date.now() - genStart

      await patchMessage(assistant.id, {
        content: nextContent,
        reasoningContent: nextReasoningContent || undefined,
        generateDuration: Date.now() - genStart,
        thinkingDuration,
        usage: nextUsage,
      })
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setError('Generation stopped')
      } else {
        setError((err as Error).message || 'Failed to regenerate')
      }
      await removeEmptyStreamingDraft()
    } finally {
      finishGeneration(generationId, chatId)
    }
  }, [character, chatId, addMessage, patchMessage, deleteMessage, onPromptBuilt])

  return { sendMessage, regenerate, abort, sending, sendingChatId, streamingMessageId, generationPhase, error, clearError }
}
