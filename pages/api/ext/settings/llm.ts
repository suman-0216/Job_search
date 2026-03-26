import type { NextApiRequest, NextApiResponse } from 'next'
import { getExtensionUser } from '../../../../lib/extAuthSession'
import { getSupabaseAdmin, isSupabaseConfigured } from '../../../../lib/supabaseAdmin'
import { validateLlmProviderModelAndKey } from '../../../../lib/llmValidation'
import { auditLog } from '../../../../lib/auditLog'

const ALLOWED_PROVIDERS = new Set(['openai', 'claude', 'gemini'])
const DEFAULT_MODEL_BY_PROVIDER: Record<string, string> = {
  openai: 'gpt-5.4-mini',
  claude: 'claude-sonnet-4-6',
  gemini: 'gemini-3.1-pro-preview',
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isSupabaseConfigured()) return res.status(500).json({ error: 'Supabase env is not configured' })

  const user = await getExtensionUser(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const supabase = getSupabaseAdmin()

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('user_settings')
      .select('llm_provider,llm_api_key,llm_model')
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({
      llmProvider: String(data?.llm_provider || 'openai'),
      llmApiKey: String(data?.llm_api_key || ''),
      llmModel: String(data?.llm_model || DEFAULT_MODEL_BY_PROVIDER[String(data?.llm_provider || 'openai')] || ''),
    })
  }

  if (req.method === 'PUT') {
    const llmProvider = String(req.body?.llmProvider || '').trim().toLowerCase()
    const llmApiKey = String(req.body?.llmApiKey || '').trim()
    const llmModelInput = String(req.body?.llmModel || '').trim()
    const llmModel = llmModelInput || DEFAULT_MODEL_BY_PROVIDER[llmProvider] || ''

    if (!ALLOWED_PROVIDERS.has(llmProvider)) return res.status(400).json({ error: 'Unsupported LLM provider.' })

    const validationError = validateLlmProviderModelAndKey({ provider: llmProvider, model: llmModel, apiKey: llmApiKey })
    if (validationError) return res.status(400).json({ error: validationError })

    const { error } = await supabase
      .from('user_settings')
      .upsert(
        {
          user_id: user.id,
          llm_provider: llmProvider,
          llm_api_key: llmApiKey,
          llm_model: llmModel,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )

    if (error) {
      auditLog('settings.llm.save_failed', { userId: user.id, sessionId: user.sessionId, reason: error.message })
      return res.status(500).json({ error: error.message })
    }

    return res.status(200).json({ ok: true })
  }

  res.setHeader('Allow', 'GET, PUT')
  return res.status(405).json({ error: 'Method not allowed' })
}
