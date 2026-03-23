import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionUser } from '../../../lib/authSession'
import { getSupabaseAdmin, isSupabaseConfigured } from '../../../lib/supabaseAdmin'
import { validateLlmProviderModelAndKey } from '../../../lib/llmValidation'

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
  sourceConfig: {
    linkedin: true,
    startups: true,
    funded: true,
    stealth: true,
  },
  userData: {
    resumeText: '',
    personalInput: '',
  },
}

const USER_DATA_MARKER = '\n\n[[USER_DATA_JSON]]\n'

type ParsedRequirements = {
  requirementsText: string
  userData: {
    resumeText: string
    personalInput: string
  }
}

const parseStoredRequirements = (rawValue: string): ParsedRequirements => {
  const raw = String(rawValue || '')
  const markerIndex = raw.indexOf(USER_DATA_MARKER)
  if (markerIndex < 0) {
    return {
      requirementsText: raw,
      userData: { resumeText: '', personalInput: '' },
    }
  }

  const requirementsText = raw.slice(0, markerIndex)
  const jsonRaw = raw.slice(markerIndex + USER_DATA_MARKER.length)
  try {
    const parsed = JSON.parse(jsonRaw) as { resumeText?: unknown; personalInput?: unknown }
    return {
      requirementsText,
      userData: {
        resumeText: typeof parsed.resumeText === 'string' ? parsed.resumeText : '',
        personalInput: typeof parsed.personalInput === 'string' ? parsed.personalInput : '',
      },
    }
  } catch {
    return {
      requirementsText: raw,
      userData: { resumeText: '', personalInput: '' },
    }
  }
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

    const parsedRequirements = parseStoredRequirements(String(data.requirements || ''))
    const { data: profileData } = await supabase
      .from('user_profile_data')
      .select('resume_file_name,resume_text,personal_input')
      .eq('user_id', user.id)
      .maybeSingle()

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
      requirements: parsedRequirements.requirementsText,
      sourceConfig:
        data.source_config && typeof data.source_config === 'object'
          ? data.source_config
          : DEFAULT_SETTINGS.sourceConfig,
      userData: {
        resumeFileName: String(profileData?.resume_file_name || ''),
        resumeText: String(profileData?.resume_text || parsedRequirements.userData.resumeText || ''),
        personalInput: String(profileData?.personal_input || parsedRequirements.userData.personalInput || ''),
      },
    })
  }

  if (req.method === 'POST') {
    const userData = {
      resumeText: String(req.body?.userData?.resumeText || '').slice(0, 120_000),
      personalInput: String(req.body?.userData?.personalInput || '').slice(0, 20_000),
    }

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
      source_config:
        req.body?.sourceConfig && typeof req.body.sourceConfig === 'object'
          ? req.body.sourceConfig
          : DEFAULT_SETTINGS.sourceConfig,
    }

    const llmValidationError = validateLlmProviderModelAndKey({
      provider: payload.llm_provider,
      model: payload.llm_model,
      apiKey: payload.llm_api_key,
    })
    if (llmValidationError) return res.status(400).json({ error: llmValidationError })

    const { error } = await supabase.from('user_settings').upsert(payload, { onConflict: 'user_id' })
    if (error) return res.status(500).json({ error: error.message })

    const { error: profileError } = await supabase.from('user_profile_data').upsert(
      {
        user_id: user.id,
        personal_input: userData.personalInput,
        resume_text: userData.resumeText,
      },
      { onConflict: 'user_id' },
    )

    if (profileError) return res.status(500).json({ error: profileError.message })

    return res.status(200).json({ ok: true })
  }

  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ error: 'Method not allowed' })
}
