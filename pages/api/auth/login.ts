import type { NextApiRequest, NextApiResponse } from 'next'
import { createSession } from '../../../lib/authSession'
import { getSupabaseAdmin, getSupabaseAuthClient, isSupabaseAuthConfigured, isSupabaseConfigured } from '../../../lib/supabaseAdmin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  if (!isSupabaseConfigured() || !isSupabaseAuthConfigured()) {
    return res.status(500).json({ ok: false, error: 'Supabase env is not configured' })
  }

  try {
    const identifier = String(req.body?.username || req.body?.identifier || req.body?.email || '').trim().toLowerCase()
    const password = String(req.body?.password || '')
    if (!identifier || !password) {
      return res.status(400).json({ ok: false, error: 'Email/username and password are required' })
    }

    const supabase = getSupabaseAdmin()
    const authClient = getSupabaseAuthClient()
    let email = identifier

    if (!identifier.includes('@')) {
      const byUsername = await supabase.from('app_users').select('email').eq('username', identifier).maybeSingle()
      if (byUsername.error) throw new Error(`Failed to find user: ${byUsername.error.message}`)
      if (!byUsername.data?.email) return res.status(401).json({ ok: false, error: 'Invalid credentials' })
      email = String(byUsername.data.email).toLowerCase()
    }

    const { data: signInData, error: signInError } = await authClient.auth.signInWithPassword({
      email,
      password,
    })
    if (signInError) {
      if (/confirm|verified/i.test(signInError.message)) {
        return res.status(403).json({
          ok: false,
          error: 'Email verification required. Please verify from your inbox before login.',
          requiresVerification: true,
          email,
        })
      }
      return res.status(401).json({ ok: false, error: signInError.message || 'Invalid credentials' })
    }
    const authUser = signInData.user
    if (!authUser?.id) return res.status(401).json({ ok: false, error: 'Invalid credentials' })

    const fallbackUsername = email.split('@')[0].toLowerCase()
    const metadata = authUser.user_metadata as { username?: string; full_name?: string } | null
    const { data: existingProfile } = await supabase.from('app_users').select('username,full_name').eq('id', authUser.id).maybeSingle()
    const username = (existingProfile?.username || metadata?.username || fallbackUsername).toLowerCase()
    const fullName = existingProfile?.full_name || metadata?.full_name || username
    const { error: userUpsertError } = await supabase.from('app_users').upsert(
      {
        id: authUser.id,
        email,
        username,
        full_name: fullName,
        password_hash: '__supabase_auth__',
        email_verified: Boolean(authUser.email_confirmed_at),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    )
    if (userUpsertError) throw new Error(`Failed to sync profile user: ${userUpsertError.message}`)

    await createSession(res, authUser.id)
    return res.status(200).json({ ok: true })
  } catch (error) {
    console.error('Auth login failed:', error)
    return res.status(500).json({ ok: false, error: 'Login failed' })
  }
}
