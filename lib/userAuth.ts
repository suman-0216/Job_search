import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { getSupabaseAdmin } from './supabaseAdmin'

export interface AppUserRecord {
  id: string
  email: string
  username: string
  full_name: string
  password_hash: string
  email_verified: boolean
  verification_code?: string | null
  verification_expires_at?: string | null
}

export const findUserByIdentifier = async (identifier: string): Promise<AppUserRecord | null> => {
  const supabase = getSupabaseAdmin()
  const normalized = identifier.trim().toLowerCase()

  const byUsername = await supabase
    .from('app_users')
    .select('id,email,username,full_name,password_hash,email_verified,verification_code,verification_expires_at')
    .eq('username', normalized)
    .maybeSingle()
  if (byUsername.error) throw new Error(`Failed to find user by username: ${byUsername.error.message}`)
  if (byUsername.data) return byUsername.data as AppUserRecord

  const byEmail = await supabase
    .from('app_users')
    .select('id,email,username,full_name,password_hash,email_verified,verification_code,verification_expires_at')
    .eq('email', normalized)
    .maybeSingle()
  if (byEmail.error) throw new Error(`Failed to find user by email: ${byEmail.error.message}`)
  return (byEmail.data as AppUserRecord | null) || null
}

export const verifyPassword = async (plainPassword: string, hash: string): Promise<boolean> =>
  bcrypt.compare(plainPassword, hash)

export const updatePassword = async (userId: string, newPassword: string): Promise<void> => {
  const supabase = getSupabaseAdmin()
  const passwordHash = await bcrypt.hash(newPassword, 10)
  const { error } = await supabase
    .from('app_users')
    .update({ password_hash: passwordHash, updated_at: new Date().toISOString() })
    .eq('id', userId)
  if (error) throw new Error(`Failed to update password: ${error.message}`)
}

export const createUser = async (params: {
  email: string
  username: string
  fullName: string
  password: string
}): Promise<{ id: string; username: string; email: string }> => {
  const supabase = getSupabaseAdmin()
  const email = params.email.trim().toLowerCase()
  const username = params.username.trim().toLowerCase()
  const fullName = params.fullName.trim()

  const existingEmail = await supabase.from('app_users').select('id').eq('email', email).maybeSingle()
  if (existingEmail.error) throw new Error(`Failed to check email: ${existingEmail.error.message}`)
  if (existingEmail.data) throw new Error('Email already in use')

  const existingUsername = await supabase.from('app_users').select('id').eq('username', username).maybeSingle()
  if (existingUsername.error) throw new Error(`Failed to check username: ${existingUsername.error.message}`)
  if (existingUsername.data) throw new Error('Username already in use')

  const passwordHash = await bcrypt.hash(params.password, 10)
  const { data, error } = await supabase
    .from('app_users')
    .insert({
      email,
      username,
      full_name: fullName || username,
      password_hash: passwordHash,
      email_verified: false,
    })
    .select('id,email,username')
    .single()
  if (error || !data) throw new Error(error?.message || 'Failed to create user')

  const { error: settingsError } = await supabase.from('user_settings').upsert(
    {
      user_id: data.id,
    },
    { onConflict: 'user_id' },
  )
  if (settingsError) throw new Error(`Failed to create default settings: ${settingsError.message}`)

  return { id: data.id, email: data.email, username: data.username }
}

const sendVerificationEmail = async (email: string, code: string): Promise<void> => {
  const resendApiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.RESEND_FROM_EMAIL
  if (!resendApiKey || !fromEmail) {
    throw new Error('Email provider is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL.')
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [email],
      subject: 'Verify your Job Hunter account',
      html: `<p>Your verification code is <strong>${code}</strong>.</p><p>This code expires in 15 minutes.</p>`,
    }),
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(`Failed to send verification email: ${message}`)
  }
}

export const createOrRefreshVerificationCode = async (email: string): Promise<void> => {
  const supabase = getSupabaseAdmin()
  const normalizedEmail = email.trim().toLowerCase()
  const user = await findUserByIdentifier(normalizedEmail)
  if (!user) throw new Error('User not found')

  const code = String(crypto.randomInt(100000, 1000000))
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

  const { error } = await supabase
    .from('app_users')
    .update({
      verification_code: code,
      verification_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)
  if (error) throw new Error(`Failed to set verification code: ${error.message}`)

  await sendVerificationEmail(normalizedEmail, code)
}

export const verifyEmailCode = async (email: string, code: string): Promise<{ id: string; username: string } | null> => {
  const supabase = getSupabaseAdmin()
  const normalizedEmail = email.trim().toLowerCase()

  const { data, error } = await supabase
    .from('app_users')
    .select('id,username,verification_code,verification_expires_at')
    .eq('email', normalizedEmail)
    .maybeSingle()
  if (error) throw new Error(`Failed to verify code: ${error.message}`)
  if (!data) return null

  if (!data.verification_code || data.verification_code !== code.trim()) return null
  const expiresAt = Date.parse(String(data.verification_expires_at || ''))
  if (Number.isNaN(expiresAt) || expiresAt < Date.now()) return null

  const { error: updateError } = await supabase
    .from('app_users')
    .update({
      email_verified: true,
      verification_code: null,
      verification_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', data.id)
  if (updateError) throw new Error(`Failed to mark email verified: ${updateError.message}`)

  return { id: data.id, username: data.username }
}
