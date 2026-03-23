import type { NextApiRequest, NextApiResponse } from 'next'
import { enqueueDueRuns, processQueuedRuns } from '../../../lib/userRunQueue'
import { getSupabaseAdmin, isSupabaseConfigured } from '../../../lib/supabaseAdmin'

const isAuthorized = (req: NextApiRequest): boolean => {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  const header = req.headers.authorization || ''
  return header === `Bearer ${expected}`
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!isSupabaseConfigured()) {
    return res.status(500).json({ error: 'Supabase env is not configured' })
  }
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const forceAllActive = req.query.force === '1' || req.query.force === 'true'
  const enqueueOnly = req.query.mode === 'enqueue'
  const processOnly = req.query.mode === 'process'

  try {
    const supabase = getSupabaseAdmin()

    let enqueueSummary: Record<string, unknown> = { skipped: true }
    if (!processOnly) {
      enqueueSummary = await enqueueDueRuns(supabase, { forceAllActive })
    }

    let processSummary: Record<string, unknown> = { skipped: true }
    if (!enqueueOnly) {
      processSummary = await processQueuedRuns(supabase)
    }

    return res.status(200).json({
      ok: true,
      forceAllActive,
      enqueue: enqueueSummary,
      process: processSummary,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to trigger runs',
    })
  }
}

