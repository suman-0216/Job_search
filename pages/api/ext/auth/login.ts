import type { NextApiRequest, NextApiResponse } from 'next'
import { createExtensionSession } from '../../../../lib/extAuthSession'
import { getSupabaseAdmin, getSupabaseAuthClient, isSupabaseAuthConfigured, isSupabaseConfigured } from '../../../../lib/supabaseAdmin'
import { isRateLimited } from '../../../../lib/rateLimit'
import { getClientIp } from '../../../../lib/requestMeta'
import { auditLog } from '../../../../lib/auditLog'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!isSupabaseConfigured() || !isSupabaseAuthConfigured()) {
    return res.status(500).json({ error: 'Supabase env is not configured' })
  }

  const ip = getClientIp(req)
  if (isRateLimited(`ext:auth:login:${ip}`, 20, 5 * 60_000)) {
    auditLog('auth.login.rate_limited', { ip })
    return res.status(429).json({ error: 'Too many login attempts. Please try again shortly.' })
  }

  try {
    const identifier = String(req.body?.username || req.body?.identifier || req.body?.email || '').trim().toLowerCase()
    const password = String(req.body?.password || '')
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Email/username and password are required' })
    }

    const supabase = getSupabaseAdmin()
    const authClient = getSupabaseAuthClient()
    let email = identifier

    if (!identifier.includes('@')) {
      const byUsername = await supabase.from('app_users').select('email').eq('username', identifier).maybeSingle()
      if (byUsername.error) throw new Error(`Failed to find user: ${byUsername.error.message}`)
      if (!byUsername.data?.email) {
        auditLog('auth.login.invalid_identifier', { ip, identifier })
        return res.status(401).json({ error: 'Invalid credentials' })
      }
      email = String(byUsername.data.email).toLowerCase()
    }

    const { data: signInData, error: signInError } = await authClient.auth.signInWithPassword({ email, password })
    if (signInError) {
      if (/confirm|verified/i.test(signInError.message)) {
        auditLog('auth.login.unverified', { ip, email })
        return res.status(403).json({ error: 'Email verification required. Please verify from your inbox before login.', requiresVerification: true, email })
      }
      auditLog('auth.login.failed', { ip, email, reason: signInError.message || 'invalid_credentials' })
      return res.status(401).json({ error: signInError.message || 'Invalid credentials' })
    }

    const authUser = signInData.user
    if (!authUser?.id) {
      auditLog('auth.login.failed', { ip, email, reason: 'missing_user' })
      return res.status(401).json({ error: 'Invalid credentials' })
    }

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

    const session = await createExtensionSession(authUser.id)
    auditLog('auth.login.success', { ip, userId: authUser.id })
    return res.status(200).json({ ok: true, token: session.token, expiresAt: session.expiresAt })
  } catch (error) {
    auditLog('auth.login.error', { ip, reason: error instanceof Error ? error.message : 'unknown' })
    return res.status(500).json({ error: 'Login failed' })
  }
}
