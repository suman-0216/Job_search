import type { NextApiRequest, NextApiResponse } from 'next'

const COOKIE_NAME = 'job_hunt_auth'
const DEFAULT_USERNAME = 'suman'
const DEFAULT_PASSWORD = 'sumansuman'

const getAuthUser = () => (process.env.USERNAME || DEFAULT_USERNAME).trim()
const getAuthPass = () => (process.env.PASSWORD || DEFAULT_PASSWORD).trim()

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const username = String(req.body?.username || '').trim()
  const password = String(req.body?.password || '')
  const normalizedUsername = username.toLowerCase()
  const envUser = getAuthUser().toLowerCase()
  const envPass = getAuthPass()

  const isEnvMatch = normalizedUsername === envUser && password === envPass
  const isDefaultMatch = normalizedUsername === DEFAULT_USERNAME && password === DEFAULT_PASSWORD

  if (!isEnvMatch && !isDefaultMatch) {
    return res.status(401).json({ ok: false, error: 'Invalid credentials' })
  }

  const isProd = process.env.NODE_ENV === 'production'
  const cookie = `${COOKIE_NAME}=1; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${isProd ? '; Secure' : ''}`
  res.setHeader('Set-Cookie', cookie)
  return res.status(200).json({ ok: true })
}
