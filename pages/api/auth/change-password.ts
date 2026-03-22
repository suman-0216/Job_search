import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionUser } from '../../../lib/authSession'
import { getSupabaseAdmin, getSupabaseAuthClient, isSupabaseAuthConfigured, isSupabaseConfigured } from '../../../lib/supabaseAdmin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!isSupabaseConfigured() || !isSupabaseAuthConfigured()) {
    return res.status(500).json({ error: 'Supabase env is not configured' })
  }

  const sessionUser = await getSessionUser(req)
  if (!sessionUser) return res.status(401).json({ error: 'Unauthorized' })

  const currentPassword = String(req.body?.currentPassword || '')
  const newPassword = String(req.body?.newPassword || '')
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Both current and new password are required' })
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' })
  }

  const authClient = getSupabaseAuthClient()
  const supabase = getSupabaseAdmin()
  const { error: verifyError } = await authClient.auth.signInWithPassword({
    email: sessionUser.email,
    password: currentPassword,
  })
  if (verifyError) return res.status(401).json({ error: 'Current password is incorrect' })

  const { error: updateError } = await supabase.auth.admin.updateUserById(sessionUser.id, {
    password: newPassword,
  })
  if (updateError) return res.status(500).json({ error: updateError.message || 'Failed to update password' })
  return res.status(200).json({ ok: true })
}
