import type { ModelProvider, GenerateInput, GenerateMessage, GenerateResult, GenerateChunk } from '@neo-tavern/shared'

export interface OpenAICompatibleProviderOptions {
  id: string
  name: string
  baseUrl: string
  apiKey: string
}

export class OpenAICompatibleProvider implements ModelProvider {
  id: string
  name: string
  private baseUrl: string
  private apiKey: string

  constructor(options: OpenAICompatibleProviderOptions) {
    this.id = options.id
    this.name = options.name
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
    this.apiKey = options.apiKey
  }

  static async listModels(baseUrl: string, apiKey: string): Promise<string[]> {
    const url = `${baseUrl.replace(/\/$/, '')}/models`
    const response = await fetch(url, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    })
    if (!response.ok) {
      throw new Error(`Failed to list models: ${response.status}`)
    }
    const data = await response.json() as { data?: Array<{ id: string }> }
    return (data.data || [])
      .map((m: { id: string }) => m.id)
      .sort((a: string, b: string) => a.localeCompare(b))
  }

  async listModels(baseUrl: string, apiKey: string): Promise<string[]> {
    return OpenAICompatibleProvider.listModels(baseUrl, apiKey)
  }

  private mapUsage(data: Record<string, unknown>): GenerateResult['usage'] {
    const usage = data.usage as Record<string, unknown> | undefined;
    const details = usage?.prompt_tokens_details as Record<string, unknown> | undefined;
    return {
      promptTokens: usage?.prompt_tokens as number | undefined,
      completionTokens: usage?.completion_tokens as number | undefined,
      totalTokens: usage?.total_tokens as number | undefined,
      cacheHitTokens: (usage?.prompt_cache_hit_tokens
        ?? details?.cached_tokens) as number | undefined,
      cacheMissTokens: (usage?.prompt_cache_miss_tokens
        ?? (details?.cached_tokens != null
          ? ((usage?.prompt_tokens as number) || 0) - (details?.cached_tokens as number)
          : undefined)) as number | undefined,
    }
  }

  private mapMessages(messages: GenerateMessage[]) {
    return messages.map((message) => {
      if (message.role === 'assistant') {
        return {
          role: message.role,
          content: message.content,
          ...(message.toolCalls ? { tool_calls: message.toolCalls } : {}),
        }
      }
      if (message.role === 'tool') {
        return {
          role: message.role,
          content: message.content,
          tool_call_id: message.toolCallId,
          ...(message.name ? { name: message.name } : {}),
        }
      }
      return message
    })
  }

  async generate(input: GenerateInput): Promise<GenerateResult> {
    const body: Record<string, unknown> = {
      model: input.model,
      messages: this.mapMessages(input.messages),
      max_tokens: input.maxTokens ?? 800,
      ...(input.reasoningEffort ? { reasoning_effort: input.reasoningEffort } : {}),
      ...(input.tools?.length ? { tools: input.tools } : {}),
      ...(input.toolChoice ? { tool_choice: input.toolChoice } : {}),
      ...(input.userId ? { user_id: input.userId } : {}),
    }
    if (!input.omitTemperature) body.temperature = input.temperature ?? 0.8

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal: input.signal,
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(`Model request failed: ${response.status} ${errorText}`)
    }

    const data = await response.json()
    const message = data?.choices?.[0]?.message ?? {}
    const finishReason = data?.choices?.[0]?.finish_reason ?? undefined
    const content = message?.content ?? ''
    const reasoningContent = message?.reasoning_content ?? ''
    const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : undefined

    return {
      content,
      reasoningContent: reasoningContent || undefined,
      toolCalls,
      finishReason,
      raw: data,
      usage: this.mapUsage(data),
    }
  }

  async *streamGenerate(input: GenerateInput): AsyncIterable<GenerateChunk> {
    const body: Record<string, unknown> = {
      model: input.model,
      messages: this.mapMessages(input.messages),
      max_tokens: input.maxTokens ?? 800,
      ...(input.reasoningEffort ? { reasoning_effort: input.reasoningEffort } : {}),
      ...(input.tools?.length ? { tools: input.tools } : {}),
      ...(input.toolChoice ? { tool_choice: input.toolChoice } : {}),
      ...(input.userId ? { user_id: input.userId } : {}),
      stream: true,
      stream_options: { include_usage: true },
    }
    if (!input.omitTemperature) body.temperature = input.temperature ?? 0.8

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal: input.signal,
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(`Model stream request failed: ${response.status} ${errorText}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body')

    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue
          
          const dataStr = trimmed.slice(6)
          if (dataStr === '[DONE]') return

          try {
            const parsed = JSON.parse(dataStr)
            const delta = parsed?.choices?.[0]?.delta ?? {}
            const choice = parsed?.choices?.[0] ?? {}
            const contentDelta = delta?.content ?? ''
            const reasoningContentDelta = delta?.reasoning_content ?? delta?.reasoningContent ?? ''
            const toolCallDeltas = Array.isArray(delta?.tool_calls)
              ? delta.tool_calls.map((toolCall: Record<string, unknown>) => ({
                index: typeof toolCall.index === 'number' ? toolCall.index : 0,
                id: toolCall.id as string | undefined,
                type: toolCall.type as string | undefined,
                function: toolCall.function
                  ? {
                    name: (toolCall.function as Record<string, unknown>).name as string | undefined,
                    arguments: (toolCall.function as Record<string, unknown>).arguments as string | undefined,
                  }
                  : undefined,
              }))
              : undefined
            const finishReason = choice?.finish_reason ?? undefined
            const usage = parsed?.usage ? this.mapUsage(parsed) : undefined
            if (contentDelta || reasoningContentDelta || toolCallDeltas?.length || finishReason || usage) {
              yield { contentDelta, reasoningContentDelta, toolCallDeltas, finishReason, usage, raw: parsed }
            }
          } catch {
            continue
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }
}
