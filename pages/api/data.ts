import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionUser } from '../../lib/authSession'
import { getSupabaseAdmin, isSupabaseConfigured } from '../../lib/supabaseAdmin'

const DEFAULT_LATEST_JOBS_TIME = 5

type UserRunResult = {
  date?: string
  scrapedAt?: string
  timestamp?: string
  jobs?: unknown[]
  funded?: unknown[]
  stealth?: unknown[]
  source_stats?: Record<string, unknown>
}

const toArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])
const toStringValue = (value: unknown): string => (typeof value === 'string' ? value : '')

const parseRunResult = (value: unknown): UserRunResult | null => {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  return {
    date: toStringValue(row.date),
    scrapedAt: toStringValue(row.scrapedAt),
    timestamp: toStringValue(row.timestamp),
    jobs: toArray(row.jobs),
    funded: toArray(row.funded),
    stealth: toArray(row.stealth),
    source_stats: typeof row.source_stats === 'object' && row.source_stats ? (row.source_stats as Record<string, unknown>) : {},
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isSupabaseConfigured()) {
    return res.status(500).json({ error: 'Supabase env is not configured' })
  }

  const user = await getSessionUser(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const latestWindowDays = Number.parseInt(process.env.LATEST_JOBS_TIME || `${DEFAULT_LATEST_JOBS_TIME}`, 10) || DEFAULT_LATEST_JOBS_TIME

  try {
    const supabase = getSupabaseAdmin()

    const { data: runRows, error: runError } = await supabase
      .from('user_run_requests')
      .select('settings_snapshot,finished_at')
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .order('finished_at', { ascending: false })
      .limit(latestWindowDays * 6)

    if (runError) throw new Error(runError.message)

    const personalizedMap = new Map<
      string,
      {
        date: string
        scrapedAt: string
        timestamp: string
        jobs: unknown[]
        funded: unknown[]
        stealth: unknown[]
        source_stats: Record<string, unknown>
      }
    >()

    for (const row of runRows || []) {
      const snapshot = (row.settings_snapshot || {}) as Record<string, unknown>
      const runResult = parseRunResult(snapshot.run_result)
      if (!runResult?.date) continue
      if (personalizedMap.has(runResult.date)) continue

      personalizedMap.set(runResult.date, {
        date: runResult.date,
        scrapedAt: runResult.scrapedAt || toStringValue(row.finished_at) || new Date().toISOString(),
        timestamp: runResult.timestamp || runResult.scrapedAt || toStringValue(row.finished_at) || new Date().toISOString(),
        jobs: toArray(runResult.jobs),
        funded: toArray(runResult.funded),
        stealth: toArray(runResult.stealth),
        source_stats: runResult.source_stats || {},
      })
      if (personalizedMap.size >= latestWindowDays) break
    }

    if (personalizedMap.size > 0) {
      const days = Array.from(personalizedMap.values()).sort((a, b) => b.date.localeCompare(a.date))
      return res.status(200).json({ days, latestWindowDays })
    }

    const { data, error } = await supabase
      .from('job_snapshots')
      .select('snapshot_date,scraped_at,timestamp,jobs,funded,stealth,source_stats')
      .order('snapshot_date', { ascending: false })
      .limit(latestWindowDays)

    if (error) throw new Error(error.message)

    const days = (data || []).map((row) => ({
      date: row.snapshot_date,
      scrapedAt: row.scraped_at,
      timestamp: row.timestamp,
      jobs: Array.isArray(row.jobs) ? row.jobs : [],
      funded: Array.isArray(row.funded) ? row.funded : [],
      stealth: Array.isArray(row.stealth) ? row.stealth : [],
      source_stats: row.source_stats || {},
    }))

    return res.status(200).json({ days, latestWindowDays })
  } catch (error) {
    console.error('Data API error:', error)
    return res.status(500).json({ error: 'Failed to read data from Supabase' })
  }
}
