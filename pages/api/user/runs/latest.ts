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
    .select('id,status,requested_at,started_at,finished_at,error')
    .eq('user_id', user.id)
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return res.status(500).json({ error: error.message })
  if (!data) return res.status(200).json({ run: null })

  return res.status(200).json({
    run: {
      id: data.id,
      status: data.status,
      requestedAt: data.requested_at,
      startedAt: data.started_at,
      finishedAt: data.finished_at,
      error: data.error,
    },
  })
}

