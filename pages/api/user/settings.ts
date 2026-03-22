import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionUser } from '../../../lib/authSession'
import { getSupabaseAdmin, isSupabaseConfigured } from '../../../lib/supabaseAdmin'

const DEFAULT_SETTINGS = {
  apifyToken: '',
  llmProvider: 'openai',
  llmApiKey: '',
  llmModel: '',
  workflowEnabled: true,
  timezone: 'America/Los_Angeles',
  runTimes: ['06:30', '09:00', '12:00'],
  targetRoles: [],
  targetLocations: ['United States', 'California', 'San Francisco Bay Area'],
  experienceMin: 0,
  experienceMax: 3,
  requirements: '',
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isSupabaseConfigured()) return res.status(500).json({ error: 'Supabase env is not configured' })
  const user = await getSessionUser(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const supabase = getSupabaseAdmin()

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) return res.status(500).json({ error: error.message })

    if (!data) {
      return res.status(200).json(DEFAULT_SETTINGS)
    }

    return res.status(200).json({
      apifyToken: data.apify_token || '',
      llmProvider: data.llm_provider || 'openai',
      llmApiKey: data.llm_api_key || '',
      llmModel: data.llm_model || '',
      workflowEnabled: Boolean(data.workflow_enabled),
      timezone: data.timezone || 'America/Los_Angeles',
      runTimes: Array.isArray(data.run_times) ? data.run_times : DEFAULT_SETTINGS.runTimes,
      targetRoles: Array.isArray(data.target_roles) ? data.target_roles : [],
      targetLocations: Array.isArray(data.target_locations) ? data.target_locations : [],
      experienceMin: Number.isFinite(data.experience_min) ? data.experience_min : 0,
      experienceMax: Number.isFinite(data.experience_max) ? data.experience_max : 3,
      requirements: data.requirements || '',
    })
  }

  if (req.method === 'POST') {
    const payload = {
      user_id: user.id,
      apify_token: String(req.body?.apifyToken || ''),
      llm_provider: String(req.body?.llmProvider || 'openai'),
      llm_api_key: String(req.body?.llmApiKey || ''),
      llm_model: String(req.body?.llmModel || ''),
      workflow_enabled: Boolean(req.body?.workflowEnabled),
      timezone: String(req.body?.timezone || 'America/Los_Angeles'),
      run_times: Array.isArray(req.body?.runTimes) ? req.body.runTimes : DEFAULT_SETTINGS.runTimes,
      target_roles: Array.isArray(req.body?.targetRoles) ? req.body.targetRoles : [],
      target_locations: Array.isArray(req.body?.targetLocations) ? req.body.targetLocations : [],
      experience_min: Number.parseInt(String(req.body?.experienceMin ?? 0), 10) || 0,
      experience_max: Number.parseInt(String(req.body?.experienceMax ?? 3), 10) || 3,
      requirements: String(req.body?.requirements || ''),
    }

    const { error } = await supabase.from('user_settings').upsert(payload, { onConflict: 'user_id' })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ error: 'Method not allowed' })
}

