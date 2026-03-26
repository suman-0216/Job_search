import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseAdmin, getSupabaseAuthClient, isSupabaseAuthConfigured, isSupabaseConfigured } from '../../../../lib/supabaseAdmin'
import { isRateLimited } from '../../../../lib/rateLimit'
import { getClientIp } from '../../../../lib/requestMeta'
import { auditLog } from '../../../../lib/auditLog'

const isUniqueConflict = (message: string): boolean => /duplicate key value|unique constraint|already in use/i.test(message)
const isAlreadyRegistered = (message: string): boolean => /already registered|user already|email exists/i.test(message)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!isSupabaseConfigured() || !isSupabaseAuthConfigured()) {
    return res.status(500).json({ error: 'Supabase env is not configured' })
  }

  const ip = getClientIp(req)
  if (isRateLimited(`ext:auth:register:${ip}`, 12, 10 * 60_000)) {
    auditLog('auth.register.rate_limited', { ip })
    return res.status(429).json({ error: 'Too many registration attempts. Please try later.' })
  }

  try {
    const email = String(req.body?.email || '').trim().toLowerCase()
    const username = String(req.body?.username || '').trim().toLowerCase()
    const fullName = String(req.body?.fullName || '').trim()
    const password = String(req.body?.password || '')

    if (!email || !username || !password) return res.status(400).json({ error: 'Email, username, and password are required' })
    if (!email.includes('@')) return res.status(400).json({ error: 'Invalid email' })
    if (username.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters' })
    if (!/^[a-z0-9_.-]+$/.test(username)) {
      return res.status(400).json({ error: 'Username can only use lowercase letters, numbers, dot, underscore, and hyphen' })
    }
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' })

    const supabase = getSupabaseAdmin()
    const authClient = getSupabaseAuthClient()

    const emailExists = await supabase.from('app_users').select('id').eq('email', email).maybeSingle()
    if (emailExists.error) throw new Error(`Failed to check email: ${emailExists.error.message}`)
    if (emailExists.data) return res.status(409).json({ error: 'Email already in use' })

    const usernameExists = await supabase.from('app_users').select('id').eq('username', username).maybeSingle()
    if (usernameExists.error) throw new Error(`Failed to check username: ${usernameExists.error.message}`)
    if (usernameExists.data) return res.status(409).json({ error: 'Username already in use' })

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_APP_URL || 'http://localhost:3000'

    const { data: signUpData, error: signUpError } = await authClient.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: appUrl,
        data: { username, full_name: fullName || username },
      },
    })

    if (signUpError) {
      const message = signUpError.message || 'Registration failed'
      if (isAlreadyRegistered(message)) {
        const { error: resendError } = await authClient.auth.resend({ type: 'signup', email, options: { emailRedirectTo: appUrl } })
        if (!resendError) {
          auditLog('auth.register.resend_verification', { ip, email })
          return res.status(200).json({ ok: true, requiresVerification: true, email, message: 'Account already exists. Verification email has been resent.' })
        }
      }
      return res.status(isUniqueConflict(message) ? 409 : 400).json({ error: message })
    }

    const authUser = signUpData.user
    if (!authUser?.id) throw new Error('Failed to create auth user in Supabase')

    const { error: userUpsertError } = await supabase.from('app_users').upsert(
      {
        id: authUser.id,
        email,
        username,
        full_name: fullName || username,
        password_hash: '__supabase_auth__',
        email_verified: Boolean(authUser.email_confirmed_at),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    )
    if (userUpsertError) {
      const message = userUpsertError.message || 'Failed to sync profile user'
      return res.status(isUniqueConflict(message) ? 409 : 500).json({ error: message })
    }

    const { error: settingsError } = await supabase.from('user_settings').upsert({ user_id: authUser.id }, { onConflict: 'user_id' })
    if (settingsError) throw new Error(`Failed to create user settings: ${settingsError.message}`)

    auditLog('auth.register.success', { ip, userId: authUser.id })
    return res.status(200).json({ ok: true, requiresVerification: true, email, message: 'Account created. Check your email and verify, then sign in.' })
  } catch (error) {
    auditLog('auth.register.error', { ip, reason: error instanceof Error ? error.message : 'unknown' })
    const message = error instanceof Error ? error.message : 'Registration failed'
    return res.status(isUniqueConflict(message) ? 409 : 500).json({ error: message })
  }
}
