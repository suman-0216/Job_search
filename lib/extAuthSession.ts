import crypto from 'crypto'
import type { NextApiRequest } from 'next'
import { getSupabaseAdmin } from './supabaseAdmin'

const EXT_SESSION_DAYS = 30

export interface ExtensionUser {
  id: string
  email: string
  username: string
  fullName: string
  sessionId: string
}

const hashToken = (token: string): string => crypto.createHash('sha256').update(token).digest('hex')

const getBearerToken = (req: NextApiRequest): string | null => {
  const auth = String(req.headers.authorization || '')
  const match = auth.match(/^Bearer\s+(.+)$/i)
  if (!match) return null
  const token = String(match[1] || '').trim()
  return token || null
}

export const createExtensionSession = async (userId: string): Promise<{ token: string; expiresAt: string }> => {
  const supabase = getSupabaseAdmin()
  const token = crypto.randomBytes(32).toString('hex')
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + EXT_SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { error } = await supabase.from('extension_sessions').insert({
    user_id: userId,
    token_hash: tokenHash,
    expires_at: expiresAt,
    last_used_at: new Date().toISOString(),
  })
  if (error) throw new Error(`Failed to create extension session: ${error.message}`)

  return { token, expiresAt }
}

export const getExtensionUser = async (req: NextApiRequest): Promise<ExtensionUser | null> => {
  const token = getBearerToken(req)
  if (!token) return null

  const supabase = getSupabaseAdmin()
  const tokenHash = hashToken(token)

  const { data: session, error: sessionError } = await supabase
    .from('extension_sessions')
    .select('id,user_id,expires_at,revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (sessionError || !session) return null
  if (session.revoked_at) return null

  const expiresAtMs = Date.parse(String(session.expires_at || ''))
  if (Number.isNaN(expiresAtMs) || expiresAtMs <= Date.now()) return null

  const { data: user, error: userError } = await supabase
    .from('app_users')
    .select('id,email,username,full_name')
    .eq('id', session.user_id)
    .maybeSingle()

  if (userError || !user) return null

  try {
    await supabase.from('extension_sessions').update({ last_used_at: new Date().toISOString() }).eq('id', session.id)
  } catch {
    // best-effort touch only
  }

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    fullName: user.full_name || user.username,
    sessionId: session.id,
  }
}

export const revokeExtensionSession = async (token: string): Promise<void> => {
  const supabase = getSupabaseAdmin()
  const tokenHash = hashToken(token)
  await supabase
    .from('extension_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('token_hash', tokenHash)
}

export const revokeExtensionSessionFromRequest = async (req: NextApiRequest): Promise<void> => {
  const token = getBearerToken(req)
  if (!token) return
  await revokeExtensionSession(token)
}
