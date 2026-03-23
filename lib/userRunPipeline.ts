import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { validateLlmProviderModelAndKey } from './llmValidation'

type JsonRecord = Record<string, unknown>

type UserSettingsRow = {
  user_id: string
  apify_token: string
  llm_provider: string
  llm_api_key: string
  llm_model: string
  timezone: string
  run_times: unknown
  target_roles: unknown
  target_locations: unknown
  experience_min: number | null
  experience_max: number | null
  requirements: string
  source_config?: unknown
}

type UserProfileDataRow = {
  resume_text: string
  personal_input: string
}

type RunRequestRow = {
  id: string
  user_id: string
  settings_snapshot: JsonRecord | null
}

type SourceConfig = {
  linkedin: boolean
  startups: boolean
  funded: boolean
  stealth: boolean
}

type NormalizedJob = JsonRecord & {
  title: string
  company: string
  location: string
  link: string
  description: string
  source: string
  startup_score: number
}

type HttpRetryError = Error & {
  retryable?: boolean
  retryAfterMs?: number
}

const DEFAULT_MAX_RESULTS = Number.parseInt(process.env.USER_RUN_MAX_RESULTS || '180', 10) || 180
const DEFAULT_TIMEOUT_SECS = Number.parseInt(process.env.USER_RUN_APIFY_TIMEOUT_SECS || '360', 10) || 360
const DEFAULT_POLL_INTERVAL_MS = Number.parseInt(process.env.USER_RUN_APIFY_POLL_INTERVAL_MS || '4000', 10) || 4000
const LLM_BATCH_SIZE = Math.max(1, Number.parseInt(process.env.USER_RUN_LLM_BATCH_SIZE || '5', 10) || 5)
const LLM_TIMEOUT_MS = Math.max(10_000, Number.parseInt(process.env.USER_RUN_LLM_TIMEOUT_MS || '45000', 10) || 45_000)

const ACTOR_IDS = {
  linkedin: process.env.APIFY_ACTOR_LINKEDIN || 'apify/linkedin-jobs-scraper',
  wellfound: process.env.APIFY_ACTOR_WELLFOUND || 'radeance/wellfound-job-listings-scraper',
  yc: process.env.APIFY_ACTOR_YC || 'artemlazarevm/yc-jobs-scraper',
  crunchbase: process.env.APIFY_ACTOR_CRUNCHBASE || 'parseforge/crunchbase-scraper',
  greenhouse: process.env.APIFY_ACTOR_GREENHOUSE || 'bytepulselabs/greenhouse-job-scraper',
  lever: process.env.APIFY_ACTOR_LEVER || 'bytepulselabs/lever-job-scraper',
}

const toStringValue = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')
const normalize = (value: unknown): string => toStringValue(value).toLowerCase()
const toStringList = (value: unknown): string[] => (Array.isArray(value) ? value.map((v) => toStringValue(v)).filter(Boolean) : [])

const getDateInTimezone = (date: Date, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value || '1970'
  const month = parts.find((part) => part.type === 'month')?.value || '01'
  const day = parts.find((part) => part.type === 'day')?.value || '01'
  return `${year}-${month}-${day}`
}

const normalizeActorIdForApi = (actorId: string): string => actorId.replace('/', '~')

const sanitizeUrl = (value: unknown): string => {
  const url = toStringValue(value)
  if (!url) return ''
  try {
    return new URL(url).toString()
  } catch {
    return ''
  }
}

const parseSourceConfig = (value: unknown): SourceConfig => {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  return {
    linkedin: raw.linkedin !== false,
    startups: raw.startups !== false,
    funded: raw.funded !== false,
    stealth: raw.stealth !== false,
  }
}

const dedupeJobs = (jobs: NormalizedJob[]): NormalizedJob[] => {
  const seen = new Set<string>()
  return jobs.filter((job) => {
    const hashInput = normalize(job.link) || `${normalize(job.title)}|${normalize(job.company)}|${normalize(job.location)}`
    const key = createHash('sha1').update(hashInput).digest('hex')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const scoreJob = (job: JsonRecord, settings: UserSettingsRow): number => {
  const text = normalize(`${job.title || ''} ${job.description || ''}`)
  const roleMatches = toStringList(settings.target_roles).filter((role) => text.includes(role.toLowerCase())).length
  const locationText = normalize(job.location || '')
  const locationMatches = toStringList(settings.target_locations).filter((location) => locationText.includes(location.toLowerCase())).length
  let score = 5.2 + Math.min(2.8, roleMatches * 0.9) + Math.min(1.6, locationMatches * 0.8)
  if (text.includes('founding')) score += 0.5
  if (text.includes('ai') || text.includes('machine learning') || text.includes('ml')) score += 0.4
  return Number(Math.max(0, Math.min(9.9, score)).toFixed(1))
}

const wait = async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const withRetry = async <T>(
  fn: () => Promise<T>,
  options?: { retries?: number; baseMs?: number; maxMs?: number },
): Promise<T> => {
  const retries = options?.retries ?? 3
  const baseMs = options?.baseMs ?? 1200
  const maxMs = options?.maxMs ?? 12000
  let attempt = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn()
    } catch (error) {
      const err = error as HttpRetryError
      attempt += 1
      const shouldRetry = Boolean(err.retryable) && attempt <= retries
      if (!shouldRetry) throw err
      const retryAfter = err.retryAfterMs || 0
      const backoff = Math.min(maxMs, baseMs * 2 ** (attempt - 1))
      const jitter = Math.floor(Math.random() * 350)
      await wait(Math.max(retryAfter, backoff + jitter))
    }
  }
}

const toRetryError = (message: string, status?: number, retryAfterMs?: number): HttpRetryError => {
  const err = new Error(message) as HttpRetryError
  err.retryable = Boolean(status && (status === 429 || status === 408 || status >= 500))
  err.retryAfterMs = retryAfterMs
  return err
}

const parseRetryAfterMs = (header: string | null): number | undefined => {
  if (!header) return undefined
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const when = Date.parse(header)
  if (Number.isNaN(when)) return undefined
  return Math.max(0, when - Date.now())
}

const runApifyActor = async (token: string, actorId: string, input: JsonRecord): Promise<JsonRecord[]> => {
  const actorRef = normalizeActorIdForApi(actorId)
  return withRetry(async () => {
    const startResponse = await fetch(`https://api.apify.com/v2/acts/${actorRef}/runs?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!startResponse.ok) {
      throw toRetryError(`Failed to start actor ${actorId}`, startResponse.status, parseRetryAfterMs(startResponse.headers.get('retry-after')))
    }
    const startPayload = (await startResponse.json()) as { data?: { id?: string } }
    const runId = startPayload?.data?.id
    if (!runId) throw new Error(`Actor ${actorId} did not return run id`)

    const startedAt = Date.now()
    while (Date.now() - startedAt < DEFAULT_TIMEOUT_SECS * 1000) {
      await wait(DEFAULT_POLL_INTERVAL_MS)
      const statusResponse = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`)
      if (!statusResponse.ok) {
        throw toRetryError(`Failed reading run status for ${actorId}`, statusResponse.status, parseRetryAfterMs(statusResponse.headers.get('retry-after')))
      }
      const statusPayload = (await statusResponse.json()) as { data?: { status?: string; defaultDatasetId?: string } }
      const status = toStringValue(statusPayload?.data?.status)

      if (status === 'SUCCEEDED') {
        const datasetId = statusPayload?.data?.defaultDatasetId
        if (!datasetId) return []
        const itemsResponse = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&limit=${DEFAULT_MAX_RESULTS}`)
        if (!itemsResponse.ok) {
          throw toRetryError(`Failed reading dataset for ${actorId}`, itemsResponse.status, parseRetryAfterMs(itemsResponse.headers.get('retry-after')))
        }
        const items = (await itemsResponse.json()) as JsonRecord[]
        return Array.isArray(items) ? items : []
      }
      if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
        throw new Error(`Actor ${actorId} run failed with status ${status}`)
      }
    }

    throw toRetryError(`Actor ${actorId} timed out`, 408)
  })
}

const buildRunQueries = (settings: UserSettingsRow): { roles: string[]; locations: string[] } => ({
  roles: toStringList(settings.target_roles).slice(0, 3),
  locations: toStringList(settings.target_locations).slice(0, 3),
})

const normalizeJob = (row: JsonRecord, source: string, settings: UserSettingsRow): NormalizedJob | null => {
  const title = toStringValue(row.title || row.jobTitle || row.role)
  const link = sanitizeUrl(row.link || row.url || row.jobUrl)
  if (!title || !link) return null

  const company = toStringValue(row.company || row.companyName || row.organization || row.name) || 'Unknown company'
  const location = toStringValue(row.location || row.jobLocation || row.city) || 'Location not listed'
  const description = toStringValue(row.description || row.summary || row.content || row.jobDescription)

  const normalized: NormalizedJob = {
    title,
    company,
    location,
    description,
    link,
    postedAt: toStringValue(row.postedAt || row.timestamp || new Date().toISOString()),
    employmentType: toStringValue(row.employmentType || row.jobType || 'Full-time'),
    applicantsCount: row.applicantsCount ?? row.applicants ?? 0,
    workRemoteAllowed: Boolean(row.workRemoteAllowed || /remote/i.test(location)),
    source,
    startup_score: scoreJob({ title, description, location }, settings),
    timestamp: new Date().toISOString(),
  }
  return normalized
}

const scrapeLinkedIn = async (settings: UserSettingsRow): Promise<NormalizedJob[]> => {
  const { roles, locations } = buildRunQueries(settings)
  const searches = roles.flatMap((role) =>
    locations.map((location) => ({
      keywords: role,
      location,
      experienceLevel: Number(settings.experience_max ?? 3) <= 3 ? 'Entry level' : 'Mid-Senior level',
    })),
  )
  const items = await runApifyActor(settings.apify_token, ACTOR_IDS.linkedin, {
    searches: searches.slice(0, 12),
    maxResults: DEFAULT_MAX_RESULTS,
  })
  return dedupeJobs(items.map((row) => normalizeJob(row, 'linkedin', settings)).filter((row): row is NormalizedJob => Boolean(row)))
}

const scrapeStartups = async (settings: UserSettingsRow): Promise<NormalizedJob[]> => {
  const { roles, locations } = buildRunQueries(settings)
  const wellfoundItems = await runApifyActor(settings.apify_token, ACTOR_IDS.wellfound, {
    searchQueries: roles.flatMap((role) => locations.map((location) => ({ role, location }))).slice(0, 12),
    maxResults: Math.min(80, DEFAULT_MAX_RESULTS),
  })

  const ycItems = await runApifyActor(settings.apify_token, ACTOR_IDS.yc, {
    searchQuery: roles.join(' OR ') || 'software engineer',
    location: locations[0] || 'United States',
    maxResults: Math.min(80, DEFAULT_MAX_RESULTS),
  })

  const combined = [...wellfoundItems, ...ycItems]
  return dedupeJobs(combined.map((row) => normalizeJob(row, 'startups', settings)).filter((row): row is NormalizedJob => Boolean(row)))
}

const normalizeFundedItem = (row: JsonRecord): JsonRecord | null => {
  const title = toStringValue(row.title || row.company_name || row.company || row.name)
  const link = sanitizeUrl(row.link || row.url || row.website || row.companyUrl || row.company_url)
  if (!title || !link) return null
  return {
    title,
    company_name: toStringValue(row.company_name || row.company || row.name || title),
    location: toStringValue(row.location || row.city || 'Location not listed'),
    funding_amount: toStringValue(row.funding_amount || row.lastFundingAmount || row.totalFundingUsd || row.total_funding || 'N/A'),
    round_type: toStringValue(row.round_type || row.lastFundingType || row.fundingStage || 'N/A'),
    link,
    article_url: link,
    published_date: toStringValue(row.published_date || row.timestamp || new Date().toISOString()),
    ceo_name: toStringValue(row.ceo_name || row.founder || row.founders || 'N/A'),
    domain: toStringValue(row.domain || row.website || ''),
    outreach_hook: toStringValue(row.outreach_hook || row.description || ''),
    source: 'funded',
  }
}

const scrapeFunded = async (settings: UserSettingsRow): Promise<JsonRecord[]> => {
  const { locations } = buildRunQueries(settings)
  const date = new Date()
  date.setMonth(date.getMonth() - 6)
  const since = date.toISOString().split('T')[0]
  const location = locations[0] || 'United States'

  const crunchbaseItems = await runApifyActor(settings.apify_token, ACTOR_IDS.crunchbase, {
    searchQueries: [`${location} funded:>=${since}`],
    maxResults: 30,
  })

  return crunchbaseItems.map((row) => normalizeFundedItem(row)).filter((row): row is JsonRecord => Boolean(row))
}

const normalizeStealthItem = (row: JsonRecord): JsonRecord | null => {
  const title = toStringValue(row.title || row.company || row.company_name || row.name || 'Stealth startup')
  const link = sanitizeUrl(row.link || row.url || row.website || row.companyUrl || row.company_url)
  if (!link) return null
  return {
    title,
    company: toStringValue(row.company || row.company_name || row.name || title),
    description: toStringValue(row.description || row.summary || ''),
    location: toStringValue(row.location || row.city || 'Location not listed'),
    link,
    domain: toStringValue(row.domain || row.website || ''),
    source: 'stealth',
  }
}

const scrapeStealth = async (settings: UserSettingsRow): Promise<JsonRecord[]> => {
  const { roles, locations } = buildRunQueries(settings)
  const location = locations[0] || 'United States'

  const [wellfoundStealth, crunchbaseStealth] = await Promise.all([
    runApifyActor(settings.apify_token, ACTOR_IDS.wellfound, {
      searchQueries: roles.flatMap((role) => locations.map((loc) => ({ role, location: loc, companyStage: 'Stealth' }))).slice(0, 8),
      maxResults: 30,
    }),
    runApifyActor(settings.apify_token, ACTOR_IDS.crunchbase, {
      searchQueries: [`stealth mode ${location}`],
      maxResults: 20,
    }),
  ])

  return [...wellfoundStealth, ...crunchbaseStealth].map((row) => normalizeStealthItem(row)).filter((row): row is JsonRecord => Boolean(row))
}

const buildLLMPrompt = (jobs: NormalizedJob[], settings: UserSettingsRow, profileData: UserProfileDataRow | null): string => {
  const roles = toStringList(settings.target_roles).join(', ')
  const locations = toStringList(settings.target_locations).join(', ')
  const resumeText = toStringValue(profileData?.resume_text || '').slice(0, 7000)
  const personalInput = toStringValue(profileData?.personal_input || '').slice(0, 3000)
  const jobsPayload = jobs.map((job, idx) => ({
    idx,
    title: job.title,
    company: job.company,
    location: job.location,
    description: toStringValue(job.description).slice(0, 3500),
    salary: toStringValue(job.salary),
    link: job.link,
  }))

  return [
    'You are a job matching and outreach assistant.',
    'Return strictly valid JSON array with objects:',
    '{ idx, match_score (0-100), match_reason, key_requirements (max 5), linkedin_dm, cold_email_subject, cold_email_body }',
    'No markdown and no extra text.',
    '',
    `Target roles: ${roles}`,
    `Target locations: ${locations}`,
    `Experience range: ${settings.experience_min ?? 0}-${settings.experience_max ?? 3} years`,
    `Additional requirements: ${toStringValue(settings.requirements).slice(0, 1800)}`,
    `Resume text: ${resumeText || '[not provided]'}`,
    `Personal input: ${personalInput || '[not provided]'}`,
    '',
    `Jobs: ${JSON.stringify(jobsPayload)}`,
  ].join('\n')
}

const fetchWithTimeout = async (url: string, init: RequestInit): Promise<Response> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

const callOpenAI = async (apiKey: string, model: string, prompt: string): Promise<string> =>
  withRetry(async () => {
    const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, temperature: 0.2, messages: [{ role: 'user', content: prompt }] }),
    })
    if (!response.ok) throw toRetryError(`OpenAI error ${response.status}`, response.status, parseRetryAfterMs(response.headers.get('retry-after')))
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
    return payload.choices?.[0]?.message?.content || '[]'
  })

const callClaude = async (apiKey: string, model: string, prompt: string): Promise<string> =>
  withRetry(async () => {
    const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens: 2500, temperature: 0.2, messages: [{ role: 'user', content: prompt }] }),
    })
    if (!response.ok) throw toRetryError(`Claude error ${response.status}`, response.status, parseRetryAfterMs(response.headers.get('retry-after')))
    const payload = (await response.json()) as { content?: Array<{ type?: string; text?: string }> }
    return payload.content?.find((item) => item.type === 'text')?.text || '[]'
  })

const callGemini = async (apiKey: string, model: string, prompt: string): Promise<string> =>
  withRetry(async () => {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
    const response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2 } }),
    })
    if (!response.ok) throw toRetryError(`Gemini error ${response.status}`, response.status, parseRetryAfterMs(response.headers.get('retry-after')))
    const payload = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    return payload.candidates?.[0]?.content?.parts?.[0]?.text || '[]'
  })

const safeJsonArray = (raw: string): JsonRecord[] => {
  const trimmed = raw.trim()
  try {
    const parsed = JSON.parse(trimmed)
    return Array.isArray(parsed) ? (parsed as JsonRecord[]) : []
  } catch {
    const start = trimmed.indexOf('[')
    const end = trimmed.lastIndexOf(']')
    if (start < 0 || end <= start) return []
    try {
      const parsed = JSON.parse(trimmed.slice(start, end + 1))
      return Array.isArray(parsed) ? (parsed as JsonRecord[]) : []
    } catch {
      return []
    }
  }
}

const enrichJobsWithLLM = async (jobs: NormalizedJob[], settings: UserSettingsRow, profileData: UserProfileDataRow | null): Promise<NormalizedJob[]> => {
  if (jobs.length === 0) return jobs

  const validationError = validateLlmProviderModelAndKey({
    provider: settings.llm_provider,
    model: settings.llm_model,
    apiKey: settings.llm_api_key,
  })
  if (validationError) return jobs

  const provider = normalize(settings.llm_provider)
  const result = [...jobs]
  for (let i = 0; i < jobs.length; i += LLM_BATCH_SIZE) {
    const batch = jobs.slice(i, i + LLM_BATCH_SIZE)
    const prompt = buildLLMPrompt(batch, settings, profileData)
    try {
      const raw =
        provider === 'openai'
          ? await callOpenAI(settings.llm_api_key, settings.llm_model, prompt)
          : provider === 'claude'
            ? await callClaude(settings.llm_api_key, settings.llm_model, prompt)
            : await callGemini(settings.llm_api_key, settings.llm_model, prompt)
      const parsed = safeJsonArray(raw)
      for (const row of parsed) {
        const idx = Number(row.idx)
        if (!Number.isFinite(idx) || idx < 0 || idx >= batch.length) continue
        const absolute = i + idx
        const keyRequirements = Array.isArray(row.key_requirements) ? row.key_requirements.map((k) => String(k)).slice(0, 5) : []
        result[absolute] = {
          ...result[absolute],
          llm_match_score: Math.max(0, Math.min(100, Number(row.match_score) || 0)),
          llm_match_reason: toStringValue(row.match_reason),
          llm_key_requirements: keyRequirements,
          outreach_linkedin_dm: toStringValue(row.linkedin_dm),
          outreach_email_subject: toStringValue(row.cold_email_subject),
          outreach_email_body: toStringValue(row.cold_email_body),
        }
      }
    } catch {
      // Keep existing jobs for this batch if provider call fails.
    }
  }
  return result
}

const updateRunRow = async (supabase: SupabaseClient, runId: string, patch: JsonRecord) => {
  await supabase.from('user_run_requests').update(patch).eq('id', runId)
}

const appendProgress = async (
  supabase: SupabaseClient,
  runId: string,
  snapshot: JsonRecord,
  stage: string,
  percent: number,
  message: string,
) => {
  const current = (snapshot.run_progress && typeof snapshot.run_progress === 'object'
    ? (snapshot.run_progress as JsonRecord)
    : {}) as JsonRecord
  const logs = (Array.isArray(current.logs) ? current.logs : []) as JsonRecord[]
  const nextLogs = [...logs, { at: new Date().toISOString(), stage, message }].slice(-40)
  snapshot.run_progress = {
    stage,
    percent: Math.max(0, Math.min(100, percent)),
    logs: nextLogs,
  }
  await updateRunRow(supabase, runId, { settings_snapshot: snapshot })
}

const runSourcesWithFallback = async (
  settings: UserSettingsRow,
  sourceConfig: SourceConfig,
): Promise<{
  linkedinJobs: NormalizedJob[]
  startupJobs: NormalizedJob[]
  fundedItems: JsonRecord[]
  stealthItems: JsonRecord[]
  failures: string[]
}> => {
  const tasks: Array<{ key: keyof SourceConfig; name: string; run: () => Promise<unknown> }> = []
  if (sourceConfig.linkedin) tasks.push({ key: 'linkedin', name: 'linkedin', run: () => scrapeLinkedIn(settings) })
  if (sourceConfig.startups) tasks.push({ key: 'startups', name: 'startups', run: () => scrapeStartups(settings) })
  if (sourceConfig.funded) tasks.push({ key: 'funded', name: 'funded', run: () => scrapeFunded(settings) })
  if (sourceConfig.stealth) tasks.push({ key: 'stealth', name: 'stealth', run: () => scrapeStealth(settings) })

  const output = {
    linkedinJobs: [] as NormalizedJob[],
    startupJobs: [] as NormalizedJob[],
    fundedItems: [] as JsonRecord[],
    stealthItems: [] as JsonRecord[],
    failures: [] as string[],
  }

  const settled = await Promise.allSettled(tasks.map((task) => task.run()))
  const failedTaskIndexes: number[] = []
  settled.forEach((result, idx) => {
    const task = tasks[idx]
    if (result.status === 'fulfilled') {
      if (task.key === 'linkedin') output.linkedinJobs = (result.value as NormalizedJob[]) || []
      if (task.key === 'startups') output.startupJobs = (result.value as NormalizedJob[]) || []
      if (task.key === 'funded') output.fundedItems = (result.value as JsonRecord[]) || []
      if (task.key === 'stealth') output.stealthItems = (result.value as JsonRecord[]) || []
      return
    }
    failedTaskIndexes.push(idx)
    output.failures.push(`${task.name}: parallel run failed`)
  })

  for (const idx of failedTaskIndexes) {
    const task = tasks[idx]
    try {
      const value = await task.run()
      if (task.key === 'linkedin') output.linkedinJobs = (value as NormalizedJob[]) || []
      if (task.key === 'startups') output.startupJobs = (value as NormalizedJob[]) || []
      if (task.key === 'funded') output.fundedItems = (value as JsonRecord[]) || []
      if (task.key === 'stealth') output.stealthItems = (value as JsonRecord[]) || []
      output.failures = output.failures.filter((msg) => !msg.startsWith(`${task.name}:`))
    } catch {
      output.failures.push(`${task.name}: sequential retry failed`)
    }
  }

  return output
}

const validateSettings = (settings: UserSettingsRow | null): string | null => {
  if (!settings) return 'User settings not found'
  if (!toStringValue(settings.apify_token)) return 'Missing Apify token'
  if (toStringList(settings.run_times).length === 0) return 'At least one run time is required'
  if (toStringList(settings.target_roles).length === 0) return 'At least one target role is required'
  if (toStringList(settings.target_locations).length === 0) return 'At least one target location is required'
  if (Number(settings.experience_max ?? 0) < Number(settings.experience_min ?? 0)) return 'Experience range is invalid'
  if (!toStringValue(settings.requirements)) return 'Additional requirements are required'
  const llmError = validateLlmProviderModelAndKey({
    provider: settings.llm_provider,
    model: settings.llm_model,
    apiKey: settings.llm_api_key,
  })
  if (llmError) return llmError
  return null
}

export const executeRunRequest = async (
  supabase: SupabaseClient,
  runRequest: RunRequestRow,
): Promise<{ runId: string; userId: string; ok: boolean; jobsFound: number; error?: string }> => {
  const snapshot: JsonRecord = { ...(runRequest.settings_snapshot || {}) }
  await appendProgress(supabase, runRequest.id, snapshot, 'starting', 5, 'Run started')

  const { data: settings, error: settingsError } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', runRequest.user_id)
    .maybeSingle<UserSettingsRow>()

  if (settingsError) {
    const message = settingsError.message
    snapshot.run_progress = { stage: 'failed', percent: 100, logs: [{ at: new Date().toISOString(), stage: 'failed', message }] }
    await updateRunRow(supabase, runRequest.id, { status: 'failed', finished_at: new Date().toISOString(), error: message, settings_snapshot: snapshot })
    return { runId: runRequest.id, userId: runRequest.user_id, ok: false, jobsFound: 0, error: message }
  }

  const validationError = validateSettings(settings)
  if (validationError) {
    snapshot.run_progress = { stage: 'failed', percent: 100, logs: [{ at: new Date().toISOString(), stage: 'failed', message: validationError }] }
    await updateRunRow(supabase, runRequest.id, { status: 'failed', finished_at: new Date().toISOString(), error: validationError, settings_snapshot: snapshot })
    return { runId: runRequest.id, userId: runRequest.user_id, ok: false, jobsFound: 0, error: validationError }
  }
  const userSettings = settings as UserSettingsRow
  const sourceConfig = parseSourceConfig(userSettings.source_config)

  const { data: profileDataRow } = await supabase
    .from('user_profile_data')
    .select('resume_text,personal_input')
    .eq('user_id', runRequest.user_id)
    .maybeSingle<UserProfileDataRow>()

  try {
    await appendProgress(supabase, runRequest.id, snapshot, 'scraping', 25, 'Running source scrapers')
    const sources = await runSourcesWithFallback(userSettings, sourceConfig)

    await appendProgress(supabase, runRequest.id, snapshot, 'normalizing', 55, 'Combining and deduplicating jobs')
    const baseJobs = dedupeJobs([...sources.linkedinJobs, ...sources.startupJobs])

    await appendProgress(supabase, runRequest.id, snapshot, 'llm', 75, `Running LLM enrichment in batches of ${LLM_BATCH_SIZE}`)
    const llmJobs = await enrichJobsWithLLM(baseJobs, userSettings, profileDataRow || null)

    await appendProgress(supabase, runRequest.id, snapshot, 'finalizing', 92, 'Saving run result')
    const now = new Date()
    const dayToken = getDateInTimezone(now, 'America/Los_Angeles')
    const runResult: JsonRecord = {
      date: dayToken,
      scrapedAt: now.toISOString(),
      timestamp: now.toISOString(),
      jobs: llmJobs,
      funded: sources.fundedItems,
      stealth: sources.stealthItems,
      source_stats: {
        linkedin_jobs: sources.linkedinJobs.length,
        startups_jobs: sources.startupJobs.length,
        funded_items: sources.fundedItems.length,
        stealth_items: sources.stealthItems.length,
        final_jobs: llmJobs.length,
        llm_batch_size: LLM_BATCH_SIZE,
        llm_provider: userSettings.llm_provider,
        llm_model: userSettings.llm_model,
        source_failures: sources.failures,
      },
    }

    snapshot.run_result = runResult
    snapshot.run_progress = {
      stage: 'completed',
      percent: 100,
      logs: [
        ...(((snapshot.run_progress as JsonRecord)?.logs as JsonRecord[]) || []),
        { at: new Date().toISOString(), stage: 'completed', message: `Completed with ${llmJobs.length} jobs` },
      ].slice(-50),
    }

    await updateRunRow(supabase, runRequest.id, {
      status: 'completed',
      error: null,
      finished_at: new Date().toISOString(),
      settings_snapshot: snapshot,
    })

    return { runId: runRequest.id, userId: runRequest.user_id, ok: true, jobsFound: llmJobs.length }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown run error'
    snapshot.run_progress = {
      stage: 'failed',
      percent: 100,
      logs: [
        ...(((snapshot.run_progress as JsonRecord)?.logs as JsonRecord[]) || []),
        { at: new Date().toISOString(), stage: 'failed', message },
      ].slice(-50),
    }
    await updateRunRow(supabase, runRequest.id, {
      status: 'failed',
      error: message,
      finished_at: new Date().toISOString(),
      settings_snapshot: snapshot,
    })
    return { runId: runRequest.id, userId: runRequest.user_id, ok: false, jobsFound: 0, error: message }
  }
}

