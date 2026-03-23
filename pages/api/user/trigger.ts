import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionUser } from '../../../lib/authSession'
import { getSupabaseAdmin, isSupabaseConfigured } from '../../../lib/supabaseAdmin'
import { validateLlmProviderModelAndKey } from '../../../lib/llmValidation'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!isSupabaseConfigured()) return res.status(500).json({ error: 'Supabase env is not configured' })

  const user = await getSessionUser(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const supabase = getSupabaseAdmin()
  const { data: existing, error: existingError } = await supabase
    .from('user_run_requests')
    .select('id,status,requested_at')
    .eq('user_id', user.id)
    .in('status', ['queued', 'running'])
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existingError) return res.status(500).json({ error: existingError.message })
  if (existing) {
    return res.status(200).json({ ok: true, request: existing, deduped: true })
  }

  const { data: settings } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  const runTimes = Array.isArray(settings?.run_times) ? settings?.run_times : []
  const targetRoles = Array.isArray(settings?.target_roles) ? settings?.target_roles : []
  const targetLocations = Array.isArray(settings?.target_locations) ? settings?.target_locations : []
  const hasRequiredSettings =
    Boolean(settings?.apify_token) &&
    Boolean(settings?.llm_api_key) &&
    Boolean(settings?.llm_provider) &&
    Boolean(settings?.llm_model) &&
    runTimes.length > 0 &&
    targetRoles.length > 0 &&
    targetLocations.length > 0 &&
    Number(settings?.experience_max ?? 0) >= Number(settings?.experience_min ?? 0) &&
    Boolean(String(settings?.requirements || '').trim())

  if (!hasRequiredSettings) {
    return res.status(400).json({
      error:
        'Complete all settings before trigger: api keys, provider/model, run time, role, location, valid experience range, and additional requirements.',
    })
  }

  const llmValidationError = validateLlmProviderModelAndKey({
    provider: settings?.llm_provider,
    model: settings?.llm_model,
    apiKey: settings?.llm_api_key,
  })
  if (llmValidationError) {
    return res.status(400).json({ error: llmValidationError })
  }

  const { data, error } = await supabase
    .from('user_run_requests')
    .insert({
      user_id: user.id,
      status: 'queued',
      settings_snapshot: settings || {},
    })
    .select('id,status,requested_at')
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ ok: true, request: data })
}
