export type NeoBuilderSettings = {
  modelConfig: {
    provider: string
    model: string
    maxTokens?: number
    temperature?: number
    reasoningEffort?: string
  }
  webSearchEnabled: boolean
  deepseekUserIdScope: 'builder-session'
}

// 说明：
// - DeepSeek user_id 使用 builderSessionId 隔离，避免不同 Builder 会话互相污染 KV cache。
// - deepseek-v4-pro 不需要温度设置时，Provider 会自动 omit temperature。
// - 联网搜索由 UI 开关控制，工具不能绕过开关。
