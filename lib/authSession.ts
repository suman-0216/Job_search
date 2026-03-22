import crypto from 'crypto'
import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseAdmin } from './supabaseAdmin'

const COOKIE_NAME = 'job_hunt_auth'
const SESSION_DAYS = 30

export interface SessionUser {
  id: string
  email: string
  username: string
  fullName: string
}

const getCookieToken = (req: NextApiRequest): string | null => {
  const rawCookie = req.headers.cookie || ''
  const item = rawCookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`))
  if (!item) return null
  const token = item.slice(`${COOKIE_NAME}=`.length).trim()
  return token || null
}

export const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex')

const makeCookie = (token: string, maxAgeSeconds: number): string => {
  const isProd = process.env.NODE_ENV === 'production'
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${isProd ? '; Secure' : ''}`
}

export const clearSessionCookie = (res: NextApiResponse): void => {
  const isProd = process.env.NODE_ENV === 'production'
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isProd ? '; Secure' : ''}`)
}

export const createSession = async (res: NextApiResponse, userId: string): Promise<void> => {
  const supabase = getSupabaseAdmin()
  const token = crypto.randomBytes(32).toString('hex')
  const tokenHash = hashToken(token)

  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { error } = await supabase.from('app_sessions').insert({
    user_id: userId,
    token_hash: tokenHash,
    expires_at: expiresAt,
  })
  if (error) throw new Error(`Failed to create session: ${error.message}`)

  res.setHeader('Set-Cookie', makeCookie(token, SESSION_DAYS * 24 * 60 * 60))
}

export const getSessionUser = async (req: NextApiRequest): Promise<SessionUser | null> => {
  const token = getCookieToken(req)
  if (!token) return null

  const supabase = getSupabaseAdmin()
  const tokenHash = hashToken(token)
  const { data, error } = await supabase
    .from('app_sessions')
    .select('id,user_id,expires_at')
    .eq('token_hash', tokenHash)
    .single()

  if (error || !data) return null

  const expiresAt = Date.parse(String(data.expires_at || ''))
  if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
    await supabase.from('app_sessions').delete().eq('token_hash', tokenHash)
    return null
  }

  const { data: userRow, error: userError } = await supabase
    .from('app_users')
    .select('id,email,username,full_name')
    .eq('id', data.user_id)
    .maybeSingle()

  if (userError || !userRow) return null

  return {
    id: userRow.id,
    email: userRow.email,
    username: userRow.username,
    fullName: userRow.full_name || userRow.username,
  }
}

export const destroySession = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  const token = getCookieToken(req)
  if (token) {
    const supabase = getSupabaseAdmin()
    await supabase.from('app_sessions').delete().eq('token_hash', hashToken(token))
  }
  clearSessionCookie(res)
}
