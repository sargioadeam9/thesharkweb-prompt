export type AiMode = 'enhance' | 'generate'

export type AiStatus = {
  available: boolean
  reason: null | 'ai_unavailable' | 'quota_exhausted' | 'pro_required'
  plan: string
  used: number
  limit: number | null
  period: string
}

export type AiRunResult = {
  text: string
}

export type AiTestModelResult = {
  model: string
  ok: boolean
  ms: number
  errorCode: string | null
  sample: string | null
}

export type AiTestResult = {
  ok: boolean
  servedBy: string | null
  plan: string
  results: AiTestModelResult[]
}

export type AiAdminConfig = {
  enabled: boolean
  baseUrl: string
  defaultModel: string
  maskedKey: string
  systemPrompt: string
  temperature: number
  maxTokens: number
  request_timeout_ms: number
  total_budget_ms: number
  max_attempts: number
  planModels: Record<string, string[]>
  planLimits: Record<string, number | null>
  monthly_budget_usd: number | null
  price_per_million_in: number | null
  price_per_million_out: number | null
}
