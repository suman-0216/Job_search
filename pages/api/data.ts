import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionUser } from '../../lib/authSession'
import { getSupabaseAdmin, isSupabaseConfigured } from '../../lib/supabaseAdmin'

const DEFAULT_LATEST_JOBS_TIME = 5

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isSupabaseConfigured()) {
    return res.status(500).json({ error: 'Supabase env is not configured' })
  }

  const user = await getSessionUser(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const latestWindowDays = Number.parseInt(process.env.LATEST_JOBS_TIME || `${DEFAULT_LATEST_JOBS_TIME}`, 10) || DEFAULT_LATEST_JOBS_TIME

  try {
    const supabase = getSupabaseAdmin()
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

