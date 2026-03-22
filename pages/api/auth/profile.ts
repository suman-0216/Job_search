import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionUser } from '../../../lib/authSession'
import { isSupabaseConfigured } from '../../../lib/supabaseAdmin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!isSupabaseConfigured()) {
    return res.status(500).json({ error: 'Supabase env is not configured' })
  }

  const user = await getSessionUser(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  return res.status(200).json({
    email: user.email,
    username: user.username,
    fullName: user.fullName,
  })
}
