import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionUser } from '../../../../lib/authSession'
import { getSupabaseAdmin, isSupabaseConfigured } from '../../../../lib/supabaseAdmin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!isSupabaseConfigured()) return res.status(500).json({ error: 'Supabase env is not configured' })

  const user = await getSessionUser(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('user_run_requests')
    .select('id,status,requested_at,started_at,finished_at,error,settings_snapshot')
    .eq('user_id', user.id)
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return res.status(500).json({ error: error.message })
  if (!data) return res.status(200).json({ run: null })

  const snapshot = (data.settings_snapshot || {}) as Record<string, unknown>
  const progress = (snapshot.run_progress || {}) as Record<string, unknown>
  const logs = Array.isArray(progress.logs) ? progress.logs : []
  const stepStatus =
    progress.step_status && typeof progress.step_status === 'object'
      ? (progress.step_status as Record<string, unknown>)
      : {}
  const runResult =
    snapshot.run_result && typeof snapshot.run_result === 'object'
      ? (snapshot.run_result as Record<string, unknown>)
      : {}
  const sourceStats =
    runResult.source_stats && typeof runResult.source_stats === 'object'
      ? (runResult.source_stats as Record<string, unknown>)
      : {}
  const jobsCount = Array.isArray(runResult.jobs) ? runResult.jobs.length : 0
  const fundedCount = Array.isArray(runResult.funded) ? runResult.funded.length : 0
  const stealthCount = Array.isArray(runResult.stealth) ? runResult.stealth.length : 0
  const sourceFailureDetails = Array.isArray(sourceStats.source_failure_details) ? sourceStats.source_failure_details : []
  const sourceFailures = Array.isArray(sourceStats.source_failures) ? sourceStats.source_failures : []
  const warning = typeof runResult.warning === 'string' ? runResult.warning : null

  return res.status(200).json({
    run: {
      id: data.id,
      status: data.status,
      requestedAt: data.requested_at,
      startedAt: data.started_at,
      finishedAt: data.finished_at,
      error: data.error,
      stage: typeof progress.stage === 'string' ? progress.stage : null,
      percent: typeof progress.percent === 'number' ? progress.percent : null,
      logs,
      stepStatus,
      warning,
      jobsCount,
      fundedCount,
      stealthCount,
      sourceFailures,
      sourceFailureDetails,
    },
  })
}
