import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionUser } from '../../../lib/authSession'
import { getSupabaseAdmin, isSupabaseConfigured } from '../../../lib/supabaseAdmin'

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
