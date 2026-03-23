const OPENAI_MODELS = new Set(['gpt-5.4', 'gpt-5.4-mini', 'gpt-4.1'])
const GEMINI_MODELS = new Set(['gemini-3.1-pro-preview', 'gemini-3-flash-preview', 'gemini-2.5-flash'])
const CLAUDE_MODELS = new Set(['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'])

const toText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const isCustomModel = (value: string): boolean => value.length >= 3

export const validateLlmProviderModelAndKey = (input: {
  provider: unknown
  model: unknown
  apiKey: unknown
}): string | null => {
  const provider = toText(input.provider).toLowerCase()
  const model = toText(input.model)
  const apiKey = toText(input.apiKey)

  if (!provider) return 'LLM provider is required.'
  if (!apiKey) return 'LLM API key is required.'
  if (!model) return 'LLM model is required.'

  if (provider === 'openai') {
    if (!apiKey.startsWith('sk-')) return 'Invalid OpenAI API key format.'
    if (!OPENAI_MODELS.has(model) && !isCustomModel(model)) return 'Invalid OpenAI model.'
    return null
  }
  if (provider === 'gemini') {
    if (!apiKey.startsWith('AIza')) return 'Invalid Gemini API key format.'
    if (!GEMINI_MODELS.has(model) && !isCustomModel(model)) return 'Invalid Gemini model.'
    return null
  }
  if (provider === 'claude') {
    if (!apiKey.startsWith('sk-ant-')) return 'Invalid Claude API key format.'
    if (!CLAUDE_MODELS.has(model) && !isCustomModel(model)) return 'Invalid Claude model.'
    return null
  }

  return 'Unsupported LLM provider.'
}

